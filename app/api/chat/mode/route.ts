import { NextResponse } from 'next/server'

import { handle_chat_mode_request } from '@/lib/chat/action'

export async function POST(request: Request) {
  const trace_body = (await request.clone().json().catch(() => null)) as {
    room_uuid?: string
    participant_uuid?: string
    mode?: string
  } | null

  console.log('[ACTION_TRACE] api_entered', {
    room_uuid: trace_body?.room_uuid ?? null,
    participant_uuid: trace_body?.participant_uuid ?? null,
    mode: trace_body?.mode ?? null,
  })
  console.log('[ACTION_TRACE] before_action', {
    room_uuid: trace_body?.room_uuid ?? null,
    participant_uuid: trace_body?.participant_uuid ?? null,
    mode: trace_body?.mode ?? null,
  })

  const result = await handle_chat_mode_request(request)

  return NextResponse.json(result.body, { status: result.status })
}
