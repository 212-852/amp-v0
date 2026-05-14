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
import { resolve_chat_external_notification_route } from '@/lib/notification/rules'
import {
  load_concierge_recipients,
  load_line_provider_id_for_user,
  read_requester_display_name,
  type concierge_recipients,
  type notify_recipient,
} from './recipients'
import {
  format_support_started_notify_content,
  resolve_concierge_targets,
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

export async function notify(
  event: notify_event,
): Promise<notify_run_result> {
  if (event.event === 'new_chat') {
    const route = await resolve_chat_external_notification_route({
      user_uuid: event.user_uuid,
    })

    await notification_route_trace('notify_route_decided', {
      user_uuid: event.user_uuid,
      room_uuid: event.room_uuid,
      message_uuid: event.message_uuid ?? null,
      primary_channel: route,
      notification_route: route,
      source_channel: event.source_channel,
      phase: 'new_chat',
    })

    if (route === 'none') {
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
        source_channel: event.source_channel,
        error_message: 'line_user_missing',
        phase: 'new_chat_line',
      })

      return { deliveries: [] }
    }

    try {
      await send_line_push_notify({
        line_user_id,
        message: event.message,
      })

      await notification_route_trace('notification_line_sent', {
        user_uuid: event.user_uuid,
        room_uuid: event.room_uuid,
        message_uuid: event.message_uuid ?? null,
        notification_route: 'line',
        primary_channel: route,
        source_channel: event.source_channel,
        phase: 'new_chat_line',
      })

      return { deliveries: [{ channel: 'line' }] }
    } catch (error) {
      await notification_route_trace('notification_line_failed', {
        user_uuid: event.user_uuid,
        room_uuid: event.room_uuid,
        message_uuid: event.message_uuid ?? null,
        notification_route: 'line',
        primary_channel: route,
        source_channel: event.source_channel,
        error_message:
          error instanceof Error ? error.message : 'line_push_failed',
        phase: 'new_chat_line',
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

  const content = format_support_started_notify_content(event)

  try {
    if (webhook_exists) {
      await emit_support_started_admin_chat_debug(
        'support_started_notify_route_decided',
        {
          ...base_debug_payload,
          notification_channel: 'discord_action_webhook',
        },
      )

      const webhook_result = await post_discord_action_webhook_message({
        content,
      })

      if (webhook_result.ok) {
        await emit_support_started_admin_chat_debug(
          'support_started_notify_succeeded',
          {
            ...base_debug_payload,
            notification_channel: 'discord_action_webhook',
          },
        )

        return support_started_notify_run([{ channel: 'discord' }], {
          outcome: 'delivered',
          transport: 'discord_action_webhook',
        })
      }

      await emit_support_started_admin_chat_debug(
        'support_started_notify_failed',
        {
          ...base_debug_payload,
          notification_channel: 'discord_action_webhook',
          error_code: 'discord_action_webhook_non_ok',
          error_message:
            webhook_result.error_text ??
            (typeof webhook_result.http_status === 'number'
              ? `http_${webhook_result.http_status}`
              : 'webhook_post_failed'),
          phase: 'discord_action_webhook',
        },
      )

      return support_started_notify_run([], {
        outcome: 'failed',
        transport: 'discord_action_webhook',
        http_status:
          typeof webhook_result.http_status === 'number'
            ? webhook_result.http_status
            : null,
        error_code: 'discord_action_webhook_non_ok',
        error_message:
          webhook_result.error_text ??
          (typeof webhook_result.http_status === 'number'
            ? `http_${webhook_result.http_status}`
            : 'webhook_post_failed'),
      })
    }

    if (normalized_thread_action_id) {
      await emit_support_started_admin_chat_debug(
        'support_started_notify_route_decided',
        {
          ...base_debug_payload,
          notification_channel: 'discord_action_thread',
        },
      )

      const result = await sync_discord_action_context({
        title: '[SUPPORT STARTED]',
        content,
        action_id: normalized_thread_action_id,
      })

      if (!result) {
        await emit_support_started_admin_chat_debug(
          'support_started_notify_failed',
          {
            ...base_debug_payload,
            notification_channel: 'discord_action_thread',
            error_code: 'discord_thread_sync_failed',
            error_message:
              'sync_discord_action_context returned null (reopen or post failed)',
            phase: 'discord_action_thread',
          },
        )

        return support_started_notify_run([], {
          outcome: 'failed',
          transport: 'discord_action_thread',
          error_code: 'discord_thread_sync_failed',
          error_message:
            'sync_discord_action_context returned null (reopen or post failed)',
        })
      }

      await emit_support_started_admin_chat_debug(
        'support_started_notify_succeeded',
        {
          ...base_debug_payload,
          notification_channel: 'discord_action_thread',
        },
      )

      return support_started_notify_run(
        [
          {
            channel: 'discord',
            action_id: result.action_id ?? normalized_thread_action_id,
          },
        ],
        {
          outcome: 'delivered',
          transport: 'discord_action_thread',
        },
      )
    }

    if (raw_discord_id) {
      await emit_support_started_admin_chat_debug(
        'support_started_notify_discord_id_missing',
        {
          ...base_debug_payload,
          discord_id_exists: false,
          discord_id: mask_discord_action_id_for_log(raw_discord_id),
          notification_channel: 'none',
          error_code: 'discord_thread_action_id_unusable',
          error_message:
            'rooms.action_id was set but could not be normalized to discord:<snowflake>',
          phase: 'discord_thread_action_id',
        },
      )
    }

    const notify_wolf_configured = Boolean(
      process.env.DISCORD_NOTIFY_WEBHOOK_URL?.trim(),
    )

    if (notify_wolf_configured) {
      await emit_support_started_admin_chat_debug(
        'support_started_notify_route_decided',
        {
          ...base_debug_payload,
          notification_channel: 'notify_wolf_webhook',
        },
      )

      const sent = await send_discord_notify(event)

      if (sent?.ok === true) {
        await emit_support_started_admin_chat_debug(
          'support_started_notify_succeeded',
          {
            ...base_debug_payload,
            notification_channel: 'notify_wolf_webhook',
          },
        )

        return support_started_notify_run([{ channel: 'discord' }], {
          outcome: 'delivered',
          transport: 'notify_wolf_webhook',
        })
      }

      if (sent?.ok === false) {
        await emit_support_started_admin_chat_debug(
          'support_started_notify_failed',
          {
            ...base_debug_payload,
            notification_channel: 'notify_wolf_webhook',
            http_status: sent.http_status ?? null,
            error_text: sent.error_text ?? null,
            error_code: 'discord_webhook_non_ok',
            error_message: 'DISCORD_NOTIFY_WEBHOOK_URL returned non-2xx',
            phase: 'notify_wolf_webhook',
          },
        )

        return support_started_notify_run([], {
          outcome: 'failed',
          transport: 'notify_wolf_webhook',
          http_status: sent.http_status ?? null,
          error_code: 'discord_webhook_non_ok',
          error_message: 'DISCORD_NOTIFY_WEBHOOK_URL returned non-2xx',
        })
      } else {
        await emit_support_started_admin_chat_debug(
          'support_started_notify_failed',
          {
            ...base_debug_payload,
            notification_channel: 'notify_wolf_webhook',
            error_code: 'discord_webhook_skipped_or_empty',
            error_message:
              'send_discord_notify returned null (missing URL, empty content, or transport skip)',
            phase: 'notify_wolf_webhook',
          },
        )

        return support_started_notify_run([], {
          outcome: 'failed',
          transport: 'notify_wolf_webhook',
          error_code: 'discord_webhook_skipped_or_empty',
          error_message:
            'send_discord_notify returned null (missing URL, empty content, or transport skip)',
        })
      }
    }

    await emit_support_started_admin_chat_debug(
      'support_started_notify_skipped',
      {
        ...base_debug_payload,
        notification_channel: 'none',
        error_code: 'no_discord_transport',
        error_message:
          'missing DISCORD_ACTION_WEBHOOK_URL, thread action id, and DISCORD_NOTIFY_WEBHOOK_URL',
        phase: 'deliver_support_started',
      },
    )

    return support_started_notify_run([], {
      outcome: 'skipped',
      transport: 'none',
      error_code: 'no_discord_transport',
      error_message:
        'missing DISCORD_ACTION_WEBHOOK_URL, thread action id, and DISCORD_NOTIFY_WEBHOOK_URL',
    })
  } catch (error) {
    await emit_support_started_admin_chat_debug(
      'support_started_notify_failed',
      {
        ...base_debug_payload,
        error_code: 'support_started_notify_exception',
        error_message:
          error instanceof Error ? error.message : String(error),
        phase: 'deliver_support_started',
      },
    )
    return support_started_notify_run([], {
      outcome: 'failed',
      transport: null,
      error_code: 'support_started_notify_exception',
      error_message:
        error instanceof Error ? error.message : String(error),
    })
  }
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
  const route = await resolve_chat_external_notification_route({
    user_uuid: input.recipient.user_uuid,
  })

  await notification_route_trace('notify_route_decided', {
    user_uuid: input.recipient.user_uuid,
    primary_channel: route,
    notification_route: route,
    has_line_identity: Boolean(input.recipient.line_user_id),
    phase: 'personal_delivery_start',
  })

  if (route === 'none') {
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
