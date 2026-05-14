import { NextResponse } from 'next/server'

import { load_archived_messages } from '@/lib/chat/archive'
import { debug_event } from '@/lib/debug'
import { clean_uuid } from '@/lib/db/uuid/payload'

function error_fields(error: unknown) {
  if (error instanceof Error) {
    return {
      error_code: null,
      error_message: error.message,
      error_details: null,
    }
  }

  if (error && typeof error === 'object') {
    const record = error as {
      code?: unknown
      message?: unknown
      details?: unknown
    }

    return {
      error_code: typeof record.code === 'string' ? record.code : null,
      error_message:
        typeof record.message === 'string'
          ? record.message
          : JSON.stringify(error),
      error_details:
        typeof record.details === 'string' ? record.details : null,
    }
  }

  return {
    error_code: null,
    error_message: String(error),
    error_details: null,
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    room_uuid?: unknown
    participant_uuid?: unknown
    source_channel?: unknown
  } | null
  const room_uuid = clean_uuid(body?.room_uuid)
  const participant_uuid = clean_uuid(body?.participant_uuid)
  const source_channel =
    typeof body?.source_channel === 'string' ? body.source_channel : null

  await debug_event({
    category: 'chat_room',
    event: 'chat_messages_fetch_started',
    payload: {
      room_uuid,
      participant_uuid,
      source_channel,
      reason: 'chat_room_messages_api',
    },
  })

  if (!room_uuid || !participant_uuid) {
    const error_message = 'room_uuid and participant_uuid are required'

    await debug_event({
      category: 'chat_room',
      event: 'chat_messages_fetch_failed',
      payload: {
        room_uuid,
        participant_uuid,
        source_channel,
        error_code: 'missing_room_or_participant',
        error_message,
        error_details: null,
      },
    })

    return NextResponse.json(
      {
        ok: false,
        error_code: 'missing_room_or_participant',
        error_message,
        error_details: null,
      },
      { status: 400 },
    )
  }

  try {
    const messages = await load_archived_messages(room_uuid)

    await debug_event({
      category: 'chat_room',
      event: 'chat_messages_fetch_succeeded',
      payload: {
        room_uuid,
        participant_uuid,
        source_channel,
        message_count: messages.length,
        reason: 'chat_room_messages_api',
      },
    })

    return NextResponse.json({ ok: true, messages })
  } catch (error) {
    const fields = error_fields(error)

    await debug_event({
      category: 'chat_room',
      event: 'chat_messages_fetch_failed',
      payload: {
        room_uuid,
        participant_uuid,
        source_channel,
        ...fields,
      },
    })

    return NextResponse.json(
      {
        ok: false,
        ...fields,
      },
      { status: 500 },
    )
  }
}

