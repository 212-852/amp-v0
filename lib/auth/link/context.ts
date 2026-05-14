import 'server-only'

import { clean_uuid } from '@/lib/db/uuid/payload'
import {
  normalize_link_provider,
  normalize_link_source_channel,
  normalize_return_path,
} from './rules'

export type start_link_context = {
  visitor_uuid: string | null
  user_uuid: string | null
  source_channel: ReturnType<typeof normalize_link_source_channel>
  provider: ReturnType<typeof normalize_link_provider>
  return_path: string | null
  is_standalone: boolean
}

export function build_start_link_context(input: {
  body: Record<string, unknown> | null
  visitor_uuid: string | null
  user_uuid: string | null
}): start_link_context {
  return {
    visitor_uuid: clean_uuid(input.visitor_uuid),
    user_uuid: clean_uuid(input.user_uuid),
    source_channel: normalize_link_source_channel(input.body?.source_channel),
    provider: normalize_link_provider(input.body?.provider),
    return_path: normalize_return_path(input.body?.return_path),
    is_standalone: input.body?.is_standalone === true,
  }
}

export function normalize_status_context(input: {
  link_session_uuid?: unknown
  link_state?: unknown
}) {
  const from_state =
    typeof input.link_state === 'string' ? input.link_state.trim() : ''
  const from_legacy =
    typeof input.link_session_uuid === 'string'
      ? input.link_session_uuid.trim()
      : ''
  const link_session_uuid =
    from_state.length > 0
      ? from_state
      : from_legacy.length > 0
        ? from_legacy
        : null

  return {
    link_session_uuid,
  }
}

