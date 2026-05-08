import { NextResponse } from 'next/server'

import { handle_chat_mode_request } from '@/lib/chat/action'

export async function POST(request: Request) {
  const result = await handle_chat_mode_request(request)

  return NextResponse.json(result.body, { status: result.status })
}
