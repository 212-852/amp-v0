import 'server-only'

import { debug_event } from '@/lib/debug'
import {
  line_liff_verify_channel_id,
  line_login_channel_id,
  next_public_liff_id,
} from '@/lib/config/line/env'
import { normalized_app_url } from '@/lib/config/env'

export type liff_auth_failed_payload = {
  current_url?: string | null
  pathname?: string | null
  search?: string | null
  return_path?: string | null
  liff_id_exists?: boolean
  liff_initialized?: boolean
  is_in_client?: boolean
  is_liff_browser?: boolean
  is_logged_in?: boolean
  has_access_token?: boolean
  line_user_id_exists?: boolean
  line_profile_loaded?: boolean
  session_restored?: boolean
  user_uuid?: string | null
  visitor_uuid?: string | null
  role?: string | null
  tier?: string | null
  error_code?: string | null
  error_message?: string | null
  reason?: string | null
  http_status?: number | null
  env_app_url?: string | null
  env_liff_id_exists?: boolean
  env_line_channel_id_exists?: boolean
  env_line_channel_secret_exists?: boolean
  [key: string]: unknown
}

export function read_liff_env_snapshot() {
  return {
    env_app_url: normalized_app_url() || null,
    env_liff_id_exists: Boolean(next_public_liff_id()),
    env_line_channel_id_exists: Boolean(line_login_channel_id()),
    env_line_channel_secret_exists: Boolean(
      process.env.LINE_LOGIN_CHANNEL_SECRET?.trim(),
    ),
    env_liff_verify_channel_id: line_liff_verify_channel_id(),
  }
}

export async function emit_liff_auth_failed(
  payload: liff_auth_failed_payload,
) {
  await debug_event({
    category: 'liff',
    event: 'liff_auth_failed',
    payload: {
      ...read_liff_env_snapshot(),
      ...payload,
    },
  })
}
