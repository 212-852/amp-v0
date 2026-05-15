import 'server-only'

import {
  mask_discord_action_id_for_log,
  normalize_discord_thread_action_id,
  post_discord_action_webhook_message,
  discord_action_webhook_configured,
  send_discord_notify,
  short_room_uuid,
  sync_discord_action_context,
} from './discord'
import { send_line_push_notify } from './line'
import { send_push_notify } from './push'
import { env } from '@/lib/config/env'
import { next_public_liff_id } from '@/lib/config/line/env'
import { resolve_chat_external_notification_decision } from '@/lib/notification/rules'
import {
  load_concierge_recipients,
  load_admin_notify_recipients,
  load_line_provider_id_for_user,
  load_participant_last_channel,
  read_requester_display_name,
  type concierge_recipients,
  type notify_recipient,
} from './recipients'
import {
  format_support_left_notify_content,
  format_support_started_notify_content,
  normalize_line_notify_last_channel,
  resolve_concierge_targets,
  resolve_line_new_chat_display_copy,
  resolve_line_new_chat_open_url,
  resolve_notify_rule,
  should_send_notify,
  type notify_event,
} from './rules'
import { evaluate_support_started_notify_gate } from './support_started_gate'

export type notify_delivery_result = {
  channel: 'discord' | 'line' | 'push'
  action_id?: string | null
}

export type support_started_notify_meta = {
  outcome: 'skipped' | 'delivered' | 'failed'
  transport?: string | null
  http_status?: number | null
  error_code?: string | null
  error_message?: string | null
}

export type notify_run_result = {
  deliveries: notify_delivery_result[]
  support_started_meta?: support_started_notify_meta
}

function support_started_notify_run(
  deliveries: notify_delivery_result[],
  meta: support_started_notify_meta,
): notify_run_result {
  return { deliveries, support_started_meta: meta }
}

type personal_delivery_outcome = {
  recipient: notify_recipient
  channel: 'push' | 'line' | 'none'
  ok: boolean
  reason?: string
}

type admin_notification_route_result = {
  outcome: 'skipped' | 'delivered' | 'failed'
  transport: 'toast' | 'push' | 'discord_action_webhook' | 'none'
  deliveries: notify_delivery_result[]
  error_code?: string | null
  error_message?: string | null
  http_status?: number | null
}

export async function notify(
  event: notify_event,
): Promise<notify_run_result> {
  if (event.event === 'new_chat') {
    const route_decision = await resolve_chat_external_notification_decision({
      user_uuid: event.user_uuid,
      participant_uuid: event.participant_uuid ?? null,
      source_channel: event.source_channel,
    })
    const route = route_decision.selected_route

    const route_debug_payload = {
      user_uuid: event.user_uuid,
      room_uuid: event.room_uuid,
      message_uuid: event.message_uuid ?? null,
      primary_channel: route_decision.primary_channel,
      source_channel: event.source_channel,
      is_standalone: route_decision.is_standalone,
      push_subscription_exists: route_decision.push_subscription_exists,
      line_identity_exists: route_decision.line_identity_exists,
      push_enabled: route_decision.push_enabled,
      line_enabled: route_decision.line_enabled,
      selected_route: route_decision.selected_route,
      skipped_reason: route_decision.skipped_reason,
      notification_route: route,
      phase: 'new_chat',
    }

    await notification_route_trace(
      'notify_primary_channel_resolved',
      route_debug_payload,
    )
    await notification_route_trace('notify_route_decided', route_debug_payload)

    if (route === null) {
      await notification_route_trace('notify_route_skipped', {
        ...route_debug_payload,
        phase: 'new_chat_skip',
      })

      return { deliveries: [] }
    }

    if (route === 'push') {
      const push = await send_push_notify({
        user_uuid: event.user_uuid,
        message: event.message,
        room_uuid: event.room_uuid,
        participant_uuid: event.participant_uuid ?? null,
        message_uuid: event.message_uuid ?? null,
        kind: 'chat',
        sender_user_uuid: event.sender_user_uuid ?? null,
        sender_role: event.sender_role ?? null,
      }).catch((error) => ({
        ok: false,
        available: false,
        reason: error instanceof Error ? error.message : 'push_threw',
      }))

      if (push.ok && push.available) {
        await notification_route_trace('notify_push_sent', {
          user_uuid: event.user_uuid,
          room_uuid: event.room_uuid,
          message_uuid: event.message_uuid ?? null,
          notification_route: 'push',
          primary_channel: route,
          is_standalone: route_decision.is_standalone,
          push_subscription_exists: route_decision.push_subscription_exists,
          line_identity_exists: route_decision.line_identity_exists,
          selected_route: 'push',
          skipped_reason: null,
          source_channel: event.source_channel,
          phase: 'new_chat_push',
        })

        return { deliveries: [{ channel: 'push' }] }
      }

      await notification_route_trace('notify_push_failed', {
        user_uuid: event.user_uuid,
        room_uuid: event.room_uuid,
        message_uuid: event.message_uuid ?? null,
        notification_route: 'push',
        primary_channel: route,
        is_standalone: route_decision.is_standalone,
        push_subscription_exists: route_decision.push_subscription_exists,
        line_identity_exists: route_decision.line_identity_exists,
        selected_route: 'push',
        skipped_reason: push.reason ?? 'push_failed',
        source_channel: event.source_channel,
        error_message: push.reason ?? 'push_failed',
        phase: 'new_chat_push',
      })

      return { deliveries: [] }
    }

    const line_user_id = await load_line_provider_id_for_user(event.user_uuid)

    if (!line_user_id) {
      await notification_route_trace('notification_line_failed', {
        user_uuid: event.user_uuid,
        room_uuid: event.room_uuid,
        message_uuid: event.message_uuid ?? null,
        notification_route: 'line',
        primary_channel: route,
        is_standalone: route_decision.is_standalone,
        push_subscription_exists: route_decision.push_subscription_exists,
        line_identity_exists: false,
        selected_route: 'line',
        skipped_reason: 'line_identity_missing',
        source_channel: event.source_channel,
        error_message: 'line_user_missing',
        phase: 'new_chat_line',
      })

      return { deliveries: [] }
    }

    const last_channel_raw = await load_participant_last_channel(
      event.participant_uuid ?? null,
    )
    const last_channel = normalize_line_notify_last_channel(last_channel_raw)
    const primary = route_decision.primary_channel
    const display = resolve_line_new_chat_display_copy({
      primary_channel: primary,
      last_channel,
      message_text: event.message,
    })
    const app_origin = env.app_url.trim() || 'https://app.da-nya.com'
    const open_url = resolve_line_new_chat_open_url({
      last_channel,
      room_uuid: event.room_uuid,
      app_origin,
      liff_id: next_public_liff_id(),
    })

    try {
      await send_line_push_notify({
        line_user_id,
        user_uuid: event.user_uuid,
        room_uuid: event.room_uuid,
        message_uuid: event.message_uuid ?? null,
        last_channel,
        open_url,
        title: display.title,
        body: display.body,
        should_include_body: display.should_include_body,
        selected_route: route,
      })

      await notification_route_trace('notification_line_sent', {
        user_uuid: event.user_uuid,
        room_uuid: event.room_uuid,
        message_uuid: event.message_uuid ?? null,
        notification_route: 'line',
        primary_channel: route,
        is_standalone: route_decision.is_standalone,
        push_subscription_exists: route_decision.push_subscription_exists,
        line_identity_exists: true,
        selected_route: 'line',
        skipped_reason: null,
        source_channel: event.source_channel,
        phase: 'new_chat_line',
        last_channel,
        should_include_body: display.should_include_body,
        open_url_exists: open_url.length > 0,
      })

      return { deliveries: [{ channel: 'line' }] }
    } catch (error) {
      await notification_route_trace('notification_line_failed', {
        user_uuid: event.user_uuid,
        room_uuid: event.room_uuid,
        message_uuid: event.message_uuid ?? null,
        notification_route: 'line',
        primary_channel: route,
        is_standalone: route_decision.is_standalone,
        push_subscription_exists: route_decision.push_subscription_exists,
        line_identity_exists: true,
        selected_route: 'line',
        skipped_reason: 'line_push_failed',
        source_channel: event.source_channel,
        error_message:
          error instanceof Error ? error.message : 'line_push_failed',
        phase: 'new_chat_line',
        last_channel,
        should_include_body: display.should_include_body,
        open_url_exists: open_url.length > 0,
      })

      return { deliveries: [] }
    }
  }

  if (event.event === 'concierge_requested') {
    const deliveries = await deliver_concierge_requested(event)
    return { deliveries }
  }

  if (event.event === 'support_started') {
    return deliver_support_started(event)
  }

  if (event.event === 'support_left') {
    return deliver_support_left(event)
  }

  if (event.event === 'admin_notification') {
    const result = await deliver_admin_notification({
      admin_event: event.admin_event,
      room_uuid: event.room_uuid ?? null,
      message_uuid: event.message_uuid ?? null,
      title: event.title ?? admin_notification_default_title(event.admin_event),
      message: event.message,
      actor_user_uuid: event.actor_user_uuid ?? null,
      source_channel: event.source_channel,
    })

    return { deliveries: result.deliveries }
  }

  const rule = resolve_notify_rule(event)

  const deliveries = rule.channels.map((channel) => {
    if (channel === 'discord') {
      return send_discord_notify(event)
    }

    if (channel === 'line' && event.event === 'line_push') {
      return send_line_push_notify({
        line_user_id: event.line_user_id,
        message: event.message,
      })
    }

    return Promise.resolve()
  })

  const settled = await Promise.allSettled(deliveries)

  const flat = settled.flatMap((result) => {
    if (result.status !== 'fulfilled' || !result.value) {
      return []
    }

    return [result.value as notify_delivery_result]
  })

  return { deliveries: flat }
}

async function emit_support_started_admin_chat_debug(
  event: string,
  payload: Record<string, unknown>,
) {
  const { debug_event } = await import('@/lib/debug')

  await debug_event({
    category: 'admin_chat',
    event,
    payload,
  })
}

async function notification_route_trace(
  debug_event: string,
  payload: Record<string, unknown>,
) {
  await notify({
    event: 'debug_trace',
    category: 'notification',
    debug_event,
    payload,
  })
}

function admin_notification_default_title(
  admin_event: Extract<
    notify_event,
    { event: 'admin_notification' }
  >['admin_event'],
) {
  if (admin_event === 'support_started') {
    return 'Support started'
  }

  if (admin_event === 'new_user_message') {
    return 'New user message'
  }

  if (admin_event === 'review_needed') {
    return 'Review needed'
  }

  return 'System alert'
}

function admin_notification_discord_content(input: {
  admin_event: string
  title: string
  message: string
  room_uuid: string | null
  message_uuid: string | null
}) {
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

async function deliver_admin_notification(input: {
  admin_event: Extract<
    notify_event,
    { event: 'admin_notification' }
  >['admin_event']
  room_uuid: string | null
  message_uuid: string | null
  title: string
  message: string
  actor_user_uuid: string | null
  source_channel: string
}): Promise<admin_notification_route_result> {
  let recipients

  try {
    recipients = await load_admin_notify_recipients({
      room_uuid: input.room_uuid,
      exclude_user_uuid: input.actor_user_uuid,
    })
  } catch (error) {
    await notification_route_trace('admin_notify_target_resolved', {
      admin_event: input.admin_event,
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      notification_route: 'skip',
      skipped_reason: 'admin_targets_load_failed',
      error_message: error instanceof Error ? error.message : String(error),
      phase: 'admin_notify_target_resolved',
    })

    return {
      outcome: 'skipped',
      transport: 'none',
      deliveries: [],
      error_code: 'admin_targets_load_failed',
      error_message: error instanceof Error ? error.message : String(error),
    }
  }

  if (recipients.has_active_admin_page) {
    await notification_route_trace('admin_notify_target_resolved', {
      admin_event: input.admin_event,
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      notification_route: 'toast',
      active_admin_count: recipients.active_admin_count,
      target_count: recipients.admins.length,
      skipped_reason: 'admin_page_open',
      phase: 'open -> toast',
    })

    return {
      outcome: 'skipped',
      transport: 'toast',
      deliveries: [],
      error_code: 'admin_page_open',
      error_message: 'open -> toast',
    }
  }

  await notification_route_trace('admin_notify_target_resolved', {
    admin_event: input.admin_event,
    room_uuid: input.room_uuid,
    message_uuid: input.message_uuid,
    notification_route: 'push',
    active_admin_count: recipients.active_admin_count,
    target_count: recipients.admins.length,
    skipped_reason: null,
    phase: 'admin closed -> PWA push',
  })

  const push_results = await Promise.allSettled(
    recipients.admins.map((recipient) =>
      send_push_notify({
        user_uuid: recipient.user_uuid,
        title: input.title,
        message: input.message,
        room_uuid: input.room_uuid,
        message_uuid: input.message_uuid,
        kind: 'chat',
        url: input.room_uuid
          ? `/admin/reception/${encodeURIComponent(input.room_uuid)}`
          : '/admin/reception',
      }),
    ),
  )
  const push_delivered = push_results.some(
    (result) =>
      result.status === 'fulfilled' &&
      result.value.ok &&
      result.value.available,
  )

  if (push_delivered) {
    return {
      outcome: 'delivered',
      transport: 'push',
      deliveries: [{ channel: 'push' }],
    }
  }

  if (discord_action_webhook_configured()) {
    await notification_route_trace('admin_notify_target_resolved', {
      admin_event: input.admin_event,
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      notification_route: 'discord_action_webhook',
      target_count: recipients.admins.length,
      skipped_reason: 'pwa_push_unavailable',
      phase: 'no PWA -> Discord fallback',
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

  await notification_route_trace('admin_notify_target_resolved', {
    admin_event: input.admin_event,
    room_uuid: input.room_uuid,
    message_uuid: input.message_uuid,
    notification_route: 'skip',
    target_count: recipients.admins.length,
    skipped_reason: 'no_pwa_or_discord_fallback',
    phase: 'none -> skip',
  })

  return {
    outcome: 'skipped',
    transport: 'none',
    deliveries: [],
    error_code: 'no_pwa_or_discord_fallback',
    error_message: 'none -> skip',
  }
}

async function post_support_lifecycle_discord(input: {
  room_uuid: string
  discord_thread_action_id: string | null
  content_line: string
  /** When true, never create a new forum thread (support_left must target existing thread). */
  require_existing_thread?: boolean
}) {
  const normalized = normalize_discord_thread_action_id(
    input.discord_thread_action_id,
  )

  if (input.require_existing_thread && !normalized) {
    return null
  }

  const result = await sync_discord_action_context({
    title: `Support - ${short_room_uuid(input.room_uuid)}`,
    content: input.content_line,
    action_id: normalized,
  })

  if (result?.action_id && !normalized) {
    const { supabase } = await import('@/lib/db/supabase')

    await supabase
      .from('rooms')
      .update({
        action_id: result.action_id,
        updated_at: new Date().toISOString(),
      })
      .eq('room_uuid', input.room_uuid)
  }

  return result
}

async function deliver_support_started(
  event: Extract<notify_event, { event: 'support_started' }>,
): Promise<notify_run_result> {
  const raw_discord_id =
    typeof event.discord_thread_action_id === 'string'
      ? event.discord_thread_action_id.trim()
      : ''
  const normalized_thread_action_id = normalize_discord_thread_action_id(
    event.discord_thread_action_id,
  )
  const discord_id_exists = Boolean(normalized_thread_action_id)
  const webhook_exists = discord_action_webhook_configured()

  const base_debug_payload = {
    room_uuid: event.room_uuid,
    action_uuid: event.action_uuid,
    admin_user_uuid: event.admin_user_uuid,
    admin_participant_uuid: event.admin_participant_uuid,
    admin_internal_name: event.admin_internal_name,
    customer_user_uuid: event.customer_user_uuid,
    customer_participant_uuid: event.customer_participant_uuid,
    customer_display_name: event.customer_display_name,
    discord_id_exists,
    discord_id: mask_discord_action_id_for_log(
      normalized_thread_action_id ?? raw_discord_id,
    ),
    notification_channel: null as string | null,
    webhook_exists,
    error_code: null as string | null,
    error_message: null as string | null,
    phase: 'deliver_support_started',
  }

  await emit_support_started_admin_chat_debug(
    'support_started_notify_started',
    base_debug_payload,
  )

  const rule = resolve_notify_rule(event)

  if (!should_send_notify(event) || rule.channels.length === 0) {
    await emit_support_started_admin_chat_debug(
      'support_started_notify_skipped',
      {
        ...base_debug_payload,
        notification_channel: 'none',
        error_code: 'notify_rule_disabled',
        error_message: 'support_started notify disabled or no channels',
        phase: 'resolve_notify_rule',
      },
    )

    return support_started_notify_run([], {
      outcome: 'skipped',
      transport: 'none',
      error_code: 'notify_rule_disabled',
      error_message: 'support_started notify disabled or no channels',
    })
  }

  const gate = await evaluate_support_started_notify_gate({
    room_uuid: event.room_uuid,
    action_uuid: event.action_uuid,
    created_at: event.created_at,
  })

  if (!gate.allow) {
    await emit_support_started_admin_chat_debug(
      'support_started_notify_skipped',
      {
        ...base_debug_payload,
        notification_channel: 'none',
        error_code: gate.skip_reason,
        error_message: `gate:${gate.skip_reason}`,
        phase: 'support_started_notify_gate',
        room_status: gate.room_status,
      },
    )

    return support_started_notify_run([], {
      outcome: 'skipped',
      transport: 'none',
      error_code: gate.skip_reason,
      error_message: `gate:${gate.skip_reason}`,
    })
  }

  const discord_line = `${event.admin_display_label} が対応を開始しました`

  const discord_result = await post_support_lifecycle_discord({
    room_uuid: event.room_uuid,
    discord_thread_action_id: normalized_thread_action_id,
    content_line: discord_line,
  })

  const content = format_support_started_notify_content(event)
  const admin_route = await deliver_admin_notification({
    admin_event: 'support_started',
    room_uuid: event.room_uuid,
    message_uuid: null,
    title: 'Support started',
    message: content,
    actor_user_uuid: event.admin_user_uuid,
    source_channel: event.source_channel,
  })

  if (admin_route.outcome === 'delivered' || discord_result?.action_id) {
    await emit_support_started_admin_chat_debug(
      'support_started_notify_succeeded',
      {
        ...base_debug_payload,
        notification_channel: discord_result?.action_id
          ? 'discord_action_thread'
          : admin_route.transport,
      },
    )

    const deliveries = [...admin_route.deliveries]

    if (discord_result?.action_id) {
      deliveries.push({
        channel: 'discord',
        action_id: discord_result.action_id,
      })
    }

    return support_started_notify_run(deliveries, {
      outcome: 'delivered',
      transport: discord_result?.action_id
        ? 'discord_action_webhook'
        : admin_route.transport,
    })
  }

  if (admin_route.transport === 'toast' || admin_route.transport === 'none') {
    if (discord_result?.action_id) {
      return support_started_notify_run(
        [{ channel: 'discord', action_id: discord_result.action_id }],
        {
          outcome: 'delivered',
          transport: 'discord_action_webhook',
        },
      )
    }

    await emit_support_started_admin_chat_debug(
      'support_started_notify_skipped',
      {
        ...base_debug_payload,
        notification_channel: admin_route.transport,
        error_code: admin_route.error_code ?? null,
        error_message: admin_route.error_message ?? null,
      },
    )

    return support_started_notify_run([], {
      outcome: 'skipped',
      transport: admin_route.transport,
      error_code: admin_route.error_code ?? null,
      error_message: admin_route.error_message ?? null,
    })
  }

  if (admin_route.outcome === 'failed') {
    await emit_support_started_admin_chat_debug(
      'support_started_notify_failed',
      {
        ...base_debug_payload,
        notification_channel: admin_route.transport,
        http_status: admin_route.http_status ?? null,
        error_code: admin_route.error_code ?? null,
        error_message: admin_route.error_message ?? null,
      },
    )

    return support_started_notify_run([], {
      outcome: 'failed',
      transport: admin_route.transport,
      http_status: admin_route.http_status ?? null,
      error_code: admin_route.error_code ?? null,
      error_message: admin_route.error_message ?? null,
    })
  }

  return support_started_notify_run([], {
    outcome: 'skipped',
    transport: 'none',
    error_code: 'admin_notification_route_unresolved',
    error_message: 'admin notification route ended without delivery',
  })
}

async function deliver_support_left(
  event: Extract<notify_event, { event: 'support_left' }>,
): Promise<notify_run_result> {
  const normalized_thread_action_id = normalize_discord_thread_action_id(
    event.discord_thread_action_id,
  )

  const base_debug_payload = {
    room_uuid: event.room_uuid,
    action_uuid: event.action_uuid,
    admin_user_uuid: event.admin_user_uuid,
    discord_id_exists: Boolean(normalized_thread_action_id),
    discord_id: mask_discord_action_id_for_log(
      normalized_thread_action_id ?? event.discord_thread_action_id,
    ),
    phase: 'deliver_support_left',
  }

  await emit_support_started_admin_chat_debug(
    'support_left_notify_started',
    base_debug_payload,
  )

  if (!should_send_notify(event)) {
    await emit_support_started_admin_chat_debug('support_left_notify_failed', {
      ...base_debug_payload,
      error_code: 'notify_rule_disabled',
      error_message: 'support_left notify disabled',
    })

    return support_started_notify_run([], {
      outcome: 'skipped',
      transport: 'none',
      error_code: 'notify_rule_disabled',
      error_message: 'support_left notify disabled',
    })
  }

  if (!normalized_thread_action_id) {
    await emit_support_started_admin_chat_debug('support_left_notify_failed', {
      ...base_debug_payload,
      error_code: 'discord_thread_missing',
      error_message: 'rooms.action_id discord thread required for support_left',
    })

    return support_started_notify_run([], {
      outcome: 'failed',
      transport: 'discord_action_webhook',
      error_code: 'discord_thread_missing',
      error_message: 'rooms.action_id discord thread required for support_left',
    })
  }

  const content_line = format_support_left_notify_content(event)
  const discord_result = await post_support_lifecycle_discord({
    room_uuid: event.room_uuid,
    discord_thread_action_id: normalized_thread_action_id,
    content_line,
    require_existing_thread: true,
  })

  if (discord_result?.action_id) {
    await emit_support_started_admin_chat_debug(
      'support_left_notify_succeeded',
      {
        ...base_debug_payload,
        notification_channel: 'discord_action_thread',
      },
    )

    return support_started_notify_run(
      [{ channel: 'discord', action_id: discord_result.action_id }],
      {
        outcome: 'delivered',
        transport: 'discord_action_webhook',
      },
    )
  }

  await emit_support_started_admin_chat_debug('support_left_notify_failed', {
    ...base_debug_payload,
    error_code: 'discord_action_thread_failed',
    error_message: 'support_left discord thread post failed',
  })

  return support_started_notify_run([], {
    outcome: 'failed',
    transport: 'discord_action_webhook',
    error_code: 'discord_action_thread_failed',
    error_message: 'support_left discord thread post failed',
  })
}

export async function sync_room_action_context(input: {
  provider: 'discord'
  title: string
  content: string
  action_id: string | null
  close?: boolean
}) {
  if (input.provider === 'discord') {
    return sync_discord_action_context({
      title: input.title,
      content: input.content,
      action_id: input.action_id,
      close: input.close,
    })
  }

  return null
}

/**
 * Orchestrate `concierge_requested` delivery.
 *
 * Flow:
 *   1. Load reception summary + recipients.
 *   2. Decide targets via `resolve_concierge_targets`.
 *      - has_open_admin === true  -> deliver to open admins
 *      - has_open_admin === false -> escalate to owner/core
 *   3. For each target try push first; on `available: false` or failure
 *      fall back to personal LINE push.
 *   4. Always sync the Discord action thread with the result, using
 *      `[ESCALATED]` title prefix when escalated.
 */
async function deliver_concierge_requested(
  event: Extract<notify_event, { event: 'concierge_requested' }>,
): Promise<notify_delivery_result[]> {
  const rule = resolve_notify_rule(event)

  if (rule.channels.length === 0) {
    return []
  }

  let recipients: concierge_recipients

  try {
    recipients = await load_concierge_recipients()
  } catch (error) {
    console.error('[notify] concierge_recipients_load_failed', {
      room_uuid: event.room_uuid,
      error: error instanceof Error ? error.message : String(error),
    })

    recipients = {
      open_admins: [],
      offline_admin_user_uuids: [],
      total_admin_count: 0,
      open_admin_count: 0,
      has_open_admin: false,
      owner_core: [],
    }
  }

  const targets = resolve_concierge_targets({
    has_open_admin: recipients.has_open_admin,
  })
  const is_escalated = !recipients.has_open_admin
  const requester_display_name = await read_requester_display_name(
    event.user_uuid,
  ).catch(() => 'ユーザー')

  const personal_targets: notify_recipient[] = is_escalated
    ? recipients.owner_core
    : recipients.open_admins

  const message = build_personal_message({
    display_name: requester_display_name,
    room_uuid: event.room_uuid,
  })

  const personal_outcomes = await deliver_personal_notifications({
    recipients: personal_targets,
    message,
  })

  const action_context = await sync_concierge_discord_thread({
    event,
    recipients,
    is_escalated,
    requester_display_name,
    personal_outcomes,
    targets,
  })

  const results: notify_delivery_result[] = []

  for (const outcome of personal_outcomes) {
    if (outcome.channel === 'push' && outcome.ok) {
      results.push({ channel: 'push' })
    } else if (outcome.channel === 'line' && outcome.ok) {
      results.push({ channel: 'line' })
    }
  }

  results.push({
    channel: 'discord',
    action_id: action_context?.action_id ?? event.action_id,
  })

  return results
}

function build_personal_message(input: {
  display_name: string
  room_uuid: string
}): string {
  return [
    `${input.display_name}さんがコンシェルジュを呼び出しています。`,
    `Room: ${input.room_uuid}`,
  ].join('\n')
}

async function deliver_personal_notifications(input: {
  recipients: notify_recipient[]
  message: string
}): Promise<personal_delivery_outcome[]> {
  const tasks = input.recipients.map((recipient) =>
    deliver_personal_to_recipient({ recipient, message: input.message }),
  )

  const settled = await Promise.allSettled(tasks)

  return settled.map((entry, index) => {
    if (entry.status === 'fulfilled') {
      return entry.value
    }

    return {
      recipient: input.recipients[index],
      channel: 'none',
      ok: false,
      reason:
        entry.reason instanceof Error ? entry.reason.message : 'unknown_error',
    }
  })
}

async function deliver_personal_to_recipient(input: {
  recipient: notify_recipient
  message: string
}): Promise<personal_delivery_outcome> {
  const route_decision = await resolve_chat_external_notification_decision({
    user_uuid: input.recipient.user_uuid,
    source_channel: 'system',
  })
  const route = route_decision.selected_route

  const route_debug_payload = {
    user_uuid: input.recipient.user_uuid,
    primary_channel: route_decision.primary_channel,
    source_channel: 'system',
    is_standalone: route_decision.is_standalone,
    push_subscription_exists: route_decision.push_subscription_exists,
    line_identity_exists: route_decision.line_identity_exists,
    push_enabled: route_decision.push_enabled,
    line_enabled: route_decision.line_enabled,
    selected_route: route_decision.selected_route,
    skipped_reason: route_decision.skipped_reason,
    notification_route: route,
    has_line_identity: Boolean(input.recipient.line_user_id),
    phase: 'personal_delivery_start',
  }

  await notification_route_trace(
    'notify_primary_channel_resolved',
    route_debug_payload,
  )
  await notification_route_trace('notify_route_decided', route_debug_payload)

  if (route === null) {
    await notification_route_trace('notify_route_skipped', {
      ...route_debug_payload,
      phase: 'personal_delivery_skip',
    })

    return {
      recipient: input.recipient,
      channel: 'none',
      ok: false,
      reason: 'notification_route_none',
    }
  }

  if (route === 'push') {
    const push = await send_push_notify({
      user_uuid: input.recipient.user_uuid,
      message: input.message,
      kind: 'chat',
    }).catch((error) => ({
      ok: false,
      available: false,
      reason: error instanceof Error ? error.message : 'push_threw',
    }))

    if (push.ok && push.available) {
      await notification_route_trace('notify_push_sent', {
        user_uuid: input.recipient.user_uuid,
        notification_route: 'push',
        primary_channel: route,
        source_channel: 'system',
        is_standalone: route_decision.is_standalone,
        push_subscription_exists: route_decision.push_subscription_exists,
        line_identity_exists: route_decision.line_identity_exists,
        selected_route: 'push',
        skipped_reason: null,
        has_push_subscription: true,
        has_line_identity: Boolean(input.recipient.line_user_id),
        phase: 'personal_delivery_push',
      })

      return {
        recipient: input.recipient,
        channel: 'push',
        ok: true,
      }
    }

    await notification_route_trace('notify_push_failed', {
      user_uuid: input.recipient.user_uuid,
      notification_route: 'push',
      primary_channel: route,
      source_channel: 'system',
      is_standalone: route_decision.is_standalone,
      push_subscription_exists: route_decision.push_subscription_exists,
      line_identity_exists: route_decision.line_identity_exists,
      selected_route: 'push',
      skipped_reason: push.reason ?? 'push_failed',
      has_push_subscription: push.available,
      has_line_identity: Boolean(input.recipient.line_user_id),
      error_message: push.reason ?? 'push_failed',
      phase: 'personal_delivery_push',
    })

    return {
      recipient: input.recipient,
      channel: 'none',
      ok: false,
      reason: push.reason ?? 'push_failed',
    }
  }

  const line_user_id =
    input.recipient.line_user_id ??
    (await load_line_provider_id_for_user(input.recipient.user_uuid))

  if (!line_user_id) {
    await notification_route_trace('notification_line_failed', {
      user_uuid: input.recipient.user_uuid,
      notification_route: 'line',
      primary_channel: route,
      source_channel: 'system',
      is_standalone: route_decision.is_standalone,
      push_subscription_exists: route_decision.push_subscription_exists,
      line_identity_exists: false,
      selected_route: 'line',
      skipped_reason: 'line_identity_missing',
      has_push_subscription: false,
      has_line_identity: false,
      error_message: 'line_user_missing',
      phase: 'personal_delivery_line',
    })

    return {
      recipient: input.recipient,
      channel: 'none',
      ok: false,
      reason: 'line_user_missing',
    }
  }

  try {
    await send_line_push_notify({
      line_user_id,
      message: input.message,
    })

    await notification_route_trace('notification_line_sent', {
      user_uuid: input.recipient.user_uuid,
      notification_route: 'line',
      primary_channel: route,
      source_channel: 'system',
      is_standalone: route_decision.is_standalone,
      push_subscription_exists: route_decision.push_subscription_exists,
      line_identity_exists: true,
      selected_route: 'line',
      skipped_reason: null,
      has_push_subscription: false,
      has_line_identity: true,
      phase: 'personal_delivery_line',
    })

    return {
      recipient: input.recipient,
      channel: 'line',
      ok: true,
    }
  } catch (error) {
    await notification_route_trace('notification_line_failed', {
      user_uuid: input.recipient.user_uuid,
      notification_route: 'line',
      primary_channel: route,
      source_channel: 'system',
      is_standalone: route_decision.is_standalone,
      push_subscription_exists: route_decision.push_subscription_exists,
      line_identity_exists: true,
      selected_route: 'line',
      skipped_reason: 'line_push_failed',
      has_push_subscription: false,
      has_line_identity: true,
      error_message: error instanceof Error ? error.message : 'line_push_failed',
      phase: 'personal_delivery_line',
    })

    return {
      recipient: input.recipient,
      channel: 'line',
      ok: false,
      reason: error instanceof Error ? error.message : 'line_push_failed',
    }
  }
}

async function sync_concierge_discord_thread(input: {
  event: Extract<notify_event, { event: 'concierge_requested' }>
  recipients: concierge_recipients
  is_escalated: boolean
  requester_display_name: string
  personal_outcomes: personal_delivery_outcome[]
  targets: ReturnType<typeof resolve_concierge_targets>
}) {
  const title_short = short_room_uuid(input.event.room_uuid)
  const title = input.is_escalated
    ? `[ESCALATED] Concierge - ${title_short}`
    : `Concierge - ${title_short}`

  const content = input.is_escalated
    ? build_concierge_escalated_content({
        room_uuid: input.event.room_uuid,
        personal_outcomes: input.personal_outcomes,
      })
    : build_concierge_normal_content({
        event: input.event,
        recipients: input.recipients,
        requester_display_name: input.requester_display_name,
        targets: input.targets,
        personal_outcomes: input.personal_outcomes,
      })

  return sync_discord_action_context({
    title,
    action_id: input.event.action_id,
    content,
  })
}

function format_outcome_lines(
  outcomes: personal_delivery_outcome[],
): string[] {
  if (outcomes.length === 0) {
    return ['deliveries: (none)']
  }

  const lines = ['deliveries:']

  for (const outcome of outcomes) {
    const name = outcome.recipient.display_name?.trim() || outcome.recipient.user_uuid
    const status = outcome.ok ? 'ok' : 'failed'
    const reason = outcome.reason ? ` (${outcome.reason})` : ''
    lines.push(`- ${name} -> ${outcome.channel}: ${status}${reason}`)
  }

  return lines
}

function build_concierge_normal_content(input: {
  event: Extract<notify_event, { event: 'concierge_requested' }>
  recipients: concierge_recipients
  requester_display_name: string
  targets: ReturnType<typeof resolve_concierge_targets>
  personal_outcomes: personal_delivery_outcome[]
}): string {
  const { event, recipients, requester_display_name, targets } = input

  return [
    '[CONCIERGE REQUESTED]',
    '',
    `${requester_display_name}さんがコンシェルジュを呼び出しています。`,
    '',
    `room_uuid: ${event.room_uuid}`,
    `participant_uuid: ${event.participant_uuid}`,
    `visitor_uuid: ${event.visitor_uuid}`,
    `user_uuid: ${event.user_uuid ?? 'none'}`,
    `source_channel: ${event.source_channel}`,
    `mode: ${event.mode}`,
    `open_admins: ${recipients.open_admin_count}/${recipients.total_admin_count}`,
    `targets: ${targets.join(', ')}`,
    ...format_outcome_lines(input.personal_outcomes),
  ].join('\n')
}

function build_concierge_escalated_content(input: {
  room_uuid: string
  personal_outcomes: personal_delivery_outcome[]
}): string {
  return [
    '[RECEPTION OFFLINE]',
    '',
    '現在対応可能なコンシェルジュがいません。',
    '',
    'owner/core メンバーへエスカレーションします。',
    '',
    'room_uuid:',
    input.room_uuid,
    '',
    ...format_outcome_lines(input.personal_outcomes),
  ].join('\n')
}

export type admin_internal_name_notify_outcome =
  | { ok: true; skipped: boolean }
  | {
      ok: false
      error_message: string
      error_details: string | null
    }

/**
 * Discord delivery for `admin_internal_name_updated` only.
 * Profile save callers use this so a webhook failure never rolls back DB.
 */
export async function deliver_admin_internal_name_updated(
  event: Extract<notify_event, { event: 'admin_internal_name_updated' }>,
): Promise<admin_internal_name_notify_outcome> {
  const rule = resolve_notify_rule(event)

  if (rule.channels.length === 0) {
    return { ok: true, skipped: true }
  }

  try {
    const result = await send_discord_notify(event)

    if (!result) {
      return {
        ok: false,
        error_message: 'discord_notify_returned_null',
        error_details: null,
      }
    }

    if (result.ok === false) {
      const details =
        typeof result.error_text === 'string' && result.error_text.length > 0
          ? result.error_text
          : null

      return {
        ok: false,
        error_message:
          typeof result.http_status === 'number'
            ? `discord_http_${result.http_status}`
            : 'discord_notify_failed',
        error_details: details,
      }
    }

    return { ok: true, skipped: false }
  } catch (error) {
    return {
      ok: false,
      error_message:
        error instanceof Error ? error.message : String(error),
      error_details: null,
    }
  }
}
