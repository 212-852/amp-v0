import { NextResponse } from 'next/server'

import { handle_room_mode_switch_request } from '@/lib/chat/room_mode_action'

export async function POST(request: Request) {
  const result = await handle_room_mode_switch_request(request)

  return NextResponse.json(result.body, { status: result.status })
}
