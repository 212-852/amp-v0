import { NextResponse } from 'next/server'

function get_app_url(request: Request) {
  const callback_url = process.env.LINE_LOGIN_CALLBACK_URL

  if (callback_url) {
    try {
      return new URL(callback_url).origin
    } catch {
      // Fall through to request origin.
    }
  }

  return new URL(request.url).origin
}

export async function GET(request: Request) {
  return NextResponse.redirect(`${get_app_url(request)}/`)
}
