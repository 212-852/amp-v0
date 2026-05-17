import { NextResponse } from 'next/server'

import {
  load_notification_settings,
  save_notification_settings,
} from '@/lib/notification/settings'
import type { notification_preferences } from '@/lib/notification/rules'
import type { notification_method_trigger } from '@/lib/notification/settings_core'

type notification_settings_body = {
  preferences?: Partial<notification_preferences> | null
  trigger_method?: notification_method_trigger
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
    trigger_method: body?.trigger_method ?? null,
    request_body: body,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
