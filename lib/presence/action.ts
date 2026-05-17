import 'server-only'

import { supabase } from '@/lib/db/supabase'

import type { presence_write_decision } from './rules'

export type presence_write_result =
  | {
      ok: true
    }
  | {
      ok: false
      error: string
    }

export async function write_presence(
  decision: presence_write_decision,
): Promise<presence_write_result> {
  if (!decision.ok) {
    return {
      ok: false,
      error: decision.skipped_reason,
    }
  }

  const now = new Date().toISOString()
  const result = await supabase
    .from('presence')
    .upsert(
      {
        participant_uuid: null,
        user_uuid: decision.user_uuid,
        role: decision.role,
        source_channel: decision.source_channel,
        active_room_uuid: decision.active_room_uuid,
        active_area: decision.active_area,
        visibility_state: decision.visibility_state,
        app_visibility_state: decision.visibility_state,
        is_active: decision.is_active,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: 'user_uuid' },
    )

  if (result.error) {
    return {
      ok: false,
      error: result.error.message,
    }
  }

  return { ok: true }
}
