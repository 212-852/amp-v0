import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import { debug } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'

type email_otp_type = 'email' | 'magiclink'

function get_app_url() {
  const callback_url = process.env.EMAIL_LOGIN_CALLBACK_URL

  if (!callback_url) {
    return null
  }

  try {
    return new URL(callback_url).origin
  } catch {
    return null
  }
}

function redirect_home() {
  return NextResponse.redirect(`${get_app_url() ?? ''}/`)
}

async function debug_email_login_failed(
  reason: string,
  data?: Record<string, unknown>,
) {
  await debug({
    category: 'auth',
    event: 'email_login_callback_failed',
    data: {
      reason,
      ...data,
    },
  })
}

async function get_email_from_callback(url: URL) {
  const code = url.searchParams.get('code')
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as email_otp_type | null

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code)

    if (result.error) {
      await debug_email_login_failed('code_exchange_failed', {
        status: result.error.status,
      })

      return null
    }

    return result.data.user?.email ?? null
  }

  if (token_hash) {
    const result = await supabase.auth.verifyOtp({
      token_hash,
      type: type === 'magiclink' ? 'magiclink' : 'email',
    })

    if (result.error) {
      await debug_email_login_failed('otp_verify_failed', {
        status: result.error.status,
      })

      return null
    }

    return result.data.user?.email ?? null
  }

  await debug_email_login_failed('missing_code_or_token_hash', {
    has_code: false,
    has_token_hash: false,
  })

  return null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const error = url.searchParams.get('error')

  if (error) {
    await debug_email_login_failed('email_error', {
      error,
    })

    return redirect_home()
  }

  try {
    const email = await get_email_from_callback(url)

    if (!email) {
      return redirect_home()
    }

    const access = await resolve_auth_access({
      provider: 'email',
      provider_id: email.trim().toLowerCase(),
    })

    await debug({
      category: 'auth',
      event: 'email_login_callback_passed',
      data: {
        user_uuid: access.user_uuid,
        visitor_uuid: access.visitor_uuid,
        is_new_user: access.is_new_user,
        is_new_visitor: access.is_new_visitor,
        email_exists: true,
      },
    })
  } catch (error) {
    await debug_email_login_failed('unexpected_error', {
      error_message:
        error instanceof Error ? error.message : String(error),
    })

    return redirect_home()
  }

  return redirect_home()
}
