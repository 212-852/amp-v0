import 'server-only'

import { supabase } from '@/lib/db/supabase'

type room_row = {
  room_uuid: string
  room_type: string | null
  status: string | null
  mode: string | null
  action_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type reception_room = {
  room_uuid: string
  title: string
  preview: string
  updated_at: string | null
  mode: string | null
}

export type reception_room_mode = 'concierge' | 'bot'

const room_select =
  'room_uuid, room_type, status, mode, action_id, created_at, updated_at'

function normalize_room(row: room_row): reception_room {
  const mode = row.mode === 'bot' ? 'bot' : 'concierge'

  return {
    room_uuid: row.room_uuid,
    title: mode === 'concierge' ? 'Concierge room' : 'Bot room',
    preview: mode === 'concierge' ? '対応が必要です' : 'ボット対応中',
    updated_at: row.updated_at,
    mode,
  }
}

export async function list_reception_rooms({
  mode,
  limit,
}: {
  mode: reception_room_mode
  limit?: number
}): Promise<reception_room[]> {
  const normalized_limit =
    typeof limit === 'number' && Number.isFinite(limit)
      ? Math.max(1, Math.min(Math.floor(limit), 100))
      : 50

  const result = await supabase
    .from('rooms')
    .select(room_select)
    .eq('mode', mode)
    .order('updated_at', { ascending: false })
    .limit(normalized_limit)

  if (result.error) {
    throw result.error
  }

  return ((result.data ?? []) as room_row[]).map(normalize_room)
}

export async function get_reception_room(
  room_uuid: string,
): Promise<reception_room | null> {
  const result = await supabase
    .from('rooms')
    .select(room_select)
    .eq('room_uuid', room_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data ? normalize_room(result.data as room_row) : null
}
