import { NextResponse } from 'next/server'

import { debug_event } from '@/lib/debug'

type pwa_debug_body = {
  event?: unknown
  user_uuid?: unknown
  participant_uuid?: unknown
  role?: unknown
  tier?: unknown
  source_channel?: unknown
  room_uuid?: unknown
  message_count?: unknown
  message_uuid?: unknown
  notification_route?: unknown
  primary_channel?: unknown
  from_primary_channel?: unknown
  to_primary_channel?: unknown
  has_push_subscription?: unknown
  permission?: unknown
  enabled?: unknown
  has_line_identity?: unknown
  has_beforeinstallprompt?: unknown
  is_standalone?: unknown
  manifest_available?: unknown
  service_worker_registered?: unknown
  user_agent?: unknown
  app_visibility_state?: unknown
  error_code?: unknown
  error_message?: unknown
  error_details?: unknown
  error_hint?: unknown
  phase?: unknown
  modal_reused?: unknown
  install_client_os?: unknown
  prompt_available?: unknown
  platform?: unknown
  click_handler_reached?: unknown
  modal_component_name?: unknown
  reason?: unknown
  locale?: unknown
  fallback_used?: unknown
  current_url?: unknown
  is_ios?: unknown
  is_liff?: unknown
  host?: unknown
  origin?: unknown
  pathname?: unknown
  visitor_uuid?: unknown
  link_session_uuid?: unknown
  state_exists?: unknown
  completed_user_uuid?: unknown
  provider?: unknown
  status?: unknown
  return_path?: unknown
  cookie_present?: unknown
  local_storage_visitor_present?: unknown
  session_restored?: unknown
  identity_provider?: unknown
  manifest_exists?: unknown
  manifest_valid?: unknown
  manifest_url?: unknown
  service_worker_supported?: unknown
  is_https?: unknown
  is_localhost_exception?: unknown
  is_secure_context?: unknown
  is_installable?: unknown
}

function string_or_null(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | pwa_debug_body
    | null
  const event = string_or_null(body?.event)

  if (!event) {
    return NextResponse.json(
      { ok: false, error: 'missing_debug_event' },
      { status: 400 },
    )
  }

  await debug_event({
    category: 'pwa',
    event,
    payload: {
      user_uuid: string_or_null(body?.user_uuid),
      participant_uuid: string_or_null(body?.participant_uuid),
      role: string_or_null(body?.role),
      tier: string_or_null(body?.tier),
      source_channel: string_or_null(body?.source_channel),
      room_uuid: string_or_null(body?.room_uuid),
      message_count:
        typeof body?.message_count === 'number' ? body.message_count : null,
      message_uuid: string_or_null(body?.message_uuid),
      notification_route: string_or_null(body?.notification_route),
      primary_channel: string_or_null(body?.primary_channel),
      from_primary_channel: string_or_null(body?.from_primary_channel),
      to_primary_channel: string_or_null(body?.to_primary_channel),
      has_push_subscription:
        typeof body?.has_push_subscription === 'boolean'
          ? body.has_push_subscription
          : null,
      permission: string_or_null(body?.permission),
      enabled:
        typeof body?.enabled === 'boolean'
          ? body.enabled
          : null,
      has_line_identity:
        typeof body?.has_line_identity === 'boolean'
          ? body.has_line_identity
          : null,
      has_beforeinstallprompt:
        typeof body?.has_beforeinstallprompt === 'boolean'
          ? body.has_beforeinstallprompt
          : null,
      is_standalone:
        typeof body?.is_standalone === 'boolean'
          ? body.is_standalone
          : null,
      manifest_available:
        typeof body?.manifest_available === 'boolean'
          ? body.manifest_available
          : null,
      service_worker_registered:
        typeof body?.service_worker_registered === 'boolean'
          ? body.service_worker_registered
          : null,
      user_agent: string_or_null(body?.user_agent),
      app_visibility_state: string_or_null(body?.app_visibility_state),
      error_code: string_or_null(body?.error_code),
      error_message: string_or_null(body?.error_message),
      error_details: string_or_null(body?.error_details),
      error_hint: string_or_null(body?.error_hint),
      modal_reused:
        typeof body?.modal_reused === 'string' ? body.modal_reused.trim() : null,
      install_client_os: string_or_null(body?.install_client_os),
      prompt_available:
        typeof body?.prompt_available === 'boolean'
          ? body.prompt_available
          : null,
      platform: string_or_null(body?.platform),
      click_handler_reached:
        typeof body?.click_handler_reached === 'boolean'
          ? body.click_handler_reached
          : null,
      modal_component_name: string_or_null(body?.modal_component_name),
      reason: string_or_null(body?.reason),
      phase: string_or_null(body?.phase),
      locale: string_or_null(body?.locale),
      fallback_used:
        typeof body?.fallback_used === 'boolean' ? body.fallback_used : null,
      current_url: string_or_null(body?.current_url),
      is_ios: typeof body?.is_ios === 'boolean' ? body.is_ios : null,
      is_liff: typeof body?.is_liff === 'boolean' ? body.is_liff : null,
      host: string_or_null(body?.host),
      origin: string_or_null(body?.origin),
      pathname: string_or_null(body?.pathname),
      visitor_uuid: string_or_null(body?.visitor_uuid),
      link_session_uuid: string_or_null(body?.link_session_uuid),
      state_exists:
        typeof body?.state_exists === 'boolean' ? body.state_exists : null,
      completed_user_uuid: string_or_null(body?.completed_user_uuid),
      provider: string_or_null(body?.provider),
      status: string_or_null(body?.status),
      return_path: string_or_null(body?.return_path),
      cookie_present:
        typeof body?.cookie_present === 'boolean' ? body.cookie_present : null,
      local_storage_visitor_present:
        typeof body?.local_storage_visitor_present === 'boolean'
          ? body.local_storage_visitor_present
          : null,
      session_restored:
        typeof body?.session_restored === 'boolean'
          ? body.session_restored
          : null,
      identity_provider: string_or_null(body?.identity_provider),
      manifest_exists:
        typeof body?.manifest_exists === 'boolean'
          ? body.manifest_exists
          : null,
      manifest_valid:
        typeof body?.manifest_valid === 'boolean' ? body.manifest_valid : null,
      manifest_url: string_or_null(body?.manifest_url),
      service_worker_supported:
        typeof body?.service_worker_supported === 'boolean'
          ? body.service_worker_supported
          : null,
      is_https: typeof body?.is_https === 'boolean' ? body.is_https : null,
      is_localhost_exception:
        typeof body?.is_localhost_exception === 'boolean'
          ? body.is_localhost_exception
          : null,
      is_secure_context:
        typeof body?.is_secure_context === 'boolean'
          ? body.is_secure_context
          : null,
      is_installable:
        typeof body?.is_installable === 'boolean'
          ? body.is_installable
          : null,
    },
  })

  return NextResponse.json({ ok: true })
}
