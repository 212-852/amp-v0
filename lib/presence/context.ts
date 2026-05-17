import 'server-only'

import type { session_user } from '@/lib/auth/route'
import { clean_uuid } from '@/lib/db/uuid/payload'

import {
  normalize_presence_active_area,
  normalize_presence_source_channel,
  normalize_presence_visibility_state,
  type presence_context_ok,
} from './rules'

export type presence_context_result =
  | {
      ok: true
      context: presence_context_ok
    }
  | {
      ok: false
      error: 'presence_session_missing'
    }

export function resolve_presence_context(input: {
  session: session_user
  body: Record<string, unknown> | null
}): presence_context_result {
  const user_uuid = clean_uuid(input.session.user_uuid)

  if (!user_uuid) {
    return {
      ok: false,
      error: 'presence_session_missing',
    }
  }

  return {
    ok: true,
    context: {
      user_uuid,
      role: input.session.role,
      source_channel: normalize_presence_source_channel(
        input.body?.source_channel,
      ),
      active_area: normalize_presence_active_area(input.body?.active_area),
      active_room_uuid: clean_uuid(input.body?.active_room_uuid),
      visibility_state: normalize_presence_visibility_state(
        input.body?.visibility_state,
      ),
    },
  }
}
