import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'

import type { bundle_sender, message_bundle } from '@/lib/chat/message'
import type { chat_channel } from '@/lib/chat/room'
import { update_room_last_incoming_channel } from '@/lib/chat/room'

async function room_admin_unread_snapshot(room_uuid: string): Promise<{
  unread_admin_count: number | null
  admin_last_read_at: string | null
}> {
  const snap = await supabase
    .from('rooms')
    .select('unread_admin_count, admin_last_read_at')
    .eq('room_uuid', room_uuid)
    .maybeSingle()

  if (snap.error || !snap.data) {
    return { unread_admin_count: null, admin_last_read_at: null }
  }

  const d = snap.data as Record<string, unknown>

  return {
    unread_admin_count:
      typeof d.unread_admin_count === 'number' ? d.unread_admin_count : null,
    admin_last_read_at:
      typeof d.admin_last_read_at === 'string' ? d.admin_last_read_at : null,
  }
}

function admin_unread_preview_from_bundle(bundle: message_bundle): string {
  if (bundle.bundle_type === 'text' && 'payload' in bundle) {
    const t = bundle.payload.text

    return typeof t === 'string' ? t.trim().slice(0, 500) : ''
  }

  if (bundle.bundle_type === 'room_action_log' && 'payload' in bundle) {
    const t = bundle.payload.text

    return typeof t === 'string' ? t.trim().slice(0, 500) : ''
  }

  return bundle.bundle_type.slice(0, 120)
}

export function should_increment_admin_unread_for_bundle_sender(
  sender: bundle_sender,
): boolean {
  return sender === 'user' || sender === 'driver'
}

export async function apply_admin_unread_increment_after_archive(input: {
  room_uuid: string
  message_uuid: string
  message_created_at: string
  source_channel: chat_channel
  bundle: message_bundle
}): Promise<void> {
  const room_uuid = clean_uuid(input.room_uuid)

  if (!room_uuid) {
    return
  }

  if (!should_increment_admin_unread_for_bundle_sender(input.bundle.sender)) {
    return
  }

  const preview = admin_unread_preview_from_bundle(input.bundle)

  const rpc = await supabase.rpc('room_apply_admin_unread_increment', {
    p_room_uuid: room_uuid,
    p_message_at: input.message_created_at,
    p_preview: preview,
    p_source_channel: input.source_channel,
  })

  if (!rpc.error) {
    const snap = await room_admin_unread_snapshot(room_uuid)

    await debug_event({
      category: 'admin_chat',
      event: 'room_unread_incremented',
      payload: {
        room_uuid,
        message_uuid: input.message_uuid,
        unread_admin_count: snap.unread_admin_count,
        admin_last_read_at: snap.admin_last_read_at,
        actor_admin_user_uuid: null,
        source_channel: input.source_channel,
      },
    })

    return
  }

  const err = rpc.error as { code?: string; message?: string }

  if (
    typeof err.message === 'string' &&
    (err.message.includes('room_apply_admin_unread_increment') ||
      err.message.includes('function') ||
      err.code === '42883')
  ) {
    try {
      await update_room_last_incoming_channel({
        room_uuid,
        channel: input.source_channel,
        message_uuid: input.message_uuid,
        sender_role: input.bundle.sender,
      })
    } catch {
      /* best-effort legacy path */
    }

    return
  }

  console.error('[admin_unread] rpc_increment_failed', {
    room_uuid,
    message_uuid: input.message_uuid,
    error: rpc.error,
  })
}

export async function mark_reception_room_read_for_admin(input: {
  room_uuid: string
  actor_admin_user_uuid: string | null
}): Promise<void> {
  const room_uuid = clean_uuid(input.room_uuid)

  if (!room_uuid) {
    return
  }

  await debug_event({
    category: 'admin_chat',
    event: 'room_unread_mark_read_started',
    payload: {
      room_uuid,
      message_uuid: null,
      unread_admin_count: 0,
      admin_last_read_at: null,
      actor_admin_user_uuid: input.actor_admin_user_uuid,
      source_channel: null,
    },
  })

  const rpc = await supabase.rpc('room_mark_admin_read', {
    p_room_uuid: room_uuid,
  })

  if (rpc.error) {
    const err = rpc.error as { code?: string; message?: string }

    if (
      typeof err.message === 'string' &&
      (err.message.includes('room_mark_admin_read') ||
        err.message.includes('function') ||
        err.code === '42883')
    ) {
      const now = new Date().toISOString()
      const direct = await supabase
        .from('rooms')
        .update({
          unread_admin_count: 0,
          admin_last_read_at: now,
          updated_at: now,
        })
        .eq('room_uuid', room_uuid)

      if (direct.error) {
        console.error('[admin_unread] mark_read_direct_failed', {
          room_uuid,
          error: direct.error,
        })
      } else {
        const snap = await room_admin_unread_snapshot(room_uuid)

        await debug_event({
          category: 'admin_chat',
          event: 'room_unread_mark_read_succeeded',
          payload: {
            room_uuid,
            message_uuid: null,
            unread_admin_count: snap.unread_admin_count ?? 0,
            admin_last_read_at: snap.admin_last_read_at ?? now,
            actor_admin_user_uuid: input.actor_admin_user_uuid,
            source_channel: null,
          },
        })
      }

      return
    }

    console.error('[admin_unread] mark_read_rpc_failed', {
      room_uuid,
      error: rpc.error,
    })

    return
  }

  const snap = await room_admin_unread_snapshot(room_uuid)

  await debug_event({
    category: 'admin_chat',
    event: 'room_unread_mark_read_succeeded',
    payload: {
      room_uuid,
      message_uuid: null,
      unread_admin_count: snap.unread_admin_count ?? 0,
      admin_last_read_at:
        snap.admin_last_read_at ?? new Date().toISOString(),
      actor_admin_user_uuid: input.actor_admin_user_uuid,
      source_channel: null,
    },
  })
}
