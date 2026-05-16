import 'server-only'

import { debug_event } from '@/lib/debug'
import { derive_presence_recent_from_timestamps } from '@/lib/chat/presence/rules'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { supabase } from '@/lib/db/supabase'

import { evaluate_push_chat_delivery_allowed } from './push_gate'
import { send_push_notify } from './push'
import {
  discord_action_webhook_configured,
  post_discord_action_webhook_message,
} from './discord'

const admin_push_phase = 'lib/notify/admin_push.ts'

type admin_push_target = {
  user_uuid: string
  display_name: string | null
  role: string | null
}

type admin_push_route_input = {
  room_uuid: string | null
  message_uuid: string | null
  title: string
  message: string
  actor_user_uuid: string | null
  source_channel: string
  admin_event: string
}

type admin_push_route_result = {
  outcome: 'delivered' | 'skipped' | 'failed'
  transport: 'push' | 'discord_action_webhook' | 'none'
  deliveries: Array<{ channel: 'push' | 'discord' }>
  http_status?: number | null
  error_code?: string | null
  error_message?: string | null
}

async function emit_admin_push_debug(
  event:
    | 'admin_push_target_resolved'
    | 'admin_push_subscription_found'
    | 'admin_push_subscription_missing'
    | 'admin_push_send_started'
    | 'admin_push_send_succeeded'
    | 'admin_push_send_failed'
    | 'admin_push_skipped_active_in_room'
    | 'admin_push_fallback_discord',
  payload: Record<string, unknown>,
) {
  await debug_event({
    category: 'chat_realtime',
    event,
    payload: {
      phase: admin_push_phase,
      ...payload,
    },
  })
}

function admin_push_discord_content(input: admin_push_route_input) {
  return [
    `[${input.title.toUpperCase()}]`,
    '',
    input.message,
    '',
    `admin_event: ${input.admin_event}`,
    `room_uuid: ${input.room_uuid ?? 'none'}`,
    `message_uuid: ${input.message_uuid ?? 'none'}`,
  ].join('\n')
}

async function load_admin_push_targets(input: {
  room_uuid: string | null
  exclude_user_uuid?: string | null
}): Promise<{
  targets: admin_push_target[]
  active_admin_in_room_count: number
}> {
  const exclude_user_uuid = clean_uuid(input.exclude_user_uuid ?? null)
  const room_uuid = clean_uuid(input.room_uuid)

  const users_result = await supabase
    .from('users')
    .select('user_uuid, display_name, role')
    .in('role', ['admin', 'owner', 'core'])

  if (users_result.error) {
    throw users_result.error
  }

  const targets = ((users_result.data ?? []) as Array<{
    user_uuid: string | null
    display_name: string | null
    role: string | null
  }>)
    .filter(
      (row): row is admin_push_target =>
        typeof row.user_uuid === 'string' &&
        row.user_uuid.length > 0 &&
        row.user_uuid !== exclude_user_uuid,
    )
    .map((row) => ({
      user_uuid: row.user_uuid,
      display_name: row.display_name,
      role: row.role,
    }))

  if (!room_uuid) {
    return { targets, active_admin_in_room_count: 0 }
  }

  const presence_result = await supabase
    .from('participants')
    .select('participant_uuid, user_uuid, role, last_seen_at, is_typing, typing_at')
    .eq('room_uuid', room_uuid)
    .in('role', ['admin', 'concierge'])

  if (presence_result.error) {
    return { targets, active_admin_in_room_count: 0 }
  }

  const now = new Date()
  let active_admin_in_room_count = 0

  for (const row of presence_result.data ?? []) {
    const user_uuid =
      typeof row.user_uuid === 'string' && row.user_uuid.length > 0
        ? row.user_uuid
        : null

    if (exclude_user_uuid && user_uuid === exclude_user_uuid) {
      continue
    }

    if (
      derive_presence_recent_from_timestamps({
        last_seen_at:
          typeof row.last_seen_at === 'string' ? row.last_seen_at : null,
        is_typing: row.is_typing === true,
        typing_at: typeof row.typing_at === 'string' ? row.typing_at : null,
        now,
      })
    ) {
      active_admin_in_room_count += 1
    }
  }

  return { targets, active_admin_in_room_count }
}

export async function route_admin_push_notification(
  input: admin_push_route_input,
): Promise<admin_push_route_result> {
  let targets: admin_push_target[] = []
  let active_admin_in_room_count = 0

  try {
    const loaded = await load_admin_push_targets({
      room_uuid: input.room_uuid,
      exclude_user_uuid: input.actor_user_uuid,
    })
    targets = loaded.targets
    active_admin_in_room_count = loaded.active_admin_in_room_count
  } catch (error) {
    await emit_admin_push_debug('admin_push_target_resolved', {
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      admin_event: input.admin_event,
      target_count: 0,
      active_admin_in_room_count: 0,
      skipped_reason: 'admin_targets_load_failed',
      error_message: error instanceof Error ? error.message : String(error),
    })

    return {
      outcome: 'failed',
      transport: 'none',
      deliveries: [],
      error_code: 'admin_targets_load_failed',
      error_message: error instanceof Error ? error.message : String(error),
    }
  }

  await emit_admin_push_debug('admin_push_target_resolved', {
    room_uuid: input.room_uuid,
    message_uuid: input.message_uuid,
    admin_event: input.admin_event,
    target_count: targets.length,
    active_admin_in_room_count,
    skipped_reason: null,
  })

  if (active_admin_in_room_count > 0) {
    await emit_admin_push_debug('admin_push_skipped_active_in_room', {
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      admin_event: input.admin_event,
      target_count: targets.length,
      active_admin_in_room_count,
      skipped_reason: 'active_admin_in_room',
    })

    return {
      outcome: 'skipped',
      transport: 'none',
      deliveries: [],
      error_code: 'active_admin_in_room',
      error_message: 'active_admin_in_room',
    }
  }

  const push_url = input.room_uuid
    ? `/admin/reception/${encodeURIComponent(input.room_uuid)}`
    : '/admin/reception'

  let any_push_delivered = false

  for (const target of targets) {
    const gate = await evaluate_push_chat_delivery_allowed({
      user_uuid: target.user_uuid,
      source_channel: 'push',
      kind: 'chat',
    })

    if (!gate.push_subscription_enabled) {
      await emit_admin_push_debug('admin_push_subscription_missing', {
        room_uuid: input.room_uuid,
        message_uuid: input.message_uuid,
        admin_user_uuid: target.user_uuid,
        role: target.role,
        admin_event: input.admin_event,
        push_enabled: gate.pwa_push_enabled,
        chat_enabled: gate.chat_enabled,
        disabled_reason: gate.disabled_reason,
      })

      continue
    }

    await emit_admin_push_debug('admin_push_subscription_found', {
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      admin_user_uuid: target.user_uuid,
      role: target.role,
      admin_event: input.admin_event,
      push_enabled: gate.pwa_push_enabled,
      chat_enabled: gate.chat_enabled,
    })

    await emit_admin_push_debug('admin_push_send_started', {
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      admin_user_uuid: target.user_uuid,
      role: target.role,
      admin_event: input.admin_event,
      url: push_url,
    })

    const push = await send_push_notify({
      user_uuid: target.user_uuid,
      title: input.title,
      message: input.message,
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      kind: 'chat',
      url: push_url,
    })

    if (push.ok && push.available) {
      await emit_admin_push_debug('admin_push_send_succeeded', {
        room_uuid: input.room_uuid,
        message_uuid: input.message_uuid,
        admin_user_uuid: target.user_uuid,
        role: target.role,
        admin_event: input.admin_event,
        url: push_url,
      })

      any_push_delivered = true
      continue
    }

    await emit_admin_push_debug('admin_push_send_failed', {
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      admin_user_uuid: target.user_uuid,
      role: target.role,
      admin_event: input.admin_event,
      url: push_url,
      ignored_reason: push.reason ?? 'push_unavailable',
    })
  }

  if (any_push_delivered) {
    return {
      outcome: 'delivered',
      transport: 'push',
      deliveries: [{ channel: 'push' }],
    }
  }

  if (!discord_action_webhook_configured()) {
    return {
      outcome: 'skipped',
      transport: 'none',
      deliveries: [],
      error_code: 'no_pwa_or_discord_fallback',
      error_message: 'no_pwa_or_discord_fallback',
    }
  }

  await emit_admin_push_debug('admin_push_fallback_discord', {
    room_uuid: input.room_uuid,
    message_uuid: input.message_uuid,
    admin_event: input.admin_event,
    target_count: targets.length,
  })

  const webhook_result = await post_discord_action_webhook_message({
    content: admin_push_discord_content(input),
  })

  if (webhook_result.ok) {
    return {
      outcome: 'delivered',
      transport: 'discord_action_webhook',
      deliveries: [{ channel: 'discord' }],
    }
  }

  return {
    outcome: 'failed',
    transport: 'discord_action_webhook',
    deliveries: [],
    http_status: webhook_result.http_status ?? null,
    error_code: 'discord_action_webhook_non_ok',
    error_message: webhook_result.error_text ?? 'webhook_post_failed',
  }
}
