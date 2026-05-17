'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { use_session_profile } from '@/components/session/profile'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import { participant_presence_columns_available } from '@/lib/chat/presence/schema'
import {
  build_room_card_summary,
  format_admin_room_unread_label,
  normalize_reception_channel,
  reception_channel_label,
  reception_presence_label,
  type room_card_summary_type,
  type reception_room,
} from '@/lib/admin/reception/display'
import {
  normalize_reception_state,
  type reception_state,
} from '@/lib/admin/reception/rules'
import {
  merge_admin_support_staff_from_presence,
  reception_room_refresh_admin_support_strings,
  typing_timestamp_is_fresh,
} from '@/lib/chat/presence/rules'
import {
  chat_room_realtime_channel_name,
  cleanup_chat_room_realtime,
  send_chat_realtime_debug,
  subscribe_chat_room_realtime,
  type chat_presence_payload,
  type chat_typing_payload,
} from '@/lib/chat/realtime/client'
import { resolve_client_presence_source_channel } from '@/lib/chat/realtime/support_room_client'
import {
  chat_action_timeline_text,
  cleanup_chat_actions_realtime,
  emit_chat_action_realtime_rendered,
  subscribe_chat_actions_realtime,
} from '@/lib/chat/realtime/chat_actions'
import {
  archived_message_from_message_row,
  type message_insert_row,
} from '@/lib/chat/realtime/row'
import { resolve_realtime_message_subtitle_for_toast } from '@/lib/chat/realtime/toast_decision'
import { archived_message_to_timeline_message } from '@/lib/chat/timeline_display'
import { create_browser_supabase } from '@/lib/db/browser'
import { handle_chat_message_toast } from '@/lib/output/toast'

type admin_reception_room_list_live_props = {
  admin_user_uuid?: string | null
  initial_rooms: reception_room[]
  limit?: number
  mode?: 'concierge' | 'bot'
  on_reception_gate_change?: (input: {
    state: reception_list_state
    room_count: number
  }) => void
}

type reception_list_state = reception_state | 'loading'

const component_file = 'components/admin/reception/room_list_live.tsx'

function format_time(iso: string | null): string {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function presence_meta_line_for_room(room: reception_room) {
  return reception_presence_label({
    is_typing: room.user_is_typing ?? false,
    is_online: room.user_is_online,
    last_seen_at: room.user_last_seen_at,
  })
}

function user_presence_patch(presence: chat_presence_payload) {
  const is_typing = typing_timestamp_is_fresh(
    presence.typing_at,
    presence.is_typing,
    new Date(),
  )

  return {
    user_participant_uuid: presence.participant_uuid,
    user_is_typing: is_typing,
    user_is_online: presence.is_active,
    user_last_seen_at: presence.last_seen_at,
    presence_source_channel: normalize_reception_channel(
      presence.source_channel,
    ),
    user_typing_at: presence.typing_at,
  }
}

function latest_activity_time(row: reception_room) {
  return new Date(row.latest_activity_at ?? row.updated_at ?? 0).getTime()
}

function sort_room_cards(rows: reception_room[]) {
  return [...rows].sort((a, b) => latest_activity_time(b) - latest_activity_time(a))
}

function room_summary(row: reception_room) {
  return build_room_card_summary({
    latest_message_text: row.preview,
    user_is_typing: row.user_is_typing,
    user_typing_at: row.user_typing_at,
    admin_support_staff: row.admin_support_staff,
  })
}

function room_summary_line(row: reception_room) {
  return room_summary(row).summary_text
}

function send_room_card_summary_debug(input: {
  event: string
  room: reception_room
  summary_type?: room_card_summary_type | null
}) {
  const summary = room_summary(input.room)

  send_chat_realtime_debug({
    event: input.event,
    room_uuid: input.room.room_uuid,
    source_channel: 'admin',
    summary_type: input.summary_type ?? summary.summary_type,
    summary_text: summary.summary_text,
    active_admin_count: summary.active_admin_count,
    typing_exists: summary.typing_exists,
    unread_count: input.room.unread_count ?? 0,
    latest_activity_at:
      input.room.latest_activity_at ?? input.room.updated_at ?? null,
    phase: 'admin_room_card_summary',
  })
}

async function fetch_admin_room_card(room_uuid: string) {
  const response = await fetch(`/api/admin/reception/${room_uuid}`, {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; room?: reception_room }
    | null

  return payload?.ok && payload.room ? payload.room : null
}

function send_reception_visibility_debug(input: {
  event: string
  admin_user_uuid: string | null
  reception_state: reception_list_state
  previous_state?: reception_list_state | null
  next_state?: reception_list_state | null
  room_count: number
  should_render_rooms: boolean
  source: 'initial_load' | 'realtime' | 'toggle' | 'render'
}) {
  send_admin_chat_debug({
    event: input.event,
    admin_user_uuid: input.admin_user_uuid,
    source_channel: input.source,
    reception_state: input.reception_state,
    previous_state: input.previous_state ?? null,
    next_state: input.next_state ?? input.reception_state,
    room_count: input.room_count,
    should_render_rooms: input.should_render_rooms,
    component_file,
    phase: 'admin_reception_room_list_visibility',
  })
}

export default function AdminReceptionRoomListLive({
  admin_user_uuid,
  initial_rooms,
  limit,
  mode = 'concierge',
  on_reception_gate_change,
}: admin_reception_room_list_live_props) {
  const pathname = usePathname()
  const [rooms, set_rooms] = useState<reception_room[]>([])
  const [db_reception_state, set_db_reception_state] =
    useState<reception_list_state>('closed')
  const { session } = use_session_profile()
  const titles_ref = useRef<Map<string, string>>(new Map())
  const resolved_admin_user_uuid = admin_user_uuid ?? session?.user_uuid ?? null
  const should_render_rooms = db_reception_state === 'open'
  const visible_rooms =
    typeof limit === 'number' ? rooms.slice(0, Math.max(0, limit)) : rooms

  useEffect(() => {
    console.log('[reception_list_actual_renderer_mounted]', { pathname })
  }, [pathname])

  useEffect(() => {
    on_reception_gate_change?.({
      state: db_reception_state,
      room_count: visible_rooms.length,
    })
  }, [db_reception_state, on_reception_gate_change, visible_rooms.length])

  useEffect(() => {
    if (db_reception_state !== 'open') {
      set_rooms([])
      return
    }

    set_rooms(initial_rooms)
  }, [db_reception_state, initial_rooms])

  useEffect(() => {
    const next = new Map<string, string>()

    for (const row of initial_rooms) {
      next.set(
        row.room_uuid,
        row.title?.trim() ||
          row.display_name?.trim() ||
          row.room_uuid.slice(0, 8),
      )
    }

    titles_ref.current = next
  }, [initial_rooms])

  const room_key = useMemo(
    () =>
      initial_rooms
        .map((row) => row.room_uuid)
        .sort()
        .join(','),
    [initial_rooms],
  )
  useEffect(() => {
    console.log('[reception_render_gate_checked]', {
      pathname,
      admin_user_uuid: resolved_admin_user_uuid,
      reception_state: db_reception_state,
      room_count: rooms.length,
      should_render_rooms,
    })
    send_reception_visibility_debug({
      event: 'reception_render_gate_checked',
      admin_user_uuid: resolved_admin_user_uuid,
      reception_state: db_reception_state,
      next_state: db_reception_state,
      room_count: rooms.length,
      should_render_rooms,
      source: 'render',
    })
  }, [
    db_reception_state,
    pathname,
    resolved_admin_user_uuid,
    rooms.length,
    should_render_rooms,
  ])

  const refetch_rooms_for_reception = useCallback(
    async (next_state: reception_state, source: 'initial_load' | 'realtime') => {
      if (!resolved_admin_user_uuid) {
        return
      }

      if (next_state !== 'open') {
        set_rooms([])
        send_reception_visibility_debug({
          event: 'reception_rooms_cleared',
          admin_user_uuid: resolved_admin_user_uuid,
          reception_state: next_state,
          next_state,
          room_count: 0,
          should_render_rooms: false,
          source,
        })
        return
      }

      const response = await fetch(`/api/admin/reception/rooms?mode=${mode}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error('chat_list_refetch_failed')
      }

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; state?: unknown; rooms?: reception_room[] }
        | null
      const payload_state = normalize_reception_state(payload?.state)

      if (!payload?.ok || !payload_state || !Array.isArray(payload.rooms)) {
        throw new Error('chat_list_refetch_invalid_payload')
      }

      set_db_reception_state(payload_state)
      set_rooms(payload_state === 'open' ? payload.rooms : [])
      send_reception_visibility_debug({
        event: 'reception_rooms_refetched',
        admin_user_uuid: resolved_admin_user_uuid,
        reception_state: payload_state,
        next_state: payload_state,
        room_count: payload_state === 'open' ? payload.rooms.length : 0,
        should_render_rooms: payload_state === 'open',
        source,
      })
    },
    [mode, resolved_admin_user_uuid],
  )

  useEffect(() => {
    if (!resolved_admin_user_uuid) {
      set_db_reception_state('closed')
      set_rooms([])
      return
    }

    const supabase = create_browser_supabase()

    if (!supabase) {
      set_db_reception_state('closed')
      set_rooms([])
      send_admin_chat_debug({
        event: 'reception_state_realtime_failed',
        admin_user_uuid: resolved_admin_user_uuid,
        source_channel: 'initial_load',
        error_code: 'supabase_client_unavailable',
        error_message: 'Supabase browser client is unavailable.',
        component_file,
        phase: 'admin_reception_room_list_visibility',
      })
      return
    }

    let cancelled = false

    const apply_state = (
      next_state: reception_state,
      source: 'initial_load' | 'realtime',
    ) => {
      set_db_reception_state((previous_state) => {
        send_reception_visibility_debug({
          event: 'reception_state_changed',
          admin_user_uuid: resolved_admin_user_uuid,
          reception_state: next_state,
          previous_state,
          next_state,
          room_count: next_state === 'open' ? rooms.length : 0,
          should_render_rooms: next_state === 'open',
          source,
        })

        return next_state
      })

      void refetch_rooms_for_reception(next_state, source).catch((error) => {
        send_admin_chat_debug({
          event: 'chat_list_refetch_failed',
          admin_user_uuid: resolved_admin_user_uuid,
          source_channel: source,
          error_code: 'chat_list_refetch_failed',
          error_message: error instanceof Error ? error.message : String(error),
          component_file,
          phase: 'admin_reception_room_list_visibility',
        })
      })
    }

    void (async () => {
      const result = await supabase
        .from('receptions')
        .select('state')
        .eq('user_uuid', resolved_admin_user_uuid)
        .maybeSingle()

      if (cancelled) {
        return
      }

      if (result.error) {
        set_db_reception_state('closed')
        set_rooms([])
        send_admin_chat_debug({
          event: 'reception_state_load_failed',
          admin_user_uuid: resolved_admin_user_uuid,
          source_channel: 'initial_load',
          error_code:
            typeof result.error.code === 'string'
              ? result.error.code
              : 'reception_state_load_failed',
          error_message: result.error.message,
          component_file,
          phase: 'admin_reception_room_list_visibility',
        })
        return
      }

      const next_state =
        normalize_reception_state(
          (result.data as { state?: unknown } | null)?.state,
        ) ?? 'closed'

      console.log('[reception_state_loaded]', {
        pathname,
        admin_user_uuid: resolved_admin_user_uuid,
        reception_state: next_state,
      })
      send_reception_visibility_debug({
        event: 'reception_state_loaded',
        admin_user_uuid: resolved_admin_user_uuid,
        reception_state: next_state,
        previous_state: db_reception_state,
        next_state,
        room_count: next_state === 'open' ? initial_rooms.length : 0,
        should_render_rooms: next_state === 'open',
        source: 'initial_load',
      })
      apply_state(next_state, 'initial_load')
    })()

    const handle_payload = (row: { state?: unknown } | null) => {
      const next_state = normalize_reception_state(row?.state)

      if (!next_state) {
        return
      }

      console.log('[reception_state_realtime_received]', {
        pathname,
        admin_user_uuid: resolved_admin_user_uuid,
        reception_state: next_state,
      })
      send_reception_visibility_debug({
        event: 'reception_state_realtime_received',
        admin_user_uuid: resolved_admin_user_uuid,
        reception_state: next_state,
        previous_state: db_reception_state,
        next_state,
        room_count: next_state === 'open' ? rooms.length : 0,
        should_render_rooms: next_state === 'open',
        source: 'realtime',
      })
      apply_state(next_state, 'realtime')
    }

    const channel = supabase
      .channel(`receptions:room_list:${resolved_admin_user_uuid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'receptions',
          filter: `user_uuid=eq.${resolved_admin_user_uuid}`,
        },
        (payload) => {
          handle_payload(payload.new as { state?: unknown } | null)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'receptions',
          filter: `user_uuid=eq.${resolved_admin_user_uuid}`,
        },
        (payload) => {
          handle_payload(payload.new as { state?: unknown } | null)
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          send_admin_chat_debug({
            event: 'reception_state_realtime_failed',
            admin_user_uuid: resolved_admin_user_uuid,
            source_channel: 'realtime',
            subscribe_status: status,
            error_code: 'reception_state_realtime_failed',
            error_message: status,
            component_file,
            phase: 'admin_reception_room_list_visibility',
          })
        }
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [
    db_reception_state,
    initial_rooms.length,
    pathname,
    refetch_rooms_for_reception,
    resolved_admin_user_uuid,
    rooms.length,
  ])

  useEffect(() => {
    if (db_reception_state !== 'open') {
      return
    }

    if (session?.role !== 'admin') {
      return
    }

    const tick = window.setInterval(() => {
      set_rooms((previous) => {
        const now = new Date()
        let changed = false
        const next = previous.map((row) => {
          let out = row
          let touched = false

          if (row.admin_support_staff?.length) {
            const refreshed = reception_room_refresh_admin_support_strings({
              staff: row.admin_support_staff,
              now,
            })

            if (
              refreshed.admin_support_card_line !== row.admin_support_card_line ||
              refreshed.admin_support_active_header_line !==
                row.admin_support_active_header_line ||
              refreshed.admin_support_last_handled_label !==
                row.admin_support_last_handled_label
            ) {
              out = { ...row, ...refreshed }
              touched = true
            }
          }

          if (!out.user_is_typing && !out.user_typing_at) {
            if (touched) {
              changed = true
            }

            return out
          }

          const fresh = typing_timestamp_is_fresh(
            out.user_typing_at ?? null,
            out.user_is_typing ?? null,
            now,
          )

          if (fresh === (out.user_is_typing ?? false)) {
            if (touched) {
              changed = true
            }

            return out
          }

          changed = true

          return {
            ...out,
            user_is_typing: fresh,
          }
        })

        return changed ? next : previous
      })
    }, 1_000)

    return () => {
      window.clearInterval(tick)
    }
  }, [db_reception_state, room_key, session?.role])

  useEffect(() => {
    if (db_reception_state !== 'open') {
      return
    }

    if (session?.role !== 'admin') {
      return
    }

    const room_uuids = room_key.split(',').filter(Boolean)

    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const channels: RealtimeChannel[] = []
    const chat_actions_channels: RealtimeChannel[] = []
    const typing_channels: RealtimeChannel[] = []
    const timeout_sweep = participant_presence_columns_available
      ? window.setInterval(() => {
          for (const room_uuid of room_uuids) {
            void fetch('/api/chat/presence', {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                room_uuid,
                action: 'admin_support_timeout_check',
                last_channel: resolve_client_presence_source_channel(),
                active_area: 'admin_reception_list',
              }),
            }).catch(() => {})
          }
        }, 10_000)
      : null

    send_chat_realtime_debug({
      event: participant_presence_columns_available
        ? 'admin_presence_timeout_checker_started'
        : 'admin_presence_timeout_checker_disabled',
      room_uuid: null,
      source_channel: 'admin',
      prev_count: room_uuids.length,
      next_count: room_uuids.length,
      reason: participant_presence_columns_available
        ? null
        : 'participant_presence_columns_unavailable',
      phase: 'admin_room_list_presence_timeout_checker',
    })

    send_chat_realtime_debug({
      event: 'admin_top_realtime_subscribe_started',
      room_uuid: null,
      source_channel: 'admin',
      channel_name: 'admin_top_messages_global',
      prev_count: room_uuids.length,
      next_count: room_uuids.length,
      phase: 'admin_top_messages_global',
    })

    send_chat_realtime_debug({
      category: 'admin_chat',
      event: 'admin_reception_list_realtime_subscribe_started',
      room_uuid: null,
      source_channel: 'admin',
      channel_name: 'admin_top_messages_global',
      prev_count: room_uuids.length,
      next_count: room_uuids.length,
      phase: 'admin_reception_list',
    })

    const global_messages_channel = supabase
      .channel('admin_top_messages_global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const message = archived_message_from_message_row(
            payload.new as message_insert_row,
          )

          if (!message) {
            const raw = payload.new as Record<string, unknown>

            send_chat_realtime_debug({
              event: 'admin_top_message_insert_ignored',
              room_uuid:
                typeof raw.room_uuid === 'string' ? raw.room_uuid : null,
              message_uuid:
                typeof raw.message_uuid === 'string'
                  ? raw.message_uuid
                  : null,
              ignored_reason: 'unparseable_message_row',
              phase: 'admin_top_messages_global',
            })
            return
          }

          const source_channel =
            message.body_source_channel ?? message.insert_row_channel ?? null
          const channel = message.insert_row_channel ?? source_channel
          const direction = message.body_direction ?? null
          const created_at = message.created_at ?? new Date().toISOString()
          const row_msg = archived_message_to_timeline_message({
            archive_uuid: message.archive_uuid,
            room_uuid: message.room_uuid,
            sequence: message.sequence,
            created_at: message.created_at,
            bundle: message.bundle,
          })
          const latest_text =
            row_msg.text && row_msg.text.trim().length > 0
              ? row_msg.text.trim()
              : null

          send_chat_realtime_debug({
            event: 'admin_top_message_insert_received',
            room_uuid: message.room_uuid,
            message_uuid: message.archive_uuid,
            source_channel: source_channel ?? 'web',
            channel,
            direction,
            created_at,
            phase: 'admin_top_messages_global',
          })

          send_chat_realtime_debug({
            category: 'admin_chat',
            event: 'admin_reception_list_message_received',
            room_uuid: message.room_uuid,
            message_uuid: message.archive_uuid,
            source_channel: source_channel ?? 'web',
            channel,
            direction,
            created_at,
            phase: 'admin_reception_list',
          })

          void (async () => {
            let should_fetch = false

            set_rooms((previous) => {
              const card_exists = previous.some(
                (row) => row.room_uuid === message.room_uuid,
              )
              const next_channel =
                direction === 'incoming' ? source_channel ?? channel : null

              send_chat_realtime_debug({
                event: card_exists
                  ? 'admin_top_message_insert_accepted'
                  : 'admin_top_message_insert_ignored',
                room_uuid: message.room_uuid,
                message_uuid: message.archive_uuid,
                card_exists,
                source_channel: source_channel ?? 'web',
                channel,
                direction,
                created_at,
                ignored_reason: card_exists ? null : 'room_not_in_current_list',
                prev_count: previous.length,
                next_count: previous.length,
                phase: 'admin_top_messages_global',
              })

              if (!card_exists) {
                should_fetch = true
                return previous
              }

              let previous_preview: string | null = null
              let next_preview: string | null = null
              const mapped = previous.map((row) => {
                if (row.room_uuid !== message.room_uuid) {
                  return row
                }

                previous_preview = row.preview

                const next_row = {
                  ...row,
                  preview: latest_text ?? row.preview,
                  updated_at: created_at,
                  latest_activity_at: created_at,
                  last_incoming_channel:
                    normalize_reception_channel(next_channel) ??
                    row.last_incoming_channel,
                  unread_count:
                    direction === 'incoming'
                      ? (row.unread_count ?? 0) + 1
                      : row.unread_count ?? 0,
                }
                next_preview = next_row.preview

                send_room_card_summary_debug({
                  event: 'room_card_summary_build_started',
                  room: next_row,
                })
                send_room_card_summary_debug({
                  event: 'room_card_summary_updated',
                  room: next_row,
                })

                return next_row
              })
              const sorted = sort_room_cards(mapped)
              const updated = sorted.find(
                (row) => row.room_uuid === message.room_uuid,
              )

              send_chat_realtime_debug({
                event: 'admin_top_room_card_updated',
                room_uuid: message.room_uuid,
                message_uuid: message.archive_uuid,
                card_exists: true,
                source_channel: source_channel ?? 'web',
                channel,
                direction,
                created_at,
                previous_preview,
                next_preview,
                unread_count: updated?.unread_count ?? null,
                latest_activity_at: created_at,
                prev_count: previous.length,
                next_count: sorted.length,
                phase: 'admin_top_messages_global',
              })
              send_chat_realtime_debug({
                event: 'admin_top_room_cards_sorted',
                room_uuid: message.room_uuid,
                message_uuid: message.archive_uuid,
                card_exists: true,
                source_channel: source_channel ?? 'web',
                channel,
                direction,
                created_at,
                prev_count: previous.length,
                next_count: sorted.length,
                phase: 'admin_top_messages_global',
              })

              send_chat_realtime_debug({
                category: 'admin_chat',
                event: 'admin_reception_list_message_card_updated',
                room_uuid: message.room_uuid,
                message_uuid: message.archive_uuid,
                source_channel: source_channel ?? 'web',
                channel,
                direction,
                created_at,
                previous_preview,
                next_preview,
                unread_count: updated?.unread_count ?? null,
                latest_activity_at: created_at,
                prev_count: previous.length,
                next_count: sorted.length,
                phase: 'admin_reception_list',
              })

              send_chat_realtime_debug({
                category: 'admin_chat',
                event: 'admin_reception_list_cards_sorted',
                room_uuid: message.room_uuid,
                message_uuid: message.archive_uuid,
                source_channel: source_channel ?? 'web',
                channel,
                direction,
                created_at,
                prev_count: previous.length,
                next_count: sorted.length,
                phase: 'admin_reception_list',
              })

              queueMicrotask(() => {
                const list_title =
                  titles_ref.current.get(message.room_uuid) ??
                  message.room_uuid.slice(0, 8)

                handle_chat_message_toast({
                  room_uuid: message.room_uuid,
                  active_room_uuid: null,
                  message_uuid: message.archive_uuid,
                  sender_user_uuid: message.sender_user_uuid ?? null,
                  sender_participant_uuid:
                    message.sender_participant_uuid ?? null,
                  sender_role:
                    message.sender_role ?? message.bundle.sender ?? null,
                  active_user_uuid: session?.user_uuid ?? null,
                  active_participant_uuid: null,
                  active_role: 'admin',
                  role: 'admin',
                  tier: session?.tier ?? null,
                  source_channel: 'admin',
                  target_path: `/admin/reception/${message.room_uuid}`,
                  phase: 'admin_reception_list_realtime_message',
                  is_scrolled_to_bottom: null,
                  subtitle: resolve_realtime_message_subtitle_for_toast(
                    message,
                    list_title,
                  ),
                  scroll_to_bottom: null,
                })
              })

              return sorted
            })

            if (!should_fetch) {
              return
            }

            const fetched = await fetch_admin_room_card(message.room_uuid)

            if (!fetched) {
              send_chat_realtime_debug({
                event: 'admin_top_message_insert_ignored',
                room_uuid: message.room_uuid,
                message_uuid: message.archive_uuid,
                card_exists: false,
                source_channel: source_channel ?? 'web',
                channel,
                direction,
                created_at,
                ignored_reason: 'room_summary_fetch_failed',
                phase: 'admin_top_messages_global',
              })
              return
            }

            set_rooms((previous) => {
              if (previous.some((row) => row.room_uuid === fetched.room_uuid)) {
                return previous
              }

              const next_row = {
                ...fetched,
                preview: latest_text ?? fetched.preview,
                updated_at: created_at,
                latest_activity_at: created_at,
                last_incoming_channel:
                  normalize_reception_channel(
                    direction === 'incoming' ? source_channel ?? channel : null,
                  ) ?? fetched.last_incoming_channel,
              }
              const sorted = sort_room_cards([...previous, next_row])

              send_chat_realtime_debug({
                event: 'admin_top_room_card_inserted',
                room_uuid: message.room_uuid,
                message_uuid: message.archive_uuid,
                card_exists: false,
                source_channel: source_channel ?? 'web',
                channel,
                direction,
                created_at,
                previous_preview: null,
                next_preview: next_row.preview,
                unread_count: next_row.unread_count ?? 0,
                latest_activity_at: created_at,
                prev_count: previous.length,
                next_count: sorted.length,
                phase: 'admin_top_messages_global',
              })
              send_chat_realtime_debug({
                event: 'admin_top_room_cards_sorted',
                room_uuid: message.room_uuid,
                message_uuid: message.archive_uuid,
                card_exists: false,
                source_channel: source_channel ?? 'web',
                channel,
                direction,
                created_at,
                prev_count: previous.length,
                next_count: sorted.length,
                phase: 'admin_top_messages_global',
              })

              send_chat_realtime_debug({
                category: 'admin_chat',
                event: 'admin_reception_list_cards_sorted',
                room_uuid: message.room_uuid,
                message_uuid: message.archive_uuid,
                source_channel: source_channel ?? 'web',
                channel,
                direction,
                created_at,
                prev_count: previous.length,
                next_count: sorted.length,
                phase: 'admin_reception_list',
              })

              queueMicrotask(() => {
                const list_title =
                  titles_ref.current.get(message.room_uuid) ??
                  message.room_uuid.slice(0, 8)

                handle_chat_message_toast({
                  room_uuid: message.room_uuid,
                  active_room_uuid: null,
                  message_uuid: message.archive_uuid,
                  sender_user_uuid: message.sender_user_uuid ?? null,
                  sender_participant_uuid:
                    message.sender_participant_uuid ?? null,
                  sender_role:
                    message.sender_role ?? message.bundle.sender ?? null,
                  active_user_uuid: session?.user_uuid ?? null,
                  active_participant_uuid: null,
                  active_role: 'admin',
                  role: 'admin',
                  tier: session?.tier ?? null,
                  source_channel: 'admin',
                  target_path: `/admin/reception/${message.room_uuid}`,
                  phase: 'admin_reception_list_realtime_message',
                  is_scrolled_to_bottom: null,
                  subtitle: resolve_realtime_message_subtitle_for_toast(
                    message,
                    list_title,
                  ),
                  scroll_to_bottom: null,
                })
              })

              return sorted
            })
          })()
        },
      )
      .subscribe()

    room_uuids.forEach((room_uuid) => {
      send_chat_realtime_debug({
        event: 'admin_room_list_realtime_subscribe_started',
        room_uuid,
        active_room_uuid: null,
        user_uuid: session?.user_uuid ?? null,
        role: 'admin',
        tier: session?.tier ?? null,
        source_channel: 'admin',
        channel_name: `admin_room_list:${room_uuid}`,
        phase: 'admin_room_list_realtime',
      })

      const channel = subscribe_chat_room_realtime({
        supabase,
        room_uuid,
        active_room_uuid: null,
        participant_uuid: null,
        user_uuid: session?.user_uuid ?? null,
        role: 'admin',
        tier: session?.tier ?? null,
        source_channel: 'admin',
        listener_scope: 'admin_list',
        on_message: () => {
          /* List cards use `admin_top_messages_global` messages INSERT + chat_actions per room. */
        },
        on_typing: () => {},
        on_presence: (presence) => {
          const role = presence.role?.trim().toLowerCase() ?? ''

          if (role === 'user' || role === 'driver') {
            const patch = user_presence_patch(presence)

            set_rooms((previous) => {
              let matched = false
              const next = previous.map((row) => {
                if (row.room_uuid !== presence.room_uuid) {
                  return row
                }

                matched = true
                const activity_at =
                  patch.user_is_typing && presence.typing_at
                    ? presence.typing_at
                    : row.latest_activity_at ?? row.updated_at ?? null
                const next_row = {
                  ...row,
                  ...patch,
                  latest_activity_at: activity_at,
                  updated_at: activity_at ?? row.updated_at,
                  last_incoming_channel:
                    normalize_reception_channel(presence.source_channel) ??
                    row.last_incoming_channel,
                }

                send_chat_realtime_debug({
                  event: 'room_card_realtime_presence_received',
                  room_uuid: presence.room_uuid,
                  participant_uuid: presence.participant_uuid,
                  user_uuid: presence.user_uuid,
                  source_channel: presence.source_channel ?? 'web',
                  is_typing: patch.user_is_typing,
                  last_seen_at: presence.last_seen_at,
                  typing_at: presence.typing_at,
                  summary_type: room_summary(next_row).summary_type,
                  summary_text: room_summary(next_row).summary_text,
                  active_admin_count: room_summary(next_row).active_admin_count,
                  typing_exists: room_summary(next_row).typing_exists,
                  unread_count: next_row.unread_count ?? 0,
                  latest_activity_at: next_row.latest_activity_at ?? null,
                  phase: 'admin_room_list_presence',
                })
                send_room_card_summary_debug({
                  event: 'room_card_summary_build_started',
                  room: next_row,
                })
                send_room_card_summary_debug({
                  event: 'room_card_summary_updated',
                  room: next_row,
                })

                return next_row
              })

              send_chat_realtime_debug({
                event: 'admin_presence_state_updated',
                room_uuid: presence.room_uuid,
                participant_uuid: presence.participant_uuid,
                role: presence.role,
                source_channel: presence.source_channel ?? 'web',
                is_active: presence.is_active,
                is_typing: patch.user_is_typing,
                last_seen_at: presence.last_seen_at,
                typing_at: presence.typing_at,
                ignored_reason: matched ? null : 'room_not_in_current_list',
                phase: 'admin_room_list_presence',
              })

              if (matched) {
                send_chat_realtime_debug({
                  event: 'admin_room_typing_state_updated',
                  room_uuid: presence.room_uuid,
                  active_room_uuid: null,
                  participant_uuid: presence.participant_uuid,
                  user_uuid: presence.user_uuid,
                  source_channel: presence.source_channel ?? 'web',
                  is_typing: patch.user_is_typing,
                  ignored_reason: null,
                  phase: 'admin_room_list_presence',
                })
              }

              return matched ? sort_room_cards(next) : previous
            })

            return
          }

          if (role !== 'admin' && role !== 'concierge') {
            return
          }

          set_rooms((previous) => {
            let matched = false
            const now = new Date()
            const next = previous.map((row) => {
              if (row.room_uuid !== presence.room_uuid) {
                return row
              }

              matched = true
              const staff = merge_admin_support_staff_from_presence({
                staff: row.admin_support_staff,
                presence,
              })
              const built = reception_room_refresh_admin_support_strings({
                staff,
                now,
              })
              const activity_at =
                presence.last_seen_at ?? row.latest_activity_at ?? row.updated_at
              const next_row = {
                ...row,
                ...built,
                latest_activity_at: activity_at,
                updated_at: activity_at ?? row.updated_at,
              }
              const summary = room_summary(next_row)

              send_chat_realtime_debug({
                event: 'room_card_support_state_received',
                room_uuid: presence.room_uuid,
                active_room_uuid: null,
                participant_uuid: presence.participant_uuid,
                admin_user_uuid: presence.user_uuid,
                user_uuid: presence.user_uuid,
                role: presence.role,
                source_channel: presence.source_channel ?? 'admin',
                is_active: presence.is_active,
                is_typing: presence.is_typing,
                last_seen_at: presence.last_seen_at,
                typing_at: presence.typing_at,
                summary_type: summary.summary_type,
                summary_text: summary.summary_text,
                active_admin_count: summary.active_admin_count,
                typing_exists: summary.typing_exists,
                unread_count: next_row.unread_count ?? 0,
                latest_activity_at: next_row.latest_activity_at ?? null,
                ignored_reason: null,
                phase: 'admin_room_list_support_presence',
              })
              send_room_card_summary_debug({
                event: 'room_card_summary_build_started',
                room: next_row,
              })
              send_room_card_summary_debug({
                event: 'room_card_summary_updated',
                room: next_row,
              })

              return next_row
            })

            return matched ? sort_room_cards(next) : previous
          })
        },
      })

      const typing_channel = supabase.channel(
        chat_room_realtime_channel_name(room_uuid),
        { config: { broadcast: { self: true } } },
      )

      typing_channel
        .on('broadcast', { event: 'typing' }, (payload) => {
          const raw = payload.payload

          if (!raw || typeof raw !== 'object') {
            return
          }

          const typing = raw as chat_typing_payload

          if (typing.room_uuid !== room_uuid) {
            return
          }

          const role = typing.role?.trim().toLowerCase() ?? ''

          if (role !== 'user' && role !== 'driver') {
            return
          }

          const is_typing = typing.is_typing === true
          const typing_at = typing.sent_at ?? typing.typed_at ?? null

          set_rooms((previous) => {
            let matched = false
            const next = previous.map((row) => {
              if (row.room_uuid !== room_uuid) {
                return row
              }

              matched = true
              const activity_at =
                is_typing && typing_at
                  ? typing_at
                  : row.latest_activity_at ?? row.updated_at ?? null
              const next_row = {
                ...row,
                user_is_typing: is_typing,
                user_typing_at: typing_at,
                latest_activity_at: activity_at,
                updated_at: activity_at ?? row.updated_at,
              }

              send_chat_realtime_debug({
                event: 'admin_room_typing_state_updated',
                room_uuid,
                active_room_uuid: null,
                participant_uuid: typing.participant_uuid,
                user_uuid: typing.user_uuid ?? null,
                source_channel: 'admin',
                is_typing,
                typing_at,
                ignored_reason: null,
                phase: 'admin_room_list_typing_broadcast',
              })

              return next_row
            })

            return matched ? sort_room_cards(next) : previous
          })
        })
        .subscribe()

      typing_channels.push(typing_channel)
      channels.push(channel)

      const actions_channel = subscribe_chat_actions_realtime({
        supabase,
        room_uuid,
        scope: 'admin_list',
        source_channel: 'admin',
        on_action: (action, inserted_index) => {
          send_chat_realtime_debug({
            event: 'admin_top_chat_action_received',
            room_uuid: action.room_uuid,
            active_room_uuid: null,
            action_uuid: action.action_uuid,
            event_type: action.action_type,
            source_channel: action.source_channel ?? 'admin',
            ignored_reason: null,
            phase: 'admin_room_list_support_action',
          })

          send_chat_realtime_debug({
            category: 'admin_chat',
            event: 'admin_reception_list_action_received',
            room_uuid: action.room_uuid,
            action_uuid: action.action_uuid,
            event_type: action.action_type,
            source_channel: action.source_channel ?? 'admin',
            phase: 'admin_reception_list',
          })

          if (
            action.action_type !== 'support_started' &&
            action.action_type !== 'support_left'
          ) {
            send_chat_realtime_debug({
              event: 'admin_top_chat_action_ignored',
              room_uuid: action.room_uuid,
              active_room_uuid: null,
              action_uuid: action.action_uuid,
              event_type: action.action_type,
              source_channel: action.source_channel ?? 'admin',
              ignored_reason: 'unsupported_action_type',
              phase: 'admin_room_list_support_action',
            })

            return
          }

          const activity_at = action.created_at ?? new Date().toISOString()
          const body_text = chat_action_timeline_text(action)

          set_rooms((previous) => {
            let matched = false
            const next = previous.map((row) => {
              if (row.room_uuid !== action.room_uuid) {
                return row
              }

              matched = true
              const next_row = {
                ...row,
                preview: body_text || row.preview,
                updated_at: activity_at,
                latest_activity_at: activity_at,
                user_is_typing: false,
                user_typing_at: null,
              }

              send_chat_realtime_debug({
                event: 'admin_top_chat_action_accepted',
                room_uuid: action.room_uuid,
                active_room_uuid: null,
                action_uuid: action.action_uuid,
                event_type: action.action_type,
                source_channel: action.source_channel ?? 'admin',
                prev_count: previous.length,
                next_count: previous.length,
                ignored_reason: null,
                phase: 'admin_room_list_support_action',
              })

              send_chat_realtime_debug({
                event: 'admin_top_room_card_updated_from_action',
                room_uuid: action.room_uuid,
                active_room_uuid: null,
                action_uuid: action.action_uuid,
                event_type: action.action_type,
                source_channel: action.source_channel ?? 'admin',
                prev_count: previous.length,
                next_count: previous.length,
                latest_activity_at: activity_at,
                phase: 'admin_room_list_support_action',
              })

              send_room_card_summary_debug({
                event: 'room_card_summary_build_started',
                room: next_row,
              })
              send_room_card_summary_debug({
                event: 'room_card_summary_updated',
                room: next_row,
              })

              return next_row
            })

            if (!matched) {
              send_chat_realtime_debug({
                event: 'admin_top_chat_action_ignored',
                room_uuid: action.room_uuid,
                active_room_uuid: null,
                action_uuid: action.action_uuid,
                event_type: action.action_type,
                source_channel: action.source_channel ?? 'admin',
                ignored_reason: 'room_card_not_found',
                phase: 'admin_room_list_support_action',
              })

              return previous
            }

            const sorted = sort_room_cards(next)

            send_chat_realtime_debug({
              event: 'admin_top_room_cards_sorted',
              room_uuid: action.room_uuid,
              action_uuid: action.action_uuid,
              event_type: action.action_type,
              prev_count: previous.length,
              next_count: sorted.length,
              phase: 'admin_room_list_support_action',
            })

            send_chat_realtime_debug({
              category: 'admin_chat',
              event: 'admin_reception_list_action_card_updated',
              room_uuid: action.room_uuid,
              action_uuid: action.action_uuid,
              event_type: action.action_type,
              latest_activity_at: activity_at,
              prev_count: previous.length,
              next_count: sorted.length,
              phase: 'admin_reception_list',
            })

            send_chat_realtime_debug({
              category: 'admin_chat',
              event: 'admin_reception_list_cards_sorted',
              room_uuid: action.room_uuid,
              action_uuid: action.action_uuid,
              event_type: action.action_type,
              prev_count: previous.length,
              next_count: sorted.length,
              phase: 'admin_reception_list',
            })

            return sorted
          })

          emit_chat_action_realtime_rendered({
            room_uuid,
            active_room_uuid: room_uuid,
            action,
            inserted_index,
            source_channel: 'admin',
            phase: 'admin_room_list_support_action',
          })
        },
      })

      chat_actions_channels.push(actions_channel)
    })

    const rooms_filter =
      room_uuids.length === 1
        ? `room_uuid=eq.${room_uuids[0]}`
        : `room_uuid=in.(${room_uuids.join(',')})`

    const rooms_unread_channel =
      room_uuids.length > 0
        ? supabase
            .channel(`admin_reception_rooms_unread:${room_key}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'rooms',
                filter: rooms_filter,
              },
              (payload) => {
          const new_row = payload.new as Record<string, unknown>
          const ru =
            typeof new_row.room_uuid === 'string' ? new_row.room_uuid : null

          if (!ru) {
            return
          }

          const unread_admin_count =
            typeof new_row.unread_admin_count === 'number'
              ? Math.max(0, Math.floor(new_row.unread_admin_count))
              : null
          const admin_last_read_at =
            typeof new_row.admin_last_read_at === 'string'
              ? new_row.admin_last_read_at
              : null
          const updated_at_row =
            typeof new_row.updated_at === 'string' ? new_row.updated_at : null
          const last_inc = normalize_reception_channel(
            new_row.last_incoming_channel,
          )
          const preview_body =
            typeof new_row.last_message_body === 'string' &&
            new_row.last_message_body.trim()
              ? new_row.last_message_body.trim()
              : null
          const mode_row =
            typeof new_row.mode === 'string' && new_row.mode.trim()
              ? new_row.mode.trim()
              : null

          send_chat_realtime_debug({
            event: 'room_unread_realtime_received',
            room_uuid: ru,
            active_room_uuid: null,
            participant_uuid: null,
            user_uuid: session?.user_uuid ?? null,
            role: 'admin',
            tier: session?.tier ?? null,
            source_channel: 'admin',
            subscribe_status: null,
            channel_name: null,
            event_name: null,
            schema: 'public',
            postgres_event: 'UPDATE',
            table: 'rooms',
            filter: rooms_filter,
            message_uuid: null,
            payload_message_uuid: null,
            payload_action_uuid: null,
            payload_room_uuid: ru,
            sender_user_uuid: null,
            sender_participant_uuid: null,
            active_participant_uuid: null,
            active_user_uuid: session?.user_uuid ?? null,
            active_role: 'admin',
            sender_role: null,
            display_name: null,
            is_typing: null,
            is_active: null,
            last_seen_at: null,
            typing_at: null,
            ignored_reason: null,
            error_code: null,
            error_message: null,
            error_details: null,
            error_hint: null,
            prev_message_count: null,
            next_message_count: null,
            prev_room_count: null,
            next_room_count: null,
            dedupe_hit: null,
            phase: 'admin_room_list_rooms_realtime',
            cleanup_reason: null,
            is_self_sender: null,
            comparison_strategy: null,
            guest_strategy_used: null,
            channel_topic: null,
            listener_registered: null,
            client_instance_id: null,
            payload_preview: null,
            visibility_state: null,
            is_scrolled_to_bottom: null,
            skip_reason: null,
            message_channel: null,
            message_source_channel: null,
            message_direction: null,
            channel: null,
            direction: null,
            last_message_at: updated_at_row,
            payload_channel: null,
            payload_source_channel: null,
            payload_direction: null,
            message_count_before: null,
            message_count_after: null,
            oldest_created_at: null,
            newest_created_at: null,
            realtime_message_uuid: null,
            realtime_created_at: null,
            unread_admin_count,
            admin_last_read_at,
            actor_admin_user_uuid: session?.user_uuid ?? null,
          })

          set_rooms((previous) => {
            let matched = false
            const mapped = previous.map((row) => {
              if (row.room_uuid !== ru) {
                return row
              }

              matched = true
              const next_row = {
                ...row,
                unread_count:
                  unread_admin_count !== null
                    ? unread_admin_count
                    : (row.unread_count ?? 0),
                updated_at: updated_at_row ?? row.updated_at,
                latest_activity_at: updated_at_row ?? row.latest_activity_at,
                last_incoming_channel:
                  last_inc !== null ? last_inc : row.last_incoming_channel,
                preview: preview_body ?? row.preview,
                mode: mode_row ?? row.mode,
              }
              send_room_card_summary_debug({
                event: 'room_card_summary_build_started',
                room: next_row,
              })
              send_room_card_summary_debug({
                event: 'room_card_summary_updated',
                room: next_row,
              })

              return next_row
            })

            send_chat_realtime_debug({
              event: 'admin_room_badge_updated',
              room_uuid: ru,
              active_room_uuid: null,
              participant_uuid: null,
              user_uuid: session?.user_uuid ?? null,
              role: 'admin',
              tier: session?.tier ?? null,
              source_channel: 'admin',
              subscribe_status: null,
              channel_name: null,
              event_name: null,
              schema: 'public',
              postgres_event: 'UPDATE',
              table: 'rooms',
              filter: rooms_filter,
              message_uuid: null,
              payload_message_uuid: null,
              payload_action_uuid: null,
              payload_room_uuid: ru,
              sender_user_uuid: null,
              sender_participant_uuid: null,
              active_participant_uuid: null,
              active_user_uuid: session?.user_uuid ?? null,
              active_role: 'admin',
              sender_role: null,
              display_name: null,
              is_typing: null,
              is_active: null,
              last_seen_at: null,
              typing_at: null,
              ignored_reason: matched ? null : 'room_not_in_current_list',
              error_code: null,
              error_message: null,
              error_details: null,
              error_hint: null,
              prev_message_count: null,
              next_message_count: null,
              prev_room_count: previous.length,
              next_room_count: matched ? previous.length : null,
              dedupe_hit: null,
              phase: 'admin_room_list_rooms_realtime',
              cleanup_reason: null,
              is_self_sender: null,
              comparison_strategy: null,
              guest_strategy_used: null,
              channel_topic: null,
              listener_registered: null,
              client_instance_id: null,
              payload_preview: null,
              visibility_state: null,
              is_scrolled_to_bottom: null,
              skip_reason: null,
              message_channel: null,
              message_source_channel: null,
              message_direction: null,
              channel: null,
              direction: null,
              last_message_at: updated_at_row,
              payload_channel: null,
              payload_source_channel: null,
              payload_direction: null,
              message_count_before: null,
              message_count_after: null,
              oldest_created_at: null,
              newest_created_at: null,
              realtime_message_uuid: null,
              realtime_created_at: null,
              unread_admin_count,
              admin_last_read_at,
              actor_admin_user_uuid: session?.user_uuid ?? null,
            })

            if (!matched) {
              return previous
            }

            const sorted = sort_room_cards(mapped)

            send_chat_realtime_debug({
              event: 'room_card_resorted',
              room_uuid: ru,
              source_channel: 'admin',
              unread_count: unread_admin_count,
              latest_activity_at: updated_at_row,
              phase: 'admin_room_list_rooms_realtime',
            })

            return sorted
          })
              },
            )
            .subscribe()
        : null

    return () => {
      channels.forEach((ch, index) => {
        cleanup_chat_room_realtime({
          supabase,
          channel: ch,
          room_uuid: room_uuids[index] ?? '',
          active_room_uuid: null,
          participant_uuid: null,
          user_uuid: session?.user_uuid ?? null,
          role: 'admin',
          tier: session?.tier ?? null,
          source_channel: 'admin',
          cleanup_reason: 'admin_reception_room_list_unmount',
        })
      })
      chat_actions_channels.forEach((ch, index) => {
        cleanup_chat_actions_realtime({
          supabase,
          channel: ch,
          room_uuid: room_uuids[index] ?? '',
          scope: 'admin_list',
          cleanup_reason: 'admin_reception_room_list_unmount',
        })
      })
      typing_channels.forEach((ch) => {
        void supabase.removeChannel(ch)
      })
      if (timeout_sweep !== null) {
        window.clearInterval(timeout_sweep)
        send_chat_realtime_debug({
          event: 'admin_presence_timeout_checker_stopped',
          room_uuid: null,
          source_channel: 'admin',
          prev_count: room_uuids.length,
          next_count: room_uuids.length,
          reason: 'component_cleanup',
          phase: 'admin_room_list_presence_timeout_checker',
        })
      }
      void supabase.removeChannel(global_messages_channel)
      if (rooms_unread_channel) {
        void supabase.removeChannel(rooms_unread_channel)
      }
    }
  }, [
    db_reception_state,
    room_key,
    session?.role,
    session?.tier,
    session?.user_uuid,
  ])

  return (
    <>
      <div data-debug="actual_admin_room_list_renderer" />
      {should_render_rooms ? (
      <ul className="flex flex-col gap-2">
      {visible_rooms.map((room) => (
        <li key={room.room_uuid}>
          <Link
            href={`/admin/reception/${room.room_uuid}`}
            className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <div className="relative shrink-0" aria-hidden>
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-700">
                {room.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={room.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : room.display_name ? (
                  <span className="text-[12px] font-semibold">
                    {room.display_name.slice(0, 1)}
                  </span>
                ) : (
                  <MessageCircle className="h-4 w-4" strokeWidth={2} />
                )}
              </div>
              {(room.unread_count ?? 0) > 0 ? (
                <span
                  className="absolute -left-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white"
                  aria-label={`未読 ${format_admin_room_unread_label(room.unread_count ?? 0)}`}
                >
                  {format_admin_room_unread_label(room.unread_count ?? 0)}
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-semibold leading-tight text-black">
                  {room.display_name}
                </span>
                <span className="shrink-0 text-[11px] font-medium leading-none text-neutral-400">
                  {format_time(room.updated_at)}
                </span>
              </div>
              {room_summary_line(room) ? (
                <p className="mt-0.5 truncate text-[12px] leading-tight text-neutral-600">
                  {room_summary_line(room)}
                </p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium leading-none text-neutral-500">
                <span className="font-mono text-neutral-400">
                  {room.room_uuid.slice(0, 8)}
                </span>
                {room.mode ? (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700">
                    {room.mode}
                  </span>
                ) : null}
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-white">
                  {reception_channel_label(room.last_incoming_channel)}
                </span>
                {presence_meta_line_for_room(room) ? (
                  <span className="text-neutral-500">
                    {presence_meta_line_for_room(room)}
                  </span>
                ) : null}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
      ) : null}
    </>
  )
}
