import { NextResponse } from 'next/server'

import { debug } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'

type email_login_body = {
  email?: string
}

function normalize_email(email?: string) {
  return email?.trim().toLowerCase() ?? ''
}

export async function POST(request: Request) {
  const body = (await request.json()) as email_login_body
  const email = normalize_email(body.email)
  const callback_url = process.env.EMAIL_LOGIN_CALLBACK_URL

  if (!email || !email.includes('@')) {
    await debug({
      category: 'auth',
      event: 'email_login_otp_failed',
      data: {
        reason: 'invalid_email',
      },
    })

    return NextResponse.json(
      { ok: false, error: 'Invalid email' },
      { status: 400 },
    )
  }

  if (!callback_url) {
    await debug({
      category: 'auth',
      event: 'email_login_otp_failed',
      data: {
        reason: 'missing_callback_url',
      },
    })

    return NextResponse.json(
      { ok: false, error: 'Email login is not configured' },
      { status: 500 },
    )
  }

  const result = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callback_url,
    },
  })

  if (result.error) {
    await debug({
      category: 'auth',
      event: 'email_login_otp_failed',
      data: {
        reason: 'otp_request_failed',
        status: result.error.status,
      },
    })

    return NextResponse.json(
      { ok: false, error: 'Email login failed' },
      { status: 500 },
    )
  }

  await debug({
    category: 'auth',
    event: 'email_login_otp_sent',
    data: {
      email_exists: true,
    },
  })

  return NextResponse.json({ ok: true })
}
