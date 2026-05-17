'use client'

import type { chat_action_realtime_payload } from './chat_actions'

export type client_presence_source_channel = 'web' | 'pwa' | 'liff'

export function resolve_client_presence_source_channel(): client_presence_source_channel {
  if (typeof window === 'undefined') {
    return 'web'
  }

  const href = window.location.href.toLowerCase()
  const referrer = document.referrer.toLowerCase()
  const is_liff =
    href.includes('liff') ||
    referrer.includes('liff.line.me') ||
    window.location.hostname.includes('liff.line.me')

  if (is_liff) {
    return 'liff'
  }

  const is_standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true

  return is_standalone ? 'pwa' : 'web'
}

export type support_room_api_action = {
  action_uuid: string
  action_type: string
  body: string | null
  created_at: string | null
  actor_display_name: string | null
  actor_user_uuid: string | null
  room_uuid: string
  source_channel: string | null
}

export type enter_support_room_client_result =
  | {
      ok: true
      skipped?: boolean
      action?: support_room_api_action
    }
  | { ok: false; error: string }

export type leave_support_room_client_result =
  | {
      ok: true
      skipped?: boolean
      action?: support_room_api_action
    }
  | { ok: false; error: string }

function parse_support_room_api_action(
  value: unknown,
  room_uuid: string,
): support_room_api_action | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const row = value as Record<string, unknown>
  const action_uuid =
    typeof row.action_uuid === 'string' && row.action_uuid.trim()
      ? row.action_uuid.trim()
      : ''
  const action_type =
    typeof row.action_type === 'string' && row.action_type.trim()
      ? row.action_type.trim()
      : ''

  if (!action_uuid || !action_type) {
    return null
  }

  return {
    action_uuid,
    action_type,
    body: typeof row.body === 'string' ? row.body : null,
    created_at:
      typeof row.created_at === 'string' ? row.created_at : null,
    actor_display_name:
      typeof row.actor_display_name === 'string'
        ? row.actor_display_name
        : null,
    actor_user_uuid:
      typeof row.actor_user_uuid === 'string'
        ? row.actor_user_uuid
        : null,
    room_uuid:
      typeof row.room_uuid === 'string' && row.room_uuid.trim()
        ? row.room_uuid.trim()
        : room_uuid,
    source_channel:
      typeof row.source_channel === 'string' ? row.source_channel : null,
  }
}

export function support_room_api_action_to_realtime(
  action: support_room_api_action,
): chat_action_realtime_payload {
  return {
    room_uuid: action.room_uuid,
    action_uuid: action.action_uuid,
    action_type: action.action_type,
    body: action.body,
    created_at: action.created_at,
    actor_user_uuid: action.actor_user_uuid,
    actor_display_name: action.actor_display_name,
    source_channel: action.source_channel,
  }
}

export async function call_enter_support_room(input: {
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string
  client_session_id?: string | null
  trigger_source?: string | null
}): Promise<enter_support_room_client_result> {
  const response = await fetch('/api/chat/reception/open', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      room_uuid: input.room_uuid,
      admin_user_uuid: input.admin_user_uuid,
      admin_participant_uuid: input.admin_participant_uuid,
      client_session_id: input.client_session_id ?? null,
      trigger_source: input.trigger_source ?? null,
    }),
  })

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!response.ok) {
    return {
      ok: false,
      error:
        typeof body?.error === 'string'
          ? body.error
          : `enter_${response.status}`,
    }
  }

  if (body?.ok !== true) {
    return {
      ok: false,
      error:
        typeof body?.error === 'string' ? body.error : 'enter_not_ok',
    }
  }

  const action = parse_support_room_api_action(body.action, input.room_uuid)

  return {
    ok: true,
    skipped: body.skipped === true,
    action: action ?? undefined,
  }
}

export async function call_leave_support_room(input: {
  room_uuid: string
  participant_uuid: string
  leave_reason: string
  support_session_key?: string
  action?: 'admin_support_leave' | 'admin_support_page_unload'
  keepalive?: boolean
}): Promise<leave_support_room_client_result> {
  const response = await fetch('/api/chat/presence', {
    method: 'POST',
    credentials: 'include',
    keepalive: input.keepalive,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      room_uuid: input.room_uuid,
      participant_uuid: input.participant_uuid,
      action: input.action ?? 'admin_support_leave',
      last_channel: resolve_client_presence_source_channel(),
      active_area: 'admin_reception_room',
      leave_reason: input.leave_reason,
      previous_active_room_uuid: input.room_uuid,
      next_active_room_uuid: null,
      support_session_key: input.support_session_key,
    }),
  })

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!response.ok) {
    return {
      ok: false,
      error:
        typeof body?.error === 'string'
          ? body.error
          : `leave_${response.status}`,
    }
  }

  if (body?.ok !== true) {
    return {
      ok: false,
      error:
        typeof body?.error === 'string' ? body.error : 'leave_not_ok',
    }
  }

  const action = parse_support_room_api_action(body.action, input.room_uuid)

  return {
    ok: true,
    skipped: body.skipped === true,
    action: action ?? undefined,
  }
}
