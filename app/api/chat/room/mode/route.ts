import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  infer_source_channel_from_ua,
  read_session,
  type browser_session_source_channel,
} from '@/lib/auth/session'
import {
  room_mode_accept_concierge,
  room_mode_request_concierge,
  room_mode_resume_bot,
  room_mode_resume_bot_for_room,
} from '@/lib/chat/room/mode/action'
import type { chat_locale } from '@/lib/chat/message'
import { resolve_chat_room } from '@/lib/chat/room'
import type { chat_channel } from '@/lib/chat/room'
import { supabase } from '@/lib/db/supabase'
import { normalize_locale } from '@/lib/locale/action'
import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

function resolve_session_source_channel(
  browser_channel_cookie: string | null,
  user_agent: string | null,
): browser_session_source_channel {
  const raw = browser_channel_cookie?.trim().toLowerCase()

  if (raw === 'liff' || raw === 'pwa') {
    return raw
  }

  return infer_source_channel_from_ua(user_agent)
}

function session_source_to_chat_channel(
  src: browser_session_source_channel,
): chat_channel {
  if (src === 'web') {
    return 'web'
  }

  return src
}

async function resolve_visitor_user_uuid(visitor_uuid: string) {
  const result = await supabase
    .from('visitors')
    .select('user_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data?.user_uuid ?? null
}

export async function POST(request: Request) {
  const session = await read_session()

  if (!session.visitor_uuid) {
    return NextResponse.json(
      { ok: false, error: 'session_required' },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => null)) as {
    action?: string
    room_uuid?: string
  } | null

  const action = body?.action

  if (
    action !== 'request_concierge' &&
    action !== 'accept_concierge' &&
    action !== 'resume_bot'
  ) {
    return NextResponse.json(
      { ok: false, error: 'invalid_action' },
      { status: 400 },
    )
  }

  const header_store = await headers()
  const cookie_store = await cookies()
  const session_src = resolve_session_source_channel(
    cookie_store.get(browser_channel_cookie_name)?.value ?? null,
    header_store.get('user-agent'),
  )
  const channel = session_source_to_chat_channel(session_src)
  const locale = normalize_locale(
    header_store.get('accept-language')?.split(',')[0],
  ) as chat_locale

  const visitor_uuid = session.visitor_uuid
  const user_uuid = await resolve_visitor_user_uuid(visitor_uuid)

  if (action === 'accept_concierge') {
    const target_room_uuid = body?.room_uuid?.trim()

    if (!target_room_uuid) {
      return NextResponse.json(
        { ok: false, error: 'room_uuid_required' },
        { status: 400 },
      )
    }

    if (!user_uuid) {
      return NextResponse.json(
        { ok: false, error: 'forbidden' },
        { status: 403 },
      )
    }

    const user_row_result = await supabase
      .from('users')
      .select('role, display_name')
      .eq('user_uuid', user_uuid)
      .maybeSingle()

    if (user_row_result.error) {
      throw user_row_result.error
    }

    if (user_row_result.data?.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'forbidden' },
        { status: 403 },
      )
    }

    const result = await room_mode_accept_concierge({
      room_uuid: target_room_uuid,
      admin_user_uuid: user_uuid,
      admin_display_name: user_row_result.data.display_name ?? null,
      channel,
      locale,
    })

    if (!result.ok) {
      return NextResponse.json(result, {
        status: result.error === 'link_required' ? 403 : 400,
      })
    }

    return NextResponse.json(result)
  }

  const room_result = await resolve_chat_room({
    visitor_uuid,
    user_uuid,
    channel,
  })

  if (!room_result.ok || !room_result.room.room_uuid) {
    return NextResponse.json(
      { ok: false, error: 'room_not_found' },
      { status: 404 },
    )
  }

  const room = room_result.room
  const body_room_uuid = body?.room_uuid?.trim()

  if (body_room_uuid && body_room_uuid !== room.room_uuid) {
    if (!user_uuid) {
      return NextResponse.json(
        { ok: false, error: 'room_mismatch' },
        { status: 403 },
      )
    }

    const role_check = await supabase
      .from('users')
      .select('role')
      .eq('user_uuid', user_uuid)
      .maybeSingle()

    if (role_check.error) {
      throw role_check.error
    }

    if (role_check.data?.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'room_mismatch' },
        { status: 403 },
      )
    }
  }

  if (action === 'request_concierge') {
    if (user_uuid) {
      const role_result = await supabase
        .from('users')
        .select('role')
        .eq('user_uuid', user_uuid)
        .maybeSingle()

      if (role_result.error) {
        throw role_result.error
      }

      if (role_result.data?.role === 'admin') {
        return NextResponse.json(
          { ok: false, error: 'forbidden' },
          { status: 403 },
        )
      }
    }

    const result = await room_mode_request_concierge({
      chat_room: room,
      channel,
      locale,
    })

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  }

  if (action === 'resume_bot') {
    const target_room_uuid = body?.room_uuid?.trim()
    let is_admin = false

    if (user_uuid) {
      const role_result = await supabase
        .from('users')
        .select('role')
        .eq('user_uuid', user_uuid)
        .maybeSingle()

      if (role_result.error) {
        throw role_result.error
      }

      is_admin = role_result.data?.role === 'admin'
    }

    const result =
      is_admin && target_room_uuid
        ? await room_mode_resume_bot_for_room({
            room_uuid: target_room_uuid,
            channel,
            locale,
          })
        : await room_mode_resume_bot({
            chat_room: room,
            channel,
            locale,
          })

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  }

  return NextResponse.json(
    { ok: false, error: 'invalid_action' },
    { status: 400 },
  )
}
