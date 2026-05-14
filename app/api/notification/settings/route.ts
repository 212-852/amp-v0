import { NextResponse } from 'next/server'

import {
  load_notification_settings,
  save_notification_settings,
} from '@/lib/notification/settings'
import type { notification_preferences } from '@/lib/notification/rules'

type notification_settings_body = {
  preferences?: Partial<notification_preferences> | null
}

export async function GET() {
  const result = await load_notification_settings()

  return NextResponse.json(result, { status: result.ok ? 200 : 401 })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | notification_settings_body
    | null
  const result = await save_notification_settings({
    preferences: body?.preferences ?? null,
    request_body: body,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
