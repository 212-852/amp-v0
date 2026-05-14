import 'server-only'

import {
  get_pwa_line_link_poll_status,
  run_pwa_line_link_start,
  type pwa_line_link_start_failure,
} from '@/lib/auth/pwa/link/action'
import type { auth_link_status } from '@/lib/auth/link/rules'

export type auth_link_start_success = {
  ok: true
  auth_url: string
  /** LINE OAuth `state` (same as `code` on one_time_passes). */
  link_state: string
  pass_uuid: string
  code: string
  status: auth_link_status
  visitor_uuid: string | null
  user_uuid: string | null
  source_channel: string
}

export type auth_link_start_failure = pwa_line_link_start_failure

export async function run_auth_link_start(input: {
  body: Record<string, unknown> | null
  visitor_uuid: string | null
}): Promise<auth_link_start_success | auth_link_start_failure> {
  const result = await run_pwa_line_link_start(input)

  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    auth_url: result.auth_url,
    link_state: result.code,
    pass_uuid: result.pass_uuid,
    code: result.code,
    status: result.status,
    visitor_uuid: result.visitor_uuid,
    user_uuid: result.user_uuid,
    source_channel: result.source_channel,
  }
}

export async function get_auth_link_session_status(
  input: string | Record<string, unknown> | null,
) {
  const body =
    typeof input === 'string'
      ? { link_session_uuid: input }
      : input ?? {}

  return get_pwa_line_link_poll_status({ body })
}
