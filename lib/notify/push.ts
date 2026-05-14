import 'server-only'

import { debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

import { evaluate_push_chat_delivery_allowed } from './push_gate'
import {
  resolve_push_notification_title,
  type push_sender_title_source,
} from './rules'

export type push_notify_input = {
  user_uuid: string
  message: string
  title?: string
  room_uuid?: string | null
  participant_uuid?: string | null
  message_uuid?: string | null
  kind?: 'chat' | 'reservation' | 'announcement'
  sender_user_uuid?: string | null
  sender_role?: string | null
}

export type push_notify_result = {
  ok: boolean
  available: boolean
  reason?: string
}

type push_subscription_delivery_row = {
  endpoint: string
  p256dh: string
  auth: string
}

type push_payload = {
  title: string
  body: string
  icon: string
  badge: string
  tag: string
  renotify: boolean
  silent: boolean
  unread_count: number | null
  data: {
    room_uuid: string | null
    participant_uuid: string | null
    message_uuid: string | null
    url: string
  }
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

function concat_bytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(length)
  let offset = 0

  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }

  return output
}

function to_array_buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

async function hmac_sha256(key_bytes: Uint8Array, data: Uint8Array) {
  const key = await crypto.subtle.importKey(
    'raw',
    to_array_buffer(key_bytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, to_array_buffer(data))

  return new Uint8Array(signature)
}

async function hkdf_expand(
  prk: Uint8Array,
  info: Uint8Array,
  length: number,
) {
  const output = new Uint8Array(length)
  let previous = new Uint8Array()
  let offset = 0
  let counter = 1

  while (offset < length) {
    const block = await hmac_sha256(
      prk,
      concat_bytes([previous, info, new Uint8Array([counter])]),
    )
    output.set(block.subarray(0, Math.min(block.length, length - offset)), offset)
    offset += block.length
    previous = block
    counter += 1
  }

  return output
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
    to_array_buffer(new TextEncoder().encode(signing_input)),
  )

  return `${signing_input}.${base64url(new Uint8Array(signature))}`
}

function sanitize_push_body(value: string) {
  const cleaned = value
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned.slice(0, 80) || '\u65B0\u3057\u3044\u30E1\u30C3\u30BB\u30FC\u30B8'
}

type push_title_resolution_debug = {
  sender_user_uuid: string | null
  sender_role: string | null
  internal_name_exists: boolean
  resolved_sender_name_source:
    | push_sender_title_source
    | 'input_title'
    | 'default_new_message'
  title_exists: boolean
}

async function resolve_push_notify_title(input: push_notify_input): Promise<{
  title: string
  debug: push_title_resolution_debug
}> {
  const kind = input.kind ?? 'chat'
  const sender_uuid = clean_uuid(input.sender_user_uuid ?? null)
  const input_title =
    typeof input.title === 'string' && input.title.trim()
      ? input.title.trim()
      : null

  if (kind !== 'chat') {
    const title =
      input_title ?? '\u65B0\u3057\u3044\u30E1\u30C3\u30BB\u30FC\u30B8'

    return {
      title,
      debug: {
        sender_user_uuid: null,
        sender_role: null,
        internal_name_exists: false,
        resolved_sender_name_source: input_title
          ? 'input_title'
          : 'default_new_message',
        title_exists: title.length > 0,
      },
    }
  }

  if (!sender_uuid) {
    const title =
      input_title ?? '\u65B0\u3057\u3044\u30E1\u30C3\u30BB\u30FC\u30B8'

    return {
      title,
      debug: {
        sender_user_uuid: null,
        sender_role: null,
        internal_name_exists: false,
        resolved_sender_name_source: input_title
          ? 'input_title'
          : 'default_new_message',
        title_exists: title.length > 0,
      },
    }
  }

  const [profile_row, user_row] = await Promise.all([
    supabase
      .from('profiles')
      .select('internal_name, display_name')
      .eq('user_uuid', sender_uuid)
      .maybeSingle(),
    supabase
      .from('users')
      .select('display_name, role')
      .eq('user_uuid', sender_uuid)
      .maybeSingle(),
  ])

  const profile = profile_row.data as
    | { internal_name?: unknown; display_name?: unknown }
    | null
  const internal_raw = profile?.internal_name
  const internal =
    typeof internal_raw === 'string' && internal_raw.trim()
      ? internal_raw.trim()
      : null
  const internal_name_exists = Boolean(internal)

  const row = user_row.data as
    | { display_name?: unknown; role?: unknown }
    | null
  const profile_display_name =
    typeof profile?.display_name === 'string' ? profile.display_name : null
  const users_display_name =
    typeof row?.display_name === 'string' ? row.display_name : null
  const display_name = profile_display_name ?? users_display_name
  const role_from_db =
    typeof row?.role === 'string' && row.role.trim()
      ? row.role.trim()
      : typeof input.sender_role === 'string' && input.sender_role.trim()
        ? input.sender_role.trim()
        : null

  const resolved = resolve_push_notification_title({
    sender_role: role_from_db,
    profile_internal_name: internal,
    users_display_name: display_name,
  })

  return {
    title: resolved.title,
    debug: {
      sender_user_uuid: sender_uuid,
      sender_role: role_from_db,
      internal_name_exists,
      resolved_sender_name_source: resolved.source,
      title_exists: resolved.title.length > 0,
    },
  }
}

function build_push_payload(
  input: push_notify_input,
  resolved_title: string,
): push_payload {
  const room_uuid =
    typeof input.room_uuid === 'string' && input.room_uuid.trim()
      ? input.room_uuid.trim()
      : null
  const title =
    typeof resolved_title === 'string' && resolved_title.trim()
      ? resolved_title.trim()
      : '\u65B0\u3057\u3044\u30E1\u30C3\u30BB\u30FC\u30B8'
  const url = room_uuid
    ? `/user?room_uuid=${encodeURIComponent(room_uuid)}`
    : '/user'

  return {
    title,
    body: sanitize_push_body(input.message),
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    tag: room_uuid ?? 'new_chat',
    renotify: true,
    silent: false,
    unread_count: null,
    data: {
      room_uuid,
      participant_uuid: input.participant_uuid ?? null,
      message_uuid: input.message_uuid ?? null,
      url,
    },
  }
}

async function encrypt_web_push_payload(input: {
  payload: push_payload
  p256dh: string
  auth: string
}) {
  const encoder = new TextEncoder()
  const client_public_bytes = base64url_to_bytes(input.p256dh)
  const auth_secret = base64url_to_bytes(input.auth)
  const server_keys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const server_public_bytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', server_keys.publicKey),
  )
  const client_public_key = await crypto.subtle.importKey(
    'raw',
    to_array_buffer(client_public_bytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const shared_secret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: client_public_key },
      server_keys.privateKey,
      256,
    ),
  )
  const key_info = concat_bytes([
    encoder.encode('WebPush: info\u0000'),
    client_public_bytes,
    server_public_bytes,
  ])
  const key_prk = await hmac_sha256(auth_secret, shared_secret)
  const ikm = await hkdf_expand(key_prk, key_info, 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmac_sha256(salt, ikm)
  const cek = await hkdf_expand(
    prk,
    encoder.encode('Content-Encoding: aes128gcm\u0000'),
    16,
  )
  const nonce = await hkdf_expand(
    prk,
    encoder.encode('Content-Encoding: nonce\u0000'),
    12,
  )
  const aes_key = await crypto.subtle.importKey(
    'raw',
    to_array_buffer(cek),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  const plaintext = concat_bytes([
    encoder.encode(JSON.stringify(input.payload)),
    new Uint8Array([2]),
  ])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aes_key,
      to_array_buffer(plaintext),
    ),
  )
  const record_size = new Uint8Array([0, 0, 16, 0])
  const key_length = new Uint8Array([server_public_bytes.length])

  return concat_bytes([
    salt,
    record_size,
    key_length,
    server_public_bytes,
    ciphertext,
  ])
}

async function send_web_push(input: {
  endpoint: string
  p256dh: string
  auth: string
  payload: push_payload
  public_key: string
  private_key: string
  subject: string
}) {
  const jwt = await create_vapid_jwt(input)
  const body = await encrypt_web_push_payload({
    payload: input.payload,
    p256dh: input.p256dh,
    auth: input.auth,
  })

  return fetch(input.endpoint, {
    method: 'POST',
    headers: {
      TTL: '60',
      Authorization: `WebPush ${jwt}`,
      'Crypto-Key': `p256ecdsa=${input.public_key}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.byteLength),
    },
    body: to_array_buffer(body),
  })
}

export async function send_push_notify(
  input: push_notify_input,
): Promise<push_notify_result> {
  const gate = await evaluate_push_chat_delivery_allowed({
    user_uuid: input.user_uuid,
    participant_uuid: input.participant_uuid ?? null,
    source_channel: 'push',
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
      participant_uuid: input.participant_uuid ?? null,
      source_channel: 'push',
      pwa_push_enabled: gate.pwa_push_enabled,
      chat_enabled: gate.chat_enabled,
      push_subscription_enabled: gate.push_subscription_enabled,
      disabled_reason: null,
    },
  })

  const resolved_title_pack = await resolve_push_notify_title(input)

  await debug_event({
    category: 'pwa',
    event: 'notify_push_sender_name_resolved',
    payload: {
      user_uuid: input.user_uuid,
      sender_user_uuid: resolved_title_pack.debug.sender_user_uuid,
      sender_role: resolved_title_pack.debug.sender_role,
      internal_name_exists: resolved_title_pack.debug.internal_name_exists,
      resolved_sender_name_source:
        resolved_title_pack.debug.resolved_sender_name_source,
      title_exists: resolved_title_pack.debug.title_exists,
    },
  })

  const result = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_uuid', input.user_uuid)
    .eq('enabled', true)
    .eq('is_pwa', true)
    .not('endpoint', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)

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
  const payload = build_push_payload(input, resolved_title_pack.title)

  await debug_event({
    category: 'pwa',
    event: 'notify_push_payload_built',
    payload: {
      user_uuid: input.user_uuid,
      room_uuid: payload.data.room_uuid,
      participant_uuid: payload.data.participant_uuid,
      message_uuid: payload.data.message_uuid,
      tag: payload.tag,
      url: payload.data.url,
      body_length: payload.body.length,
      has_title: payload.title.length > 0,
      unread_count: payload.unread_count,
      phase: 'build_push_payload',
    },
  })

  if (!public_key || !private_key || !subject) {
    return {
      ok: false,
      available: true,
      reason: 'vapid_keys_not_configured',
    }
  }

  const settled = await Promise.allSettled(
    rows.map((row) =>
      send_web_push({
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        payload,
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
