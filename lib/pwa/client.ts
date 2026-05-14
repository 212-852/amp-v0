'use client'

import { useEffect, useState } from 'react'

import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

type pwa_debug_payload = {
  event: string
  user_uuid?: string | null
  participant_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: string | null
  room_uuid?: string | null
  message_count?: number | null
  message_uuid?: string | null
  notification_route?: string | null
  has_push_subscription?: boolean | null
  permission?: string | null
  enabled?: boolean | null
  has_line_identity?: boolean | null
  has_beforeinstallprompt?: boolean | null
  is_standalone?: boolean | null
  manifest_available?: boolean | null
  manifest_exists?: boolean | null
  manifest_valid?: boolean | null
  manifest_url?: string | null
  service_worker_supported?: boolean | null
  service_worker_registered?: boolean | null
  is_https?: boolean | null
  is_localhost_exception?: boolean | null
  is_secure_context?: boolean | null
  is_installable?: boolean | null
  user_agent?: string | null
  app_visibility_state?: string | null
  error_code?: string | null
  error_message?: string | null
  error_details?: string | null
  error_hint?: string | null
  modal_reused?: string | null
  install_client_os?: string | null
  prompt_available?: boolean | null
  platform?: string | null
  click_handler_reached?: boolean | null
  modal_component_name?: string | null
  reason?: string | null
  phase: string
  locale?: string | null
  fallback_used?: boolean | null
  current_url?: string | null
  is_ios?: boolean | null
  is_liff?: boolean | null
  host?: string | null
  origin?: string | null
  pathname?: string | null
  visitor_uuid?: string | null
  link_session_uuid?: string | null
  pass_uuid?: string | null
  poll_status?: string | null
  state_exists?: boolean | null
  completed_user_uuid?: string | null
  provider?: string | null
  status?: string | null
  return_path?: string | null
  cookie_present?: boolean | null
  local_storage_visitor_present?: boolean | null
  session_restored?: boolean | null
  identity_provider?: string | null
}

export type pwa_before_install_prompt_event = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let retained_before_install_prompt: pwa_before_install_prompt_event | null = null
const before_install_prompt_listeners = new Set<
  (event: pwa_before_install_prompt_event | null) => void
>()

function notify_before_install_prompt_listeners() {
  for (const listener of before_install_prompt_listeners) {
    listener(retained_before_install_prompt)
  }
}

export function get_retained_before_install_prompt() {
  return retained_before_install_prompt
}

export function clear_retained_before_install_prompt() {
  retained_before_install_prompt = null
  notify_before_install_prompt_listeners()
}

export function subscribe_before_install_prompt(
  listener: (event: pwa_before_install_prompt_event | null) => void,
) {
  before_install_prompt_listeners.add(listener)
  listener(retained_before_install_prompt)

  return () => {
    before_install_prompt_listeners.delete(listener)
  }
}

export function capture_before_install_prompt(event: Event) {
  event.preventDefault()
  retained_before_install_prompt = event as pwa_before_install_prompt_event
  notify_before_install_prompt_listeners()

  post_pwa_debug({
    event: 'pwa_beforeinstallprompt_received',
    phase: 'beforeinstallprompt',
    ...build_pwa_diagnostic_payload({
      has_beforeinstallprompt: true,
    }),
  })
}

export function use_before_install_prompt_state() {
  const [prompt, set_prompt] = useState<pwa_before_install_prompt_event | null>(
    () =>
      typeof window === 'undefined'
        ? null
        : get_retained_before_install_prompt(),
  )

  useEffect(() => subscribe_before_install_prompt(set_prompt), [])

  return prompt
}

export function post_pwa_debug(input: pwa_debug_payload) {
  void fetch('/api/debug/pwa', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => {})
}

export function set_pwa_source_channel_cookie() {
  document.cookie = [
    `${browser_channel_cookie_name}=pwa`,
    'Path=/',
    'Max-Age=31536000',
    'SameSite=Lax',
  ].join('; ')
}

export function is_standalone_pwa() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  )
}

export function manifest_is_available() {
  return Boolean(document.querySelector('link[rel="manifest"]'))
}

export type pwa_manifest_probe_result = {
  manifest_url: string
  manifest_exists: boolean
  manifest_valid: boolean
}

/**
 * Fetches the linked web app manifest and validates install-related fields.
 */
export async function load_pwa_manifest_for_debug(): Promise<pwa_manifest_probe_result> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      manifest_url: '',
      manifest_exists: false,
      manifest_valid: false,
    }
  }

  const link = document.querySelector(
    'link[rel="manifest"]',
  ) as HTMLLinkElement | null
  const manifest_url = link?.href
    ? link.href
    : new URL('/manifest.webmanifest', window.location.origin).toString()

  try {
    const response = await fetch(manifest_url, {
      credentials: 'same-origin',
      cache: 'no-store',
    })

    if (!response.ok) {
      return {
        manifest_url,
        manifest_exists: false,
        manifest_valid: false,
      }
    }

    const json = (await response.json()) as Record<string, unknown>
    const icons = json.icons
    const has_icons = Array.isArray(icons) && icons.length > 0
    const manifest_valid = Boolean(
      typeof json.name === 'string' &&
        json.name.trim().length > 0 &&
        typeof json.short_name === 'string' &&
        json.short_name.trim().length > 0 &&
        json.display === 'standalone' &&
        typeof json.start_url === 'string' &&
        json.start_url.trim().length > 0 &&
        typeof json.theme_color === 'string' &&
        typeof json.background_color === 'string' &&
        has_icons,
    )

    return {
      manifest_url,
      manifest_exists: true,
      manifest_valid,
    }
  } catch {
    return {
      manifest_url,
      manifest_exists: false,
      manifest_valid: false,
    }
  }
}

export type pwa_diagnostic_merge_input = {
  manifest_exists?: boolean | null
  manifest_valid?: boolean | null
  manifest_url?: string | null
  service_worker_registered?: boolean | null
  has_beforeinstallprompt?: boolean | null
}

/**
 * Builds the standard PWA diagnostic payload for debug events (browser only).
 */
export function build_pwa_diagnostic_payload(
  input: pwa_diagnostic_merge_input = {},
): Omit<pwa_debug_payload, 'event' | 'phase' | 'error_code' | 'error_message'> & {
  error_code?: string | null
  error_message?: string | null
} {
  if (typeof window === 'undefined') {
    return {
      user_agent: null,
      app_visibility_state: null,
      source_channel: 'web',
      is_standalone: false,
      is_https: null,
      is_localhost_exception: null,
      is_secure_context: null,
      service_worker_supported: null,
      has_beforeinstallprompt: null,
      manifest_available: null,
      manifest_exists: input.manifest_exists ?? null,
      manifest_valid: input.manifest_valid ?? null,
      manifest_url: input.manifest_url ?? null,
      service_worker_registered: input.service_worker_registered ?? null,
      is_installable: null,
    }
  }

  const loc = window.location
  const host = loc.hostname
  const is_localhost_exception =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]'
  const is_https = loc.protocol === 'https:'
  const is_secure_context = window.isSecureContext
  const service_worker_supported = 'serviceWorker' in navigator
  const has_beforeinstallprompt =
    input.has_beforeinstallprompt ??
    Boolean(get_retained_before_install_prompt())
  const manifest_exists = input.manifest_exists ?? null
  const manifest_valid = input.manifest_valid ?? null
  const manifest_url = input.manifest_url ?? null
  const service_worker_registered = input.service_worker_registered ?? null

  const manifest_ok =
    manifest_exists === true && manifest_valid === true
  const transport_ok =
    is_secure_context && (is_https || is_localhost_exception)
  const sw_ok = service_worker_registered === true
  const bip_ok = has_beforeinstallprompt === true

  const is_installable = Boolean(
    transport_ok && manifest_ok && sw_ok && bip_ok,
  )

  return {
    user_agent: navigator.userAgent,
    app_visibility_state: document.visibilityState,
    source_channel: is_standalone_pwa() ? 'pwa' : 'web',
    host: loc.host,
    origin: loc.origin,
    pathname: loc.pathname,
    is_standalone: is_standalone_pwa(),
    is_https,
    is_localhost_exception,
    is_secure_context,
    service_worker_supported,
    has_beforeinstallprompt,
    manifest_available: manifest_is_available(),
    manifest_exists,
    manifest_valid,
    manifest_url,
    service_worker_registered,
    is_installable,
  }
}

export function post_pwa_installability_checked(
  input: pwa_diagnostic_merge_input,
) {
  post_pwa_debug({
    event: 'pwa_installability_checked',
    phase: 'pwa_bootstrap',
    ...build_pwa_diagnostic_payload(input),
  })
}

export async function register_pwa_service_worker_with_debug(): Promise<ServiceWorkerRegistration | null> {
  post_pwa_debug({
    event: 'pwa_service_worker_register_started',
    phase: 'pwa_bootstrap',
    ...build_pwa_diagnostic_payload({
      service_worker_registered: false,
      manifest_exists: null,
      manifest_valid: null,
      manifest_url: null,
    }),
  })

  if (!('serviceWorker' in navigator)) {
    post_pwa_debug({
      event: 'pwa_service_worker_register_failed',
      phase: 'pwa_bootstrap',
      ...build_pwa_diagnostic_payload({
        service_worker_registered: false,
      }),
      error_code: 'service_worker_not_supported',
      error_message: 'navigator.serviceWorker is not available',
    })

    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')

    post_pwa_debug({
      event: 'pwa_service_worker_register_succeeded',
      phase: 'pwa_bootstrap',
      ...build_pwa_diagnostic_payload({
        service_worker_registered: true,
      }),
    })

    return registration
  } catch (error) {
    post_pwa_debug({
      event: 'pwa_service_worker_register_failed',
      phase: 'pwa_bootstrap',
      ...build_pwa_diagnostic_payload({
        service_worker_registered: false,
      }),
      error_code: 'service_worker_register_threw',
      error_message:
        error instanceof Error ? error.message : String(error),
    })

    return null
  }
}

export function log_pwa_installability_state(input: {
  phase: string
  has_beforeinstallprompt: boolean
  service_worker_registered?: boolean | null
}) {
  console.log('[pwa_installability]', {
    phase: input.phase,
    navigator_standalone:
      (window.navigator as Navigator & { standalone?: boolean }).standalone ??
      null,
    display_mode_standalone: window.matchMedia('(display-mode: standalone)')
      .matches,
    beforeinstallprompt_captured: input.has_beforeinstallprompt,
    manifest_available: manifest_is_available(),
    service_worker_registered: input.service_worker_registered ?? null,
    user_agent: navigator.userAgent,
  })
}

export async function register_pwa_service_worker() {
  if (!('serviceWorker' in navigator)) {
    return null
  }

  return navigator.serviceWorker.register('/sw.js')
}

function url_base64_to_uint8_array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }

  return output
}

export async function register_push_subscription(input: {
  user_uuid: string | null
  participant_uuid: string | null
  room_uuid: string | null
  role: string | null
  tier: string | null
}) {
  const service_worker_supported = 'serviceWorker' in navigator

  post_pwa_debug({
    event: 'push_service_worker_checked',
    ...input,
    source_channel: 'pwa',
    service_worker_supported,
    has_push_subscription: false,
    app_visibility_state: document.visibilityState,
    phase: 'push_capability_check',
  })

  if (
    !('Notification' in window) ||
    !('PushManager' in window) ||
    !service_worker_supported
  ) {
    post_pwa_debug({
      event: 'push_subscription_save_failed',
      ...input,
      source_channel: 'pwa',
      service_worker_supported,
      has_push_subscription: false,
      app_visibility_state: document.visibilityState,
      error_code: 'push_not_supported',
      error_message: 'Push API is not supported in this browser',
      phase: 'push_capability_check',
    })

    return false
  }

  const public_key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  if (!public_key) {
    post_pwa_debug({
      event: 'push_subscription_save_failed',
      ...input,
      source_channel: 'pwa',
      service_worker_supported,
      has_push_subscription: false,
      app_visibility_state: document.visibilityState,
      error_code: 'vapid_public_key_missing',
      error_message: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured',
      phase: 'push_key_check',
    })

    return false
  }

  try {
    const registration = await register_pwa_service_worker()

    if (!registration) {
      throw new Error('service_worker_registration_missing')
    }

    const initial_permission = Notification.permission

    if (initial_permission === 'default') {
      post_pwa_debug({
        event: 'push_permission_requested',
        ...input,
        source_channel: 'pwa',
        service_worker_supported,
        permission: initial_permission,
        app_visibility_state: document.visibilityState,
        phase: 'push_permission_request',
      })
    }

    const permission =
      initial_permission === 'default'
        ? await Notification.requestPermission()
        : initial_permission

    if (permission !== 'granted') {
      post_pwa_debug({
        event: 'push_permission_denied',
        ...input,
        source_channel: 'pwa',
        service_worker_supported,
        permission,
        has_push_subscription: false,
        app_visibility_state: document.visibilityState,
        error_code: `permission_${permission}`,
        error_message: 'notification_permission_denied',
        phase: 'push_permission_request',
      })
      throw new Error(`notification_permission_${permission}`)
    }

    post_pwa_debug({
      event: 'push_permission_granted',
      ...input,
      source_channel: 'pwa',
      service_worker_supported,
      permission,
      app_visibility_state: document.visibilityState,
      phase: 'push_permission_request',
    })

    post_pwa_debug({
      event: 'push_subscribe_started',
      ...input,
      source_channel: 'pwa',
      service_worker_supported,
      permission,
      has_push_subscription: false,
      app_visibility_state: document.visibilityState,
      phase: 'push_manager_subscribe',
    })

    const existing_subscription =
      await registration.pushManager.getSubscription()
    const subscription =
      existing_subscription ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: url_base64_to_uint8_array(public_key),
      }))

    post_pwa_debug({
      event: 'push_subscribe_succeeded',
      ...input,
      source_channel: 'pwa',
      service_worker_supported,
      permission,
      has_push_subscription: true,
      app_visibility_state: document.visibilityState,
      phase: 'push_manager_subscribe',
    })

    post_pwa_debug({
      event: 'push_subscription_save_started',
      ...input,
      source_channel: 'pwa',
      service_worker_supported,
      permission,
      has_push_subscription: true,
      app_visibility_state: document.visibilityState,
      phase: 'push_subscription_api',
    })

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        room_uuid: input.room_uuid,
        participant_uuid: input.participant_uuid,
        subscription: subscription.toJSON(),
        user_agent: navigator.userAgent,
        is_pwa: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`subscription_save_http_${response.status}`)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('amp_session_changed'))
    }

    post_pwa_debug({
      event: 'push_subscription_save_succeeded',
      ...input,
      source_channel: 'pwa',
      service_worker_supported,
      permission,
      has_push_subscription: true,
      app_visibility_state: document.visibilityState,
      phase: 'push_subscription_api',
    })

    post_pwa_debug({
      event: 'push_subscription_saved',
      ...input,
      source_channel: 'pwa',
      service_worker_supported,
      permission,
      has_push_subscription: true,
      app_visibility_state: document.visibilityState,
      phase: 'push_subscription_saved',
    })

    return true
  } catch (error) {
    post_pwa_debug({
      event: 'push_subscription_save_failed',
      ...input,
      source_channel: 'pwa',
      service_worker_supported,
      permission:
        'Notification' in window ? Notification.permission : null,
      has_push_subscription: false,
      app_visibility_state: document.visibilityState,
      error_message: error instanceof Error ? error.message : String(error),
      phase: 'push_subscription_save_failed',
    })

    post_pwa_debug({
      event: 'push_subscription_failed',
      ...input,
      source_channel: 'pwa',
      service_worker_supported,
      permission:
        'Notification' in window ? Notification.permission : null,
      has_push_subscription: false,
      app_visibility_state: document.visibilityState,
      error_message: error instanceof Error ? error.message : String(error),
      phase: 'push_subscription_failed',
    })

    return false
  }
}
