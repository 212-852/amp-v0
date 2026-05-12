import 'server-only'

import {
  send_discord_notify,
  short_room_uuid,
  sync_discord_action_context,
} from './discord'
import { send_line_push_notify } from './line'
import { send_push_notify } from './push'
import {
  load_concierge_recipients,
  read_requester_display_name,
  type concierge_recipients,
  type notify_recipient,
} from './recipients'
import {
  format_support_started_notify_content,
  resolve_concierge_targets,
  resolve_notify_rule,
  type notify_event,
} from './rules'

export type notify_delivery_result = {
  channel: 'discord' | 'line' | 'push'
  action_id?: string | null
}

type personal_delivery_outcome = {
  recipient: notify_recipient
  channel: 'push' | 'line' | 'none'
  ok: boolean
  reason?: string
}

export async function notify(
  event: notify_event,
): Promise<notify_delivery_result[]> {
  if (event.event === 'concierge_requested') {
    return deliver_concierge_requested(event)
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

  return settled.flatMap((result) => {
    if (result.status !== 'fulfilled' || !result.value) {
      return []
    }

    return [result.value as notify_delivery_result]
  })
}

async function admin_support_notify_trace(
  debug_event: string,
  payload: Record<string, unknown>,
) {
  await notify({
    event: 'debug_trace',
    category: 'admin_chat',
    debug_event,
    payload,
  })
}

async function deliver_support_started(
  event: Extract<notify_event, { event: 'support_started' }>,
): Promise<notify_delivery_result[]> {
  await admin_support_notify_trace('support_started_notify_started', {
    room_uuid: event.room_uuid,
    action_uuid: event.action_uuid,
  })

  const content = format_support_started_notify_content(event)

  try {
    if (event.discord_thread_action_id) {
      const result = await sync_discord_action_context({
        title: 'Support started',
        content,
        action_id: event.discord_thread_action_id,
      })

      await admin_support_notify_trace('support_started_notify_succeeded', {
        room_uuid: event.room_uuid,
        action_uuid: event.action_uuid,
        route: 'discord_action_thread',
      })

      return [
        {
          channel: 'discord',
          action_id: result?.action_id ?? event.discord_thread_action_id,
        },
      ]
    }

    const rule = resolve_notify_rule(event)

    if (!rule.channels.includes('discord')) {
      await admin_support_notify_trace('support_started_notify_failed', {
        room_uuid: event.room_uuid,
        reason: 'notify_rule_skipped_discord',
      })
      return []
    }

    const sent = await send_discord_notify(event)

    if (sent?.ok === false) {
      await admin_support_notify_trace('support_started_notify_failed', {
        room_uuid: event.room_uuid,
        action_uuid: event.action_uuid,
        http_status: sent.http_status ?? null,
        error_text: sent.error_text ?? null,
      })
    } else {
      await admin_support_notify_trace('support_started_notify_succeeded', {
        room_uuid: event.room_uuid,
        action_uuid: event.action_uuid,
        route: 'notify_wolf_webhook',
      })
    }

    return [{ channel: 'discord' }]
  } catch (error) {
    await admin_support_notify_trace('support_started_notify_failed', {
      room_uuid: event.room_uuid,
      action_uuid: event.action_uuid,
      error_message:
        error instanceof Error ? error.message : String(error),
    })
    return []
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
  const push = await send_push_notify({
    user_uuid: input.recipient.user_uuid,
    message: input.message,
  }).catch((error) => ({
    ok: false,
    available: false,
    reason: error instanceof Error ? error.message : 'push_threw',
  }))

  if (push.ok && push.available) {
    return {
      recipient: input.recipient,
      channel: 'push',
      ok: true,
    }
  }

  const line_user_id = input.recipient.line_user_id

  if (!line_user_id) {
    return {
      recipient: input.recipient,
      channel: 'none',
      ok: false,
      reason:
        push.reason ?? (push.available ? 'push_failed' : 'no_personal_channel'),
    }
  }

  try {
    await send_line_push_notify({
      line_user_id,
      message: input.message,
    })

    return {
      recipient: input.recipient,
      channel: 'line',
      ok: true,
    }
  } catch (error) {
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
