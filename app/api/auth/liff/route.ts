import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import {
  ensure_session,
  get_browser_session_cookie_options,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import { supabase } from '@/lib/db/supabase'
import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

type liff_auth_body = {
  line_user_id?: string
  display_name?: string | null
  picture_url?: string | null
  status_message?: string | null
  source_channel?: string | null
}

function get_client_ip(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()

    if (first) {
      return first
    }
  }

  return headers.get('x-real-ip')
}

function get_access_platform(user_agent: string | null) {
  const normalized_user_agent = user_agent?.toLowerCase() ?? ''

  if (
    normalized_user_agent.includes('iphone') ||
    normalized_user_agent.includes('ipad') ||
    normalized_user_agent.includes('ipod')
  ) {
    return 'ios' as const
  }

  if (normalized_user_agent.includes('android')) {
    return 'android' as const
  }

  if (normalized_user_agent.includes('mac os')) {
    return 'mac' as const
  }

  if (normalized_user_agent.includes('windows')) {
    return 'windows' as const
  }

  return 'unknown' as const
}

async function ensure_liff_visitor(input: {
  request: Request
  visitor_uuid: string | null
}) {
  const headers = input.request.headers

  return ensure_session({
    visitor_uuid: input.visitor_uuid,
    caller: 'api_session',
    source_channel: 'liff',
    user_agent: headers.get('user-agent'),
    access_platform: get_access_platform(headers.get('user-agent')),
    ip: get_client_ip(headers),
  })
}

async function update_liff_visitor(input: {
  visitor_uuid: string
  user_uuid: string
}) {
  const now = new Date().toISOString()
  const updated = await supabase
    .from('visitors')
    .update({
      user_uuid: input.user_uuid,
      access_channel: 'liff',
      last_seen_at: now,
      updated_at: now,
    })
    .eq('visitor_uuid', input.visitor_uuid)

  if (updated.error) {
    throw updated.error
  }
}

async function update_liff_user_profile(input: {
  user_uuid: string
  display_name: string | null
  picture_url: string | null
}) {
  if (!input.display_name && !input.picture_url) {
    return
  }

  const updated = await supabase
    .from('users')
    .update({
      display_name: input.display_name,
      image_url: input.picture_url,
    })
    .eq('user_uuid', input.user_uuid)

  if (updated.error) {
    throw updated.error
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as liff_auth_body
  const line_user_id = body.line_user_id?.trim()

  if (!line_user_id) {
    return NextResponse.json(
      { ok: false, error: 'Missing line_user_id' },
      { status: 400 },
    )
  }

  try {
    const cookie_store = await cookies()
    const cookie_visitor_uuid =
      cookie_store.get(visitor_cookie_name)?.value ?? null
    const visitor = await ensure_liff_visitor({
      request,
      visitor_uuid: cookie_visitor_uuid,
    })
    const display_name = body.display_name ?? null
    const picture_url = body.picture_url ?? null
    const access = await resolve_auth_access({
      provider: 'line',
      provider_id: line_user_id,
      visitor_uuid: visitor.visitor_uuid,
      display_name,
      image_url: picture_url,
      locale: null,
    })

    await update_liff_user_profile({
      user_uuid: access.user_uuid,
      display_name,
      picture_url,
    })

    await update_liff_visitor({
      visitor_uuid: visitor.visitor_uuid,
      user_uuid: access.user_uuid,
    })

    const cookie_options =
      get_browser_session_cookie_options(visitor_cookie_max_age)
    const response = NextResponse.json({
      ok: true,
      user_uuid: access.user_uuid,
      visitor_uuid: visitor.visitor_uuid,
      provider: 'line',
    })

    response.cookies.set(
      visitor_cookie_name,
      visitor.visitor_uuid,
      cookie_options,
    )
    response.cookies.set(browser_channel_cookie_name, 'liff', cookie_options)

    return response
  } catch (error) {
    console.error('[liff_auth_error]', error)

    return NextResponse.json(
      { ok: false, error: 'LIFF auth failed' },
      { status: 500 },
    )
  }
}
