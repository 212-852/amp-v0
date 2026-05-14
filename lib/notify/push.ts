import 'server-only'

import { debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'

import { evaluate_push_chat_delivery_allowed } from './push_gate'

export type push_notify_input = {
  user_uuid: string
  message: string
  title?: string
  room_uuid?: string | null
  message_uuid?: string | null
  kind?: 'chat' | 'reservation' | 'announcement'
}

export type push_notify_result = {
  ok: boolean
  available: boolean
  reason?: string
}

type push_subscription_delivery_row = {
  endpoint: string
}

function base64url_to_bytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const raw = atob(`${normalized}${padding}`)
  const output = new Uint8Array(raw.length)

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }

  return output
}

function base64url(input: Uint8Array | string) {
  const raw =
    typeof input === 'string'
      ? input
      : Array.from(input)
          .map((byte) => String.fromCharCode(byte))
          .join('')

  return btoa(raw)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function create_vapid_private_key(input: {
  public_key: string
  private_key: string
}) {
  if (input.private_key.includes('BEGIN')) {
    throw new Error('vapid_pem_not_supported_in_edge_runtime')
  }

  const public_key = base64url_to_bytes(input.public_key)
  const private_key = base64url_to_bytes(input.private_key)

  if (public_key.length !== 65 || public_key[0] !== 4) {
    throw new Error('invalid_vapid_public_key')
  }

  if (private_key.length !== 32) {
    throw new Error('invalid_vapid_private_key')
  }

  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: base64url(public_key.subarray(1, 33)),
      y: base64url(public_key.subarray(33, 65)),
      d: base64url(private_key),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

async function create_vapid_jwt(input: {
  endpoint: string
  public_key: string
  private_key: string
  subject: string
}) {
  const audience = new URL(input.endpoint).origin
  const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const payload = base64url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
      sub: input.subject,
    }),
  )
  const signing_input = `${header}.${payload}`
  const key = await create_vapid_private_key(input)
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signing_input),
  )

  return `${signing_input}.${base64url(new Uint8Array(signature))}`
}

async function send_empty_web_push(input: {
  endpoint: string
  public_key: string
  private_key: string
  subject: string
}) {
  const jwt = await create_vapid_jwt(input)

  return fetch(input.endpoint, {
    method: 'POST',
    headers: {
      TTL: '60',
      Authorization: `WebPush ${jwt}`,
      'Crypto-Key': `p256ecdsa=${input.public_key}`,
      'Content-Length': '0',
    },
  })
}

export async function send_push_notify(
  input: push_notify_input,
): Promise<push_notify_result> {
  const gate = await evaluate_push_chat_delivery_allowed({
    user_uuid: input.user_uuid,
    kind: input.kind ?? 'chat',
  })

  if (!gate.allowed) {
    return {
      ok: false,
      available: false,
      reason: 'push_notification_disabled',
    }
  }

  await debug_event({
    category: 'pwa',
    event: 'notify_push_send_started',
    payload: {
      user_uuid: input.user_uuid,
      pwa_push_enabled: gate.pwa_push_enabled,
      chat_enabled: gate.chat_enabled,
      push_subscription_enabled: gate.push_subscription_enabled,
      disabled_reason: null,
    },
  })

  const result = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_uuid', input.user_uuid)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (result.error) {
    return {
      ok: false,
      available: false,
      reason: result.error.message,
    }
  }

  const rows = (result.data ?? []) as push_subscription_delivery_row[]

  if (rows.length === 0) {
    return {
      ok: false,
      available: false,
      reason: 'push_subscription_missing',
    }
  }

  if (
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_SUBJECT
  ) {
    return {
      ok: false,
      available: false,
      reason: 'vapid_keys_not_configured',
    }
  }

  const public_key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const private_key = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!public_key || !private_key || !subject) {
    return {
      ok: false,
      available: true,
      reason: 'vapid_keys_not_configured',
    }
  }

  const settled = await Promise.allSettled(
    rows.map((row) =>
      send_empty_web_push({
        endpoint: row.endpoint,
        public_key,
        private_key,
        subject,
      }),
    ),
  )

  const sent = settled.filter(
    (entry) =>
      entry.status === 'fulfilled' &&
      entry.value.status >= 200 &&
      entry.value.status < 300,
  )

  if (sent.length > 0) {
    return {
      ok: true,
      available: true,
    }
  }

  const first_failed = settled.find(
    (entry) =>
      entry.status === 'rejected' ||
      entry.value.status < 200 ||
      entry.value.status >= 300,
  )

  return {
    ok: false,
    available: true,
    reason:
      first_failed?.status === 'rejected'
        ? first_failed.reason instanceof Error
          ? first_failed.reason.message
          : 'webpush_delivery_failed'
        : first_failed
          ? `webpush_http_${first_failed.value.status}`
          : 'webpush_delivery_failed',
  }
}
