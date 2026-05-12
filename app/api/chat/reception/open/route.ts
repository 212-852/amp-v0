import { NextResponse } from 'next/server'

import { handle_admin_reception_room_opened } from '@/lib/chat/action'

export async function POST(request: Request) {
  const result = await handle_admin_reception_room_opened(request)

  return NextResponse.json(result.body, { status: result.status })
}
