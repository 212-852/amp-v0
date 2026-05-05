import { NextResponse } from 'next/server'

export const line_login_state_cookie_name = 'line_login_state'

export async function GET() {
  const liff_id = process.env.NEXT_PUBLIC_LINE_LIFF_ID

  if (!liff_id) {
    return NextResponse.json(
      { error: 'LIFF is not configured' },
      { status: 500 },
    )
  }

  return NextResponse.redirect(`https://liff.line.me/${liff_id}`)
}
