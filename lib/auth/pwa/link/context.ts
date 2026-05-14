import 'server-only'

import { clean_uuid } from '@/lib/db/uuid/payload'

import {
  is_valid_pass_uuid,
  normalize_pass_code,
  pwa_line_link_purpose,
} from './rules'

export type pwa_line_link_status_lookup = {
  visitor_uuid: string | null
  purpose: string
  pass_uuid: string | null
  code: string | null
}

export function normalize_pwa_line_link_status_body(body: Record<
  string,
  unknown
> | null): pwa_line_link_status_lookup {
  const purpose_raw =
    typeof body?.purpose === 'string' ? body.purpose.trim() : ''

  const purpose =
    purpose_raw.length > 0 ? purpose_raw : pwa_line_link_purpose

  const visitor_uuid = clean_uuid(body?.visitor_uuid)

  if (visitor_uuid) {
    return { visitor_uuid, purpose, pass_uuid: null, code: null }
  }

  const pass_uuid = clean_uuid(body?.pass_uuid)
  const from_link = normalize_pass_code(
    typeof body?.link_session_uuid === 'string'
      ? body.link_session_uuid
      : typeof body?.link_state === 'string'
        ? body.link_state
        : null,
  )
  const code = normalize_pass_code(
    typeof body?.code === 'string' ? body.code : null,
  )

  if (pass_uuid) {
    return { visitor_uuid: null, purpose, pass_uuid, code: null }
  }

  if (code.length > 0) {
    return { visitor_uuid: null, purpose, pass_uuid: null, code }
  }

  if (from_link.length > 0) {
    if (is_valid_pass_uuid(from_link)) {
      return { visitor_uuid: null, purpose, pass_uuid: from_link, code: null }
    }

    return { visitor_uuid: null, purpose, pass_uuid: null, code: from_link }
  }

  return {
    visitor_uuid: null,
    purpose,
    pass_uuid: null,
    code: null,
  }
}
