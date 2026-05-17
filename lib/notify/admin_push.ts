import 'server-only'

import { is_reception_state } from '@/lib/admin/reception/rules'
import { derive_presence_recent_from_timestamps } from '@/lib/chat/presence/rules'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { supabase } from '@/lib/db/supabase'
import { debug_event } from '@/lib/debug'
import {
  normalize_notification_preferences,
  type notification_preferences,
} from '@/lib/notification/rules'
import { resolve_push_subscription_enabled_for_notify } from '@/lib/notify/push_gate'

import { send_push_notify } from './push'
import { send_line_push_notify } from './line'
import {
  discord_action_webhook_configured,
  post_discord_action_webhook_message,
} from './discord'

const admin_notification_phase = 'lib/notify/admin_push.ts'

type admin_notification_candidate = {
  user_uuid: string
  role: string | null
  header_status: 'on' | 'off'
  preferences: notification_preferences
  has_push_subscription: boolean
  has_line_identity: boolean
  line_user_id: string | null
  active_in_room: boolean
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
  transport: 'push' | 'line' | 'discord_action_webhook' | 'none'
  deliveries: Array<{ channel: 'push' | 'line' | 'discord' }>
  http_status?: number | null
  error_code?: string | null
  error_message?: string | null
}

type admin_debug_payload = {
  admin_user_uuid?: string | null
  room_uuid?: string | null
  message_uuid?: string | null
  header_status?: string | null
  pwa_enabled?: boolean | null
  line_enabled?: boolean | null
  has_push_subscription?: boolean | null
  has_line_identity?: boolean | null
  selected_method?: string | null
  skipped_reason?: string | null
  role?: string | null
  admin_event?: string | null
}

async function emit_admin_notification_debug(
  event:
    | 'admin_notification_candidate_checked'
    | 'admin_notification_skipped_offline'
    | 'admin_notification_skipped_header_off'
    | 'admin_notification_method_resolved'
    | 'admin_push_send_started'
    | 'admin_push_send_succeeded'
    | 'admin_push_send_failed'
    | 'admin_line_send_started'
    | 'admin_line_send_succeeded'
    | 'admin_discord_fallback_started'
    | 'admin_push_skipped_active_in_room',
  payload: admin_debug_payload,
) {
  await debug_event({
    category: 'chat_realtime',
    event,
    payload: {
      phase: admin_notification_phase,
      ...payload,
    },
  })
}

function admin_notification_discord_content(input: admin_push_route_input) {
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

function resolve_header_status(input: {
  role: string | null
  reception_state: string | null
}): 'on' | 'off' {
  if (input.role !== 'admin') {
    return 'on'
  }

  const state = is_reception_state(input.reception_state)
    ? input.reception_state
    : 'open'

  return state === 'open' ? 'on' : 'off'
}

function resolve_delivery_methods(input: {
  pwa_enabled: boolean
  line_enabled: boolean
  has_push_subscription: boolean
  has_line_identity: boolean
  both_methods_enabled: boolean
}): Array<'push' | 'line'> {
  if (!input.pwa_enabled && !input.line_enabled) {
    return []
  }

  if (input.pwa_enabled && !input.line_enabled) {
    return input.has_push_subscription ? ['push'] : []
  }

  if (!input.pwa_enabled && input.line_enabled) {
    return input.has_line_identity ? ['line'] : []
  }

  const methods: Array<'push' | 'line'> = []

  if (input.has_push_subscription) {
    methods.push('push')
  }

  if (input.both_methods_enabled && input.has_line_identity) {
    methods.push('line')
  }

  return methods
}

async function load_admin_notification_candidates(input: {
  room_uuid: string | null
  exclude_user_uuid?: string | null
}): Promise<admin_notification_candidate[]> {
  const exclude_user_uuid = clean_uuid(input.exclude_user_uuid ?? null)
  const room_uuid = clean_uuid(input.room_uuid)

  const users_result = await supabase
    .from('users')
    .select('user_uuid, role')
    .in('role', ['admin', 'owner', 'core'])

  if (users_result.error) {
    throw users_result.error
  }

  const user_rows = ((users_result.data ?? []) as Array<{
    user_uuid: string | null
    role: string | null
  }>).filter(
    (row): row is { user_uuid: string; role: string | null } =>
      typeof row.user_uuid === 'string' &&
      row.user_uuid.length > 0 &&
      row.user_uuid !== exclude_user_uuid,
  )

  if (user_rows.length === 0) {
    return []
  }

  const user_uuids = user_rows.map((row) => row.user_uuid)
  const admin_user_uuids = user_rows
    .filter((row) => row.role === 'admin')
    .map((row) => row.user_uuid)

  const [receptions_result, settings_result, identities_result, push_result] =
    await Promise.all([
      admin_user_uuids.length > 0
        ? supabase
            .from('receptions')
            .select('user_uuid, state')
            .in('user_uuid', admin_user_uuids)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('settings')
        .select('user_uuid, notification_preferences')
        .in('user_uuid', user_uuids),
      supabase
        .from('identities')
        .select('user_uuid, provider_id')
        .eq('provider', 'line')
        .in('user_uuid', user_uuids),
      supabase
        .from('push_subscriptions')
        .select('user_uuid, endpoint, enabled, updated_at')
        .in('user_uuid', user_uuids)
        .eq('enabled', true)
        .eq('is_pwa', true)
        .not('endpoint', 'is', null)
        .order('updated_at', { ascending: false }),
    ])

  if (receptions_result.error) {
    throw receptions_result.error
  }

  if (settings_result.error) {
    throw settings_result.error
  }

  if (identities_result.error) {
    throw identities_result.error
  }

  if (push_result.error) {
    throw push_result.error
  }

  const reception_state_by_uuid = new Map<string, string>()

  for (const row of receptions_result.data ?? []) {
    if (typeof row.user_uuid === 'string' && row.user_uuid.length > 0) {
      reception_state_by_uuid.set(row.user_uuid, row.state ?? '')
    }
  }

  const preferences_by_uuid = new Map<string, notification_preferences>()

  for (const row of settings_result.data ?? []) {
    if (typeof row.user_uuid !== 'string' || row.user_uuid.length === 0) {
      continue
    }

    preferences_by_uuid.set(
      row.user_uuid,
      normalize_notification_preferences(row.notification_preferences ?? null),
    )
  }

  const line_user_id_by_uuid = new Map<string, string>()

  for (const row of identities_result.data ?? []) {
    if (
      typeof row.user_uuid === 'string' &&
      row.user_uuid.length > 0 &&
      typeof row.provider_id === 'string' &&
      row.provider_id.length > 0 &&
      !line_user_id_by_uuid.has(row.user_uuid)
    ) {
      line_user_id_by_uuid.set(row.user_uuid, row.provider_id)
    }
  }

  const push_subscription_by_uuid = new Map<
    string,
    { endpoint?: string | null; enabled?: boolean | null }
  >()

  for (const row of push_result.data ?? []) {
    if (
      typeof row.user_uuid === 'string' &&
      row.user_uuid.length > 0 &&
      !push_subscription_by_uuid.has(row.user_uuid)
    ) {
      push_subscription_by_uuid.set(row.user_uuid, row)
    }
  }

  const active_user_uuids_in_room = new Set<string>()

  if (room_uuid) {
    const presence_result = await supabase
      .from('participants')
      .select('user_uuid, last_seen_at, is_typing, typing_at')
      .eq('room_uuid', room_uuid)
      .in('role', ['admin', 'concierge'])

    if (!presence_result.error) {
      const now = new Date()

      for (const row of presence_result.data ?? []) {
        const user_uuid =
          typeof row.user_uuid === 'string' && row.user_uuid.length > 0
            ? row.user_uuid
            : null

        if (!user_uuid) {
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
          active_user_uuids_in_room.add(user_uuid)
        }
      }
    }
  }

  return user_rows.map((row) => {
    const line_user_id = line_user_id_by_uuid.get(row.user_uuid) ?? null
    const push_row = push_subscription_by_uuid.get(row.user_uuid) ?? null

    return {
      user_uuid: row.user_uuid,
      role: row.role,
      header_status: resolve_header_status({
        role: row.role,
        reception_state: reception_state_by_uuid.get(row.user_uuid) ?? null,
      }),
      preferences:
        preferences_by_uuid.get(row.user_uuid) ??
        normalize_notification_preferences(null),
      has_push_subscription: resolve_push_subscription_enabled_for_notify(
        push_row,
      ),
      has_line_identity: Boolean(line_user_id),
      line_user_id,
      active_in_room: active_user_uuids_in_room.has(row.user_uuid),
    }
  })
}

export async function route_admin_push_notification(
  input: admin_push_route_input,
): Promise<admin_push_route_result> {
  const push_url = input.room_uuid
    ? `/admin/reception/${encodeURIComponent(input.room_uuid)}`
    : '/admin/reception'

  let candidates: admin_notification_candidate[] = []

  try {
    candidates = await load_admin_notification_candidates({
      room_uuid: input.room_uuid,
      exclude_user_uuid: input.actor_user_uuid,
    })
  } catch (error) {
    return {
      outcome: 'failed',
      transport: 'none',
      deliveries: [],
      error_code: 'admin_targets_load_failed',
      error_message: error instanceof Error ? error.message : String(error),
    }
  }

  let any_delivered = false
  let last_transport: 'push' | 'line' | null = null
  let discord_fallback_eligible = false

  for (const candidate of candidates) {
    const pwa_enabled = candidate.preferences.pwa_push_enabled === true
    const line_enabled = candidate.preferences.line_enabled === true
    const both_methods_enabled = pwa_enabled && line_enabled

    const base_debug: admin_debug_payload = {
      admin_user_uuid: candidate.user_uuid,
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      header_status: candidate.header_status,
      pwa_enabled,
      line_enabled,
      has_push_subscription: candidate.has_push_subscription,
      has_line_identity: candidate.has_line_identity,
      role: candidate.role,
      admin_event: input.admin_event,
    }

    await emit_admin_notification_debug(
      'admin_notification_candidate_checked',
      base_debug,
    )

    if (candidate.header_status === 'off') {
      await emit_admin_notification_debug(
        'admin_notification_skipped_header_off',
        {
          ...base_debug,
          skipped_reason: 'header_off',
        },
      )

      continue
    }

    if (candidate.active_in_room) {
      await emit_admin_notification_debug('admin_push_skipped_active_in_room', {
        ...base_debug,
        skipped_reason: 'active_in_room',
      })

      continue
    }

    if (!pwa_enabled && !line_enabled) {
      await emit_admin_notification_debug(
        'admin_notification_skipped_offline',
        {
          ...base_debug,
          skipped_reason: 'no_method_enabled',
        },
      )

      continue
    }

    const methods = resolve_delivery_methods({
      pwa_enabled,
      line_enabled,
      has_push_subscription: candidate.has_push_subscription,
      has_line_identity: candidate.has_line_identity,
      both_methods_enabled,
    })

    if (methods.length === 0) {
      await emit_admin_notification_debug(
        'admin_notification_skipped_offline',
        {
          ...base_debug,
          skipped_reason: pwa_enabled
            ? 'push_unavailable'
            : line_enabled
              ? 'line_unavailable'
              : 'method_unavailable',
        },
      )

      if (both_methods_enabled) {
        discord_fallback_eligible = true
      }

      continue
    }

    await emit_admin_notification_debug('admin_notification_method_resolved', {
      ...base_debug,
      selected_method: methods.join('->'),
      skipped_reason: null,
    })

    let candidate_delivered = false

    for (const method of methods) {
      if (method === 'push') {
        await emit_admin_notification_debug('admin_push_send_started', {
          ...base_debug,
          selected_method: 'push',
        })

        const push = await send_push_notify({
          user_uuid: candidate.user_uuid,
          title: input.title,
          message: input.message,
          room_uuid: input.room_uuid,
          message_uuid: input.message_uuid,
          kind: 'chat',
          url: push_url,
        })

        if (push.ok && push.available) {
          await emit_admin_notification_debug('admin_push_send_succeeded', {
            ...base_debug,
            selected_method: 'push',
          })

          candidate_delivered = true
          last_transport = 'push'
          break
        }

        await emit_admin_notification_debug('admin_push_send_failed', {
          ...base_debug,
          selected_method: 'push',
          skipped_reason: push.reason ?? 'push_unavailable',
        })

        continue
      }

      if (method === 'line' && candidate.line_user_id) {
        await emit_admin_notification_debug('admin_line_send_started', {
          ...base_debug,
          selected_method: 'line',
        })

        await send_line_push_notify({
          line_user_id: candidate.line_user_id,
          message: input.message,
          title: input.title,
          body: input.message,
          open_url: push_url,
          user_uuid: candidate.user_uuid,
          room_uuid: input.room_uuid,
          message_uuid: input.message_uuid,
          selected_route: 'line',
        })

        await emit_admin_notification_debug('admin_line_send_succeeded', {
          ...base_debug,
          selected_method: 'line',
        })

        candidate_delivered = true
        last_transport = 'line'
        break
      }
    }

    if (candidate_delivered) {
      any_delivered = true
      continue
    }

    if (both_methods_enabled) {
      discord_fallback_eligible = true
    }
  }

  if (any_delivered) {
    const channel = last_transport ?? 'push'

    return {
      outcome: 'delivered',
      transport: channel,
      deliveries: [{ channel }],
    }
  }

  if (!discord_fallback_eligible || !discord_action_webhook_configured()) {
    return {
      outcome: 'skipped',
      transport: 'none',
      deliveries: [],
      error_code: 'no_delivery',
      error_message: 'no_delivery',
    }
  }

  await emit_admin_notification_debug('admin_discord_fallback_started', {
    room_uuid: input.room_uuid,
    message_uuid: input.message_uuid,
    admin_event: input.admin_event,
    selected_method: 'discord',
    skipped_reason: null,
  })

  const webhook_result = await post_discord_action_webhook_message({
    content: admin_notification_discord_content(input),
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
