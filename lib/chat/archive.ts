import 'server-only'

import { supabase } from '@/lib/db/supabase'
import type { chat_channel } from './room'
import type { bundle_sender, message_bundle } from './message'

export type archived_message = {
  archive_uuid: string
  room_uuid: string
  sequence: number
  bundle: message_bundle
  created_at: string
}

type archive_row = {
  message_uuid: string
  room_uuid: string
  body: string | null
  created_at: string
}

function parse_bundle(row: archive_row): message_bundle {
  if (!row.body) {
    return {
      bundle_uuid: row.message_uuid,
      bundle_type: 'text',
      sender: 'bot',
      version: 1,
      payload: {
        text: {
          ja: '',
          en: '',
          es: '',
        },
      },
    }
  }

  try {
    const parsed = JSON.parse(row.body) as {
      bundle?: message_bundle
      bundle_type?: string
    }

    if (parsed.bundle) {
      return parsed.bundle
    }

    if (parsed.bundle_type) {
      return parsed as message_bundle
    }
  } catch {
    // Plain text rows are normalized into text bundles below.
  }

  return {
    bundle_uuid: row.message_uuid,
    bundle_type: 'text',
    sender: 'bot',
    version: 1,
    payload: {
      text: {
        ja: row.body,
        en: row.body,
        es: row.body,
      },
    },
  }
}

function normalize_archive(
  row: archive_row,
  index: number,
): archived_message {
  return {
    archive_uuid: row.message_uuid,
    room_uuid: row.room_uuid,
    sequence: index + 1,
    bundle: parse_bundle(row),
    created_at: row.created_at,
  }
}

export async function load_archived_messages(room_uuid: string) {
  const result = await supabase
    .from('messages')
    .select('message_uuid, room_uuid, body, created_at')
    .eq('room_uuid', room_uuid)
    .order('created_at', { ascending: true })

  if (result.error) {
    throw result.error
  }

  return ((result.data ?? []) as archive_row[])
    .map(normalize_archive)
}

function resolve_participant_uuid(
  input: {
    participant_uuid: string
    bot_participant_uuid: string
  },
  sender: bundle_sender,
) {
  if (sender === 'bot') {
    return input.bot_participant_uuid
  }

  return input.participant_uuid
}

export async function archive_message_bundles(
  input: {
    room_uuid: string
    participant_uuid: string
    bot_participant_uuid: string
    channel: chat_channel
    bundles: message_bundle[]
  },
) {
  if (input.bundles.length === 0) {
    return []
  }

  const existing_messages =
    await load_archived_messages(input.room_uuid)
  const next_sequence = existing_messages.length + 1
  const rows = input.bundles.map((bundle, index) => ({
    room_uuid: input.room_uuid,
    participant_uuid: resolve_participant_uuid(input, bundle.sender),
    channel: input.channel,
    body: JSON.stringify({
      sequence: next_sequence + index,
      bundle,
    }),
  }))

  const result = await supabase
    .from('messages')
    .insert(rows)
    .select('message_uuid, room_uuid, body, created_at')

  if (result.error) {
    throw result.error
  }

  return ((result.data ?? []) as archive_row[])
    .map((row, index) =>
      normalize_archive(row, existing_messages.length + index),
    )
}
