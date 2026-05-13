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
  message_uuid?: string | null
  notification_route?: string | null
  has_push_subscription?: boolean | null
  has_line_identity?: boolean | null
  has_beforeinstallprompt?: boolean | null
  is_standalone?: boolean | null
  manifest_available?: boolean | null
  service_worker_registered?: boolean | null
  user_agent?: string | null
  app_visibility_state?: string | null
  error_code?: string | null
  error_message?: string | null
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
