import { NextResponse } from 'next/server'

import { save_push_subscription } from '@/lib/push/action'
import type { push_subscription_request_body } from '@/lib/push/context'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | push_subscription_request_body
    | null

  const result = await save_push_subscription(body)

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 })
  }

  return NextResponse.json(result)
}
