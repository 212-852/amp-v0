import { NextResponse } from 'next/server'

import { save_push_subscription } from '@/lib/pwa/action'

type push_subscription_request = {
  room_uuid?: unknown
  participant_uuid?: unknown
  subscription?: unknown
  user_agent?: unknown
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | push_subscription_request
    | null

  const result = await save_push_subscription({
    room_uuid: body?.room_uuid,
    participant_uuid: body?.participant_uuid,
    subscription:
      body?.subscription && typeof body.subscription === 'object'
        ? body.subscription
        : null,
    user_agent: body?.user_agent,
  })

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 })
  }

  return NextResponse.json(result)
}
