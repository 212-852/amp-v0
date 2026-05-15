import { NextResponse } from 'next/server'

import { enter_support_room } from '@/lib/support_presence/action'

export async function POST(request: Request) {
  const result = await enter_support_room(request)

  return NextResponse.json(result.body, { status: result.status })
}
