import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  normalize_browser_session_source_for_request,
} from '@/lib/auth/context'
import { resolve_browser_identity_from_visitor } from '@/lib/auth/identity'
import { restore_visitor_user_link } from '@/lib/auth/session'
import type { chat_channel } from '@/lib/chat/room'
import { resolve_user_room } from '@/lib/chat/room'
import {
  browser_channel_cookie_name,
  client_source_channel_header_name,
} from '@/lib/visitor/cookie'
import { get_request_visitor_uuid } from '@/lib/visitor/request'

function session_source_to_chat_channel(
  src: string,
): chat_channel {
  if (src === 'web') {
    return 'web'
  }

  return src as chat_channel
}

/**
 * Explicit room resolve entry for PWA boot (no polling). API delegates to
 * lib/chat/room.ts resolve_user_room only.
 */
export async function POST() {
  const header_store = await headers()
  const cookie_store = await cookies()
  const visitor_uuid = await get_request_visitor_uuid()

  if (!visitor_uuid) {
    return NextResponse.json(
      { ok: false, error: 'visitor_missing' },
      { status: 400 },
    )
  }

  await restore_visitor_user_link(visitor_uuid)

  const identity = await resolve_browser_identity_from_visitor(visitor_uuid)

  const browser_channel_cookie =
    cookie_store.get(browser_channel_cookie_name)?.value ?? null
  const client_source_channel =
    header_store.get(client_source_channel_header_name)
  const session_src = normalize_browser_session_source_for_request({
    browser_channel_cookie,
    client_source_channel,
    user_agent: header_store.get('user-agent'),
  })
  const channel = session_source_to_chat_channel(session_src)

  const outcome = await resolve_user_room({
    visitor_uuid,
    user_uuid: identity.user_uuid,
    channel,
    source_channel: session_src,
    role: identity.role,
    tier: identity.tier,
  })

  if (!outcome.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: outcome.reason,
        error_code: outcome.error_code ?? null,
        error_message: outcome.error_message ?? outcome.reason,
        error_details: outcome.error_details ?? null,
        error_hint: outcome.error_hint ?? null,
        room_uuid: null,
        participant_uuid: null,
      },
      { status: 422 },
    )
  }

  return NextResponse.json({
    ok: true,
    room_uuid: outcome.room_uuid,
    participant_uuid: outcome.participant_uuid,
    mode: outcome.mode,
    channel: outcome.channel,
  })
}
