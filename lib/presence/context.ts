import 'server-only'

import type { session_user } from '@/lib/auth/route'
import { clean_uuid } from '@/lib/db/uuid/payload'

import {
  normalize_presence_area,
  normalize_presence_channel,
  normalize_presence_visible,
  type presence_area,
  type presence_channel,
  type presence_context_ok,
} from './rules'

export type presence_context_result =
  | {
      ok: true
      context: presence_context_ok
    }
  | {
      ok: false
      error: 'presence_session_missing' | 'presence_input_invalid'
    }

function resolve_presence_role(session: session_user): string | null {
  const role =
    typeof session.role === 'string' && session.role.trim().length > 0
      ? session.role.trim()
      : null

  return role
}

function resolve_presence_area_from_body(
  body: Record<string, unknown> | null,
): presence_area {
  const area =
    normalize_presence_area(body?.area) ??
    normalize_presence_area(body?.active_area)

  return area ?? 'app'
}

function resolve_presence_channel_from_body(
  body: Record<string, unknown> | null,
): presence_channel {
  return (
    normalize_presence_channel(body?.channel) ??
    normalize_presence_channel(body?.source_channel) ??
    'web'
  )
}

function resolve_presence_visible_from_body(
  body: Record<string, unknown> | null,
): boolean {
  const visible =
    normalize_presence_visible(body?.visible) ??
    normalize_presence_visible(body?.visibility_state)

  return visible === true
}

export function resolve_presence_context(input: {
  session: session_user
  body: Record<string, unknown> | null
}): presence_context_result {
  const user_uuid = clean_uuid(input.session.user_uuid)
  const role = resolve_presence_role(input.session)

  if (!user_uuid || !role) {
    return {
      ok: false,
      error: 'presence_session_missing',
    }
  }

  return {
    ok: true,
    context: {
      user_uuid,
      role,
      channel: resolve_presence_channel_from_body(input.body),
      area: resolve_presence_area_from_body(input.body),
      visible: resolve_presence_visible_from_body(input.body),
    },
  }
}
