import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { normalize_locale } from '@/lib/locale/action'
import { locale_cookie_name } from '@/lib/locale/cookie'
import { supabase } from '@/lib/db/supabase'
import { resolve_visitor_context } from '@/lib/visitor/context'

type locale_body = {
  locale?: string
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as locale_body
  const locale = normalize_locale(body.locale)
  const cookie_store = await cookies()
  const browser_session = await resolve_visitor_context('web', 'api_session', {
    locale,
  })
  const visitor_uuid = browser_session.visitor_uuid

  cookie_store.set(locale_cookie_name, locale, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  if (!visitor_uuid) {
    return NextResponse.json({ locale })
  }

  const visitor_result = await supabase
    .from('visitors')
    .select('user_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()

  if (visitor_result.error) {
    return NextResponse.json(
      { locale, error: 'Locale update failed' },
      { status: 500 },
    )
  }

  const user_uuid = visitor_result.data?.user_uuid

  if (!user_uuid) {
    return NextResponse.json({ locale })
  }

  const update_result = await supabase
    .from('users')
    .update({
      locale,
    })
    .eq('user_uuid', user_uuid)

  if (update_result.error) {
    return NextResponse.json(
      { locale, error: 'Locale update failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ locale })
}
