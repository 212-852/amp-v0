import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  resolve_guest_access,
  resolve_session_access,
} from '@/lib/auth/access'
import { control } from '@/lib/config/control'
import { debug } from '@/lib/debug'
import { resolve_visitor_context } from '@/lib/visitor/context'

function get_browser_locale(accept_language: string | null) {
  if (!accept_language) {
    return 'ja'
  }

  const first_locale = accept_language
    .split(',')[0]
    ?.trim()
    .toLowerCase()

  if (!first_locale) {
    return 'ja'
  }

  if (first_locale.startsWith('ja')) {
    return 'ja'
  }

  if (first_locale.startsWith('es')) {
    return 'es'
  }

  return 'en'
}

function get_access_platform(user_agent: string | null) {
  const normalized_user_agent = user_agent?.toLowerCase() ?? ''

  if (
    normalized_user_agent.includes('iphone') ||
    normalized_user_agent.includes('ipad') ||
    normalized_user_agent.includes('ipod')
  ) {
    return 'ios'
  }

  if (normalized_user_agent.includes('android')) {
    return 'android'
  }

  if (normalized_user_agent.includes('mac os')) {
    return 'mac'
  }

  if (normalized_user_agent.includes('windows')) {
    return 'windows'
  }

  return 'unknown'
}

export async function GET() {
  const header_store = await headers()

  const user_agent = header_store.get('user-agent')
  const accept_language = header_store.get('accept-language')
  const locale = get_browser_locale(accept_language)
  const is_line_webview =
    user_agent?.toLowerCase().includes('line/') ?? false
  const requires_line_auth = is_line_webview
  const line_auth_method = is_line_webview ? 'line_login' : null

  const visitor = await resolve_visitor_context()
  const guest_access = await resolve_guest_access({
    visitor_uuid: visitor.visitor_uuid,
    locale,
  })
  const session_access = await resolve_session_access({
    visitor_uuid: guest_access.visitor_uuid,
    session_uuid: visitor.session_uuid,
    access_channel: 'web',
    access_platform: get_access_platform(user_agent),
    locale,
    user_agent,
  })

  if (control.debug.session_route) {
    await debug({
      category: 'visitor',
      event: guest_access.is_new_visitor
        ? 'visitor_created'
        : 'visitor_restored',
      data: {
        visitor_uuid: guest_access.visitor_uuid,
        session_uuid: session_access.session_uuid,
        is_new_visitor: guest_access.is_new_visitor,
        is_new_session: session_access.is_new_session,
        locale,
        accept_language,
        user_agent,
        is_line_webview,
        requires_line_auth,
        line_auth_method,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    visitor_uuid: guest_access.visitor_uuid,
    session_uuid: session_access.session_uuid,
    is_new_visitor: guest_access.is_new_visitor,
    is_new_session: session_access.is_new_session,
    locale,
    is_line_webview,
    requires_line_auth,
    line_auth_method,
  })
}
