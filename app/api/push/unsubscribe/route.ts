import { NextResponse } from 'next/server'

import { deactivate_push_subscription } from '@/lib/push/action'

type unsubscribe_body = {
  endpoint?: unknown
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | unsubscribe_body
    | null

  const result = await deactivate_push_subscription({
    endpoint:
      typeof body?.endpoint === 'string' ? body.endpoint : undefined,
  })

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 })
  }

  return NextResponse.json(result)
}
