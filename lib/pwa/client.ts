'use client'

import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

type pwa_debug_payload = {
  event: string
  user_uuid?: string | null
  participant_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: string | null
  room_uuid?: string | null
  message_uuid?: string | null
  notification_route?: string | null
  has_push_subscription?: boolean | null
  has_line_identity?: boolean | null
  app_visibility_state?: string | null
  error_code?: string | null
  error_message?: string | null
  phase: string
}

export type pwa_before_install_prompt_event = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
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
  if (!('Notification' in window) || !('PushManager' in window)) {
    post_pwa_debug({
      event: 'push_subscription_save_failed',
      ...input,
      source_channel: 'pwa',
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
      has_push_subscription: false,
      app_visibility_state: document.visibilityState,
      error_code: 'vapid_public_key_missing',
      error_message: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured',
      phase: 'push_key_check',
    })

    return false
  }

  post_pwa_debug({
    event: 'push_subscription_save_started',
    ...input,
    source_channel: 'pwa',
    has_push_subscription: false,
    app_visibility_state: document.visibilityState,
    phase: 'push_subscribe_started',
  })

  try {
    const permission = await Notification.requestPermission()

    if (permission !== 'granted') {
      throw new Error(`notification_permission_${permission}`)
    }

    const registration = await register_pwa_service_worker()

    if (!registration) {
      throw new Error('service_worker_registration_missing')
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: url_base64_to_uint8_array(public_key),
    })

    const response = await fetch('/api/pwa/subscription', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        room_uuid: input.room_uuid,
        participant_uuid: input.participant_uuid,
        subscription: subscription.toJSON(),
        user_agent: navigator.userAgent,
      }),
    })

    if (!response.ok) {
      throw new Error(`subscription_save_http_${response.status}`)
    }

    post_pwa_debug({
      event: 'push_subscription_save_succeeded',
      ...input,
      source_channel: 'pwa',
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
      has_push_subscription: false,
      app_visibility_state: document.visibilityState,
      error_message: error instanceof Error ? error.message : String(error),
      phase: 'push_subscription_save_failed',
    })

    return false
  }
}
