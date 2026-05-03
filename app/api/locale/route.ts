import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { normalize_locale } from '@/lib/locale/action'
import { supabase } from '@/lib/db/supabase'
import { visitor_cookie_name } from '@/lib/visitor/context'

type locale_body = {
  locale?: string
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as locale_body
  const locale = normalize_locale(body.locale)
  const cookie_store = await cookies()
  const visitor_uuid = cookie_store.get(visitor_cookie_name)?.value

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
