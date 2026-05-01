import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { resolve_guest_access } from '@/lib/auth/access'
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

export async function GET() {
  const header_store = await headers()

  const user_agent = header_store.get('user-agent')
  const accept_language = header_store.get('accept-language')
  const locale = get_browser_locale(accept_language)

  const visitor = await resolve_visitor_context()
  const guest_access = await resolve_guest_access({
    visitor_uuid: visitor.visitor_uuid,
    locale,
  })

  if (control.debug.session_route) {
    await debug({
      category: 'visitor',
      event: guest_access.is_new_visitor
        ? 'visitor_created'
        : 'visitor_restored',
      data: {
        visitor_uuid: guest_access.visitor_uuid,
        is_new_visitor: guest_access.is_new_visitor,
        locale,
        accept_language,
        user_agent,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    visitor_uuid: guest_access.visitor_uuid,
    is_new_visitor: guest_access.is_new_visitor,
    locale,
  })
}
