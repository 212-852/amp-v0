import 'server-only'

import { control } from '@/lib/config/control'
import { debug_control } from '@/lib/debug/control'
import { notify } from '@/lib/notify'
import { resolve_debug_rule } from './rules'

type debug_payload = {
  category: string
  event: string
  message?: string
  data?: Record<string, unknown>
}

function allow_discord_debug_category(category: string, event?: string) {
  const chat_messages_fetch_events = new Set([
    'chat_messages_fetch_started',
    'chat_messages_fetch_succeeded',
    'chat_messages_fetch_failed',
  ])

  const chat_room_resolve_pipeline = new Set([
    'chat_room_resolve_started',
    'chat_room_participant_lookup_started',
    'chat_room_participant_lookup_succeeded',
    'chat_room_created',
    'chat_room_participant_created',
    'chat_room_user_attached',
    'chat_room_resolve_succeeded',
    'chat_room_resolve_failed',
    'participant_linked_to_user',
    'room_uuid_restored',
    'room_support_mode_preserved',
  ])

  if (
    category === 'chat_room' &&
    event &&
    chat_room_resolve_pipeline.has(event) &&
    control.notify.debug_trace
  ) {
    return true
  }

  if (
    category === 'admin_chat' &&
    event === 'support_started_notify_failed'
  ) {
    return true
  }

  if (
    category === 'chat_room' &&
    event &&
    chat_messages_fetch_events.has(event) &&
    debug_control.chat_messages_fetch_discord_enabled
  ) {
    return true
  }

  if (category === 'chat_room' && !control.debug.chat_room) {
    return false
  }

  const line_webhook_always_discord = new Set([
    'line_webhook_received',
    'line_webhook_fallback_returned',
    'line_webhook_phase_started',
    'line_webhook_phase_succeeded',
    'line_webhook_phase_failed',
    'line_webhook_events_parsed',
    'line_webhook_event_loop_started',
    'line_webhook_event_skipped',
    'line_user_resolve_soft_failed',
  ])

  if (
    category === 'line_webhook' &&
    event &&
    line_webhook_always_discord.has(event)
  ) {
    return true
  }

  if (category === 'line_webhook' && !control.debug.line_webhook) {
    return false
  }

  const recruitment_always_discord = new Set([
    'recruitment_intent_checked',
    'recruitment_bundle_built',
    'recruitment_output_send_started',
    'recruitment_output_send_succeeded',
    'recruitment_output_send_failed',
  ])

  if (category === 'recruitment' && event && recruitment_always_discord.has(event)) {
    return true
  }

  if (category === 'line' && !control.debug.line) {
    return false
  }

  if (category === 'locale' && !control.debug.locale) {
    return false
  }

  if (category === 'identity' && !control.debug.identity) {
    return false
  }

  if (category === 'auth_route' && !control.debug.auth_route) {
    return false
  }

  if (category === 'USER_PAGE' && !control.debug.user_page) {
    return false
  }

  if (!control.debug.use_discord_category_allowlist) {
    return true
  }

  const list = control.debug.discord_category_allowlist

  if (list.length > 0) {
    return (list as readonly string[]).includes(category)
  }

  return true
}

function get_dev_mentions() {
  return get_allowed_users()
    .map((id) => `<@${id}>`)
    .join(' ')
}

function get_allowed_users() {
  const raw = process.env.DISCORD_DEV_USER_IDS

  if (!raw) {
    return []
  }

  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

export async function debug_event(input: {
  category: string
  event: string
  payload?: Record<string, unknown>
}) {
  const rule = resolve_debug_rule({
    category: input.category,
    event: input.event,
    payload: input.payload,
  })

  if (
    !rule.channels.includes('discord') ||
    !allow_discord_debug_category(rule.category, input.event)
  ) {
    return
  }

  try {
    await notify({
      event: 'debug_trace',
      category: rule.category,
      debug_event: input.event,
      payload: {
        level: rule.level,
        ...(input.payload ?? {}),
      },
    })
  } catch {
    // never block callers
  }
}

export async function debug(payload: debug_payload) {
  if (!allow_discord_debug_category(payload.category, payload.event)) {
    return
  }

  const webhook_url = process.env.DISCORD_DEBUG_WEBHOOK_URL

  if (!webhook_url) {
    return
  }

  const mentions = get_dev_mentions()

  const content = [
    mentions,
    `**[DEBUG] ${payload.category.toUpperCase()}**`,
    `event: \`${payload.event}\``,
    payload.message ? `message: ${payload.message}` : null,
    payload.data
      ? `\`\`\`json\n${JSON.stringify(payload.data, null, 2)}\n\`\`\``
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  await fetch(webhook_url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      content,
      allowed_mentions: {
        users: get_allowed_users(),
      },
    }),
  })
}
