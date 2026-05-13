import 'server-only'

import { clean_uuid } from '@/lib/db/uuid/payload'

export type push_subscription_subscription_json = {
  endpoint?: unknown
  keys?: {
    p256dh?: unknown
    auth?: unknown
  }
}

export type push_subscription_request_body = {
  room_uuid?: unknown
  participant_uuid?: unknown
  subscription?: push_subscription_subscription_json | null | undefined
  user_agent?: unknown
  device_type?: unknown
  browser?: unknown
  os?: unknown
  is_pwa?: unknown
}

export type normalized_push_subscription_input = {
  room_uuid: string | null
  participant_uuid: string | null
  endpoint: string
  p256dh: string
  auth: string
  user_agent_raw: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  is_pwa: boolean
}

function string_value(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function infer_device_hints(user_agent: string | null): {
  device_type: string | null
  browser: string | null
  os: string | null
} {
  if (!user_agent) {
    return { device_type: null, browser: null, os: null }
  }

  const ua = user_agent.toLowerCase()
  let os: string | null = null

  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    os = 'ios'
  } else if (ua.includes('android')) {
    os = 'android'
  } else if (ua.includes('mac os')) {
    os = 'macos'
  } else if (ua.includes('windows')) {
    os = 'windows'
  }

  let browser: string | null = null

  if (ua.includes('edg/')) {
    browser = 'edge'
  } else if (ua.includes('chrome') && !ua.includes('chromium')) {
    browser = 'chrome'
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'safari'
  } else if (ua.includes('firefox')) {
    browser = 'firefox'
  }

  const device_type =
    ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')
      ? 'mobile'
      : ua.includes('ipad') || ua.includes('tablet')
        ? 'tablet'
        : 'desktop'

  return { device_type, browser, os }
}

/**
 * context: normalize raw HTTP JSON only (no auth / tier decisions).
 */
export function normalize_push_subscription_input(
  body: push_subscription_request_body | null | undefined,
): normalized_push_subscription_input | null {
  const room_uuid = clean_uuid(string_value(body?.room_uuid))
  const participant_uuid = clean_uuid(string_value(body?.participant_uuid))
  const endpoint = string_value(body?.subscription?.endpoint)
  const p256dh = string_value(body?.subscription?.keys?.p256dh)
  const auth = string_value(body?.subscription?.keys?.auth)

  if (!endpoint || !p256dh || !auth) {
    return null
  }

  const user_agent_raw = string_value(body?.user_agent)
  const hinted = infer_device_hints(user_agent_raw)

  const device_type = string_value(body?.device_type) ?? hinted.device_type
  const browser = string_value(body?.browser) ?? hinted.browser
  const os = string_value(body?.os) ?? hinted.os

  const is_pwa =
    body?.is_pwa === true ||
    body?.is_pwa === 'true' ||
    string_value(body?.is_pwa) === '1'

  return {
    room_uuid,
    participant_uuid,
    endpoint,
    p256dh,
    auth,
    user_agent_raw,
    device_type,
    browser,
    os,
    is_pwa,
  }
}
