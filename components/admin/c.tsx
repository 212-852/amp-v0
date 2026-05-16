'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'

import PawIcon from '@/components/icons/paw'
import { AdminRenderProbe } from '@/components/admin/render_probe'
import { use_admin_reception_support_presence } from '@/components/admin/reception/admin_support_presence'
import {
  archived_message_to_timeline_message,
  chat_timeline_time_bounds,
  normalize_chat_timeline_messages,
  type chat_room_timeline_message,
} from '@/lib/chat/timeline_display'
import type { message_bundle } from '@/lib/chat/message'
import {
  chat_room_realtime_channel_name,
  chat_typing_is_fresh,
  cleanup_chat_room_realtime,
  publish_chat_typing,
  send_chat_realtime_debug,
  subscribe_chat_room_realtime,
  sync_chat_typing_presence,
  type chat_typing_payload,
} from '@/lib/chat/realtime/client'
import {
  append_chat_action_to_admin_timeline,
  cleanup_chat_actions_realtime,
  emit_chat_action_realtime_rendered,
  subscribe_chat_actions_realtime,
  type chat_action_realtime_payload,
} from '@/lib/chat/realtime/chat_actions'
import {
  call_leave_support_room,
  call_enter_support_room,
  support_room_api_action_to_realtime,
} from '@/lib/chat/realtime/support_room_client'
import { create_browser_supabase } from '@/lib/db/browser'
import { handle_chat_message_toast } from '@/lib/output/toast'
import {
  compute_message_list_near_bottom,
  resolve_realtime_message_subtitle_for_toast,
} from '@/lib/chat/realtime/toast_decision'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

const component_file = 'components/admin/c.tsx'

type AdminChatTimelineProps = {
  messages: chat_room_timeline_message[]
  load_failed: boolean
  room_uuid: string
  staff_participant_uuid: string
  staff_display_name: string
  staff_user_uuid: string | null
  staff_tier: string | null
  room_display_title: string
}

function merge_timeline_rows(
  previous: chat_room_timeline_message[],
  addition: chat_room_timeline_message[],
): {
  rows: chat_room_timeline_message[]
  prev_message_count: number
  next_message_count: number
  dedupe_hit: boolean
  combined_len_before_normalize: number
  oldest_created_at: string | null
  newest_created_at: string | null
} {
  const combined_len_before_normalize = previous.length + addition.length
  const rows = normalize_chat_timeline_messages([
    ...previous,
    ...addition,
  ])
  const dedupe_hit = combined_len_before_normalize > rows.length
  const bounds = chat_timeline_time_bounds(rows)

  return {
    rows,
    prev_message_count: previous.length,
    next_message_count: rows.length,
    dedupe_hit,
    combined_len_before_normalize,
    oldest_created_at: bounds.oldest_created_at,
    newest_created_at: bounds.newest_created_at,
  }
}

function is_outgoing_message(message: chat_room_timeline_message): boolean {
  if (message.direction === 'system') {
    return false
  }

  return (
    message.direction === 'outgoing' ||
    message.sender === 'admin' ||
    message.sender === 'concierge' ||
    message.sender === 'bot' ||
    message.sender === 'system' ||
    message.role === 'admin' ||
    message.role === 'bot' ||
    message.role === 'system'
  )
}

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

type message_bundle_payload = {
  bundle_type?: string
  sender?: string
  payload?: { text?: string }
  metadata?: Record<string, unknown>
}

function archived_payload_to_reception_message(row: {
  archive_uuid: string
  room_uuid: string
  sequence: number
  created_at: string
  bundle: message_bundle_payload
}): chat_room_timeline_message {
  return archived_message_to_timeline_message({
    archive_uuid: row.archive_uuid,
    room_uuid: row.room_uuid,
    sequence: row.sequence,
    created_at: row.created_at,
    bundle: row.bundle as message_bundle,
  })
}

export default function AdminChatTimeline({
  messages: initial_messages,
  load_failed,
  room_uuid,
  staff_participant_uuid,
  staff_display_name,
  staff_user_uuid,
  staff_tier,
  room_display_title,
}: AdminChatTimelineProps) {
  const render_pathname =
    typeof window !== 'undefined' ? window.location.pathname : null
  const render_mounted_at = new Date().toISOString()
  const render_dependency_values = JSON.stringify({
    room_uuid,
    staff_participant_uuid,
    staff_user_uuid,
    staff_tier,
  })

  if (typeof console !== 'undefined') {
    console.log('ADMIN_CHAT_ROOM_RENDERED', component_file)
    console.debug('[admin_chat_room_rendered]', {
      room_uuid,
      selected_room_uuid: room_uuid,
      active_room_uuid: room_uuid,
      pathname: render_pathname,
      admin_user_uuid: staff_user_uuid,
      admin_participant_uuid: staff_participant_uuid,
      support_mode: null,
      mounted_at: render_mounted_at,
      dependency_values: render_dependency_values,
      component_file,
    })
  }

  if (typeof window !== 'undefined') {
    send_chat_realtime_debug({
      event: 'admin_chat_room_rendered',
      room_uuid,
      selected_room_uuid: room_uuid,
      active_room_uuid: room_uuid,
      participant_uuid: staff_participant_uuid,
      admin_participant_uuid: staff_participant_uuid,
      admin_user_uuid: staff_user_uuid,
      user_uuid: staff_user_uuid,
      role: 'admin',
      tier: staff_tier,
      source_channel: 'admin',
      pathname: render_pathname,
      support_mode: null,
      mounted_at: render_mounted_at,
      dependency_values: render_dependency_values,
      component_file,
      phase: 'admin_chat_render',
    })
  }

  const bottom_ref = useRef<HTMLDivElement | null>(null)
  const message_list_scroll_ref = useRef<HTMLDivElement | null>(null)
  const realtime_channel_ref = useRef<RealtimeChannel | null>(null)
  const chat_actions_channel_ref = useRef<RealtimeChannel | null>(null)
  const typing_broadcast_channel_ref = useRef<RealtimeChannel | null>(null)
  const typing_rows_ref = useRef<Map<string, chat_typing_payload>>(new Map())
  const [rows, set_rows] = useState(() =>
    normalize_chat_timeline_messages(initial_messages),
  )
  const [reply_text, set_reply_text] = useState('')
  const [is_sending, set_is_sending] = useState(false)
  const [show_jump_button, set_show_jump_button] = useState(false)
  const [typing_lines, set_typing_lines] = useState<string[]>([])
  const typing_timer_ref = useRef<number | null>(null)
  const publish_typing_timer_ref = useRef<number | null>(null)
  const typing_active_ref = useRef(false)

  const staff_participant_uuid_ref = useRef(staff_participant_uuid)

  const latest_room_uuid_ref = useRef(room_uuid)

  const admin_rt_ctx_ref = useRef({
    staff_participant_uuid,
    staff_user_uuid,
    staff_tier,
  })

  const active_typing_identity_ref = useRef({
    user_uuid: null as string | null,
    participant_uuid: null as string | null,
    role: null as string | null,
  })

  const subscribed_room_uuid_ref = useRef<string | null>(null)
  const subscribed_chat_actions_room_ref = useRef<string | null>(null)
  const support_enter_session_ref = useRef<string | null>(null)
  const show_jump_button_ref = useRef(false)
  const mounted_at_ref = useRef(render_mounted_at)
  const room_display_title_ref = useRef(room_display_title)
  const admin_browser_supabase_ref = useRef<SupabaseClient | null>(null)

  useEffect(() => {
    room_display_title_ref.current = room_display_title
  }, [room_display_title])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    send_chat_realtime_debug({
      event: 'admin_realtime_client_mounted',
      room_uuid: null,
      active_room_uuid: null,
      role: 'admin',
      source_channel: 'admin',
      pathname: window.location.pathname,
      phase: 'admin_realtime_client_lifecycle',
      dependency_values: JSON.stringify({
        is_use_client_module: true,
        next_public_supabase_url_configured: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
        ),
        next_public_supabase_anon_key_configured: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        ),
      }),
    })
  }, [])

  useEffect(() => {
    const pathname =
      typeof window !== 'undefined' ? window.location.pathname : null

    send_chat_realtime_debug({
      event: 'admin_chat_room_mounted',
      room_uuid,
      selected_room_uuid: room_uuid,
      active_room_uuid: room_uuid,
      previous_room_uuid: null,
      next_room_uuid: room_uuid,
      participant_uuid: staff_participant_uuid,
      admin_user_uuid: staff_user_uuid,
      user_uuid: staff_user_uuid,
      role: 'admin',
      tier: staff_tier,
      source_channel: 'admin',
      pathname,
      support_mode: null,
      mounted_at: mounted_at_ref.current,
      component_file,
      dependency_values: JSON.stringify({
        room_uuid,
        staff_participant_uuid,
        staff_user_uuid,
        staff_tier,
      }),
      reason: 'component_mount',
      phase: 'admin_chat_detail_lifecycle',
    })

    return () => {
      send_chat_realtime_debug({
        event: 'admin_chat_detail_unmounted',
        room_uuid,
        selected_room_uuid: room_uuid,
        active_room_uuid: room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        participant_uuid: staff_participant_uuid,
        admin_user_uuid: staff_user_uuid,
        user_uuid: staff_user_uuid,
        role: 'admin',
        tier: staff_tier,
        source_channel: 'admin',
        pathname:
          typeof window !== 'undefined' ? window.location.pathname : null,
        support_mode: null,
        mounted_at: mounted_at_ref.current,
        dependency_values: JSON.stringify({
          room_uuid,
          staff_participant_uuid,
          staff_user_uuid,
          staff_tier,
        }),
        reason: 'component_unmount',
        phase: 'admin_chat_detail_lifecycle',
      })
    }
  }, [room_uuid, staff_participant_uuid, staff_tier, staff_user_uuid])

  useEffect(() => {
    if (!room_uuid || !staff_participant_uuid) {
      return
    }

    send_chat_realtime_debug({
      event: 'admin_chat_room_ready',
      room_uuid,
      selected_room_uuid: room_uuid,
      active_room_uuid: room_uuid,
      previous_room_uuid: null,
      next_room_uuid: room_uuid,
      participant_uuid: staff_participant_uuid,
      admin_user_uuid: staff_user_uuid,
      user_uuid: staff_user_uuid,
      role: 'admin',
      tier: staff_tier,
      source_channel: 'admin',
      pathname:
        typeof window !== 'undefined' ? window.location.pathname : null,
      support_mode: null,
      mounted_at: mounted_at_ref.current,
      component_file,
      dependency_values: JSON.stringify({
        room_uuid,
        staff_participant_uuid,
        staff_user_uuid,
        staff_tier,
      }),
      reason: staff_user_uuid ? 'admin_session_resolved' : 'room_resolved',
      phase: 'admin_chat_detail_lifecycle',
    })
  }, [room_uuid, staff_participant_uuid, staff_tier, staff_user_uuid])

  useEffect(() => {
    staff_participant_uuid_ref.current = staff_participant_uuid
    latest_room_uuid_ref.current = room_uuid
    admin_rt_ctx_ref.current = {
      staff_participant_uuid,
      staff_user_uuid,
      staff_tier,
    }
    active_typing_identity_ref.current = {
      user_uuid: staff_user_uuid,
      participant_uuid: staff_participant_uuid,
      role: 'admin',
    }
  }, [room_uuid, staff_participant_uuid, staff_tier, staff_user_uuid])

  const apply_support_action_to_timeline = useCallback(
    (
      action: chat_action_realtime_payload,
      source: 'realtime' | 'enter_api' | 'leave_api',
      inserted_index: number | null = null,
    ) => {
      const locked_room = latest_room_uuid_ref.current

      const focus = (latest_room_uuid_ref.current ?? '').trim()

      if (action.room_uuid.trim() !== focus) {
        send_chat_realtime_debug({
          event: 'support_action_realtime_ignored',
          room_uuid: action.room_uuid,
          active_room_uuid: focus,
          action_uuid: action.action_uuid,
          event_type: action.action_type,
          ignored_reason: 'active_room_mismatch',
          phase: `admin_chat_support_action_${source}`,
        })

        return
      }

      const near_bottom_before = compute_message_list_near_bottom(
        message_list_scroll_ref.current,
      )

      set_rows((previous) => {
        const merged = append_chat_action_to_admin_timeline(previous, action)

        if (!merged.appended) {
          send_chat_realtime_debug({
            event: 'support_action_realtime_ignored',
            room_uuid: locked_room,
            active_room_uuid: locked_room,
            action_uuid: action.action_uuid,
            event_type: action.action_type,
            ignored_reason: 'action_uuid_dedupe',
            phase: `admin_chat_support_action_${source}`,
          })

          return previous
        }

        send_chat_realtime_debug({
          event: 'admin_realtime_client_support_action_merged',
          room_uuid: locked_room,
          active_room_uuid: locked_room,
          action_uuid: action.action_uuid,
          event_type: action.action_type,
          actor_name: action.actor_display_name,
          inserted_index,
          prev_count: previous.length,
          next_count: merged.rows.length,
          phase: `admin_chat_support_action_${source}`,
        })

        return merged.rows
      })

      emit_chat_action_realtime_rendered({
        room_uuid: locked_room,
        active_room_uuid: locked_room,
        action,
        inserted_index: inserted_index ?? 0,
        source_channel: 'admin',
        phase: `admin_chat_support_action_${source}`,
      })

      if (near_bottom_before) {
        bottom_ref.current?.scrollIntoView({
          block: 'end',
          behavior: 'smooth',
        })
      }
    },
    [],
  )

  const run_enter_support_room = useCallback(async () => {
    const locked_room = latest_room_uuid_ref.current
    const participant_uuid = staff_participant_uuid_ref.current
    const ctx = admin_rt_ctx_ref.current
    const pathname =
      typeof window !== 'undefined' ? window.location.pathname : null
    const dependency_values = JSON.stringify({
      room_uuid: locked_room,
      staff_participant_uuid: participant_uuid,
      staff_user_uuid: ctx.staff_user_uuid,
      staff_tier: ctx.staff_tier,
    })

    if (!locked_room || !participant_uuid) {
      send_chat_realtime_debug({
        event: !locked_room
          ? 'admin_chat_useeffect_skipped_no_room'
          : 'admin_chat_useeffect_skipped_no_admin',
        room_uuid: locked_room || null,
        selected_room_uuid: locked_room || null,
        active_room_uuid: locked_room || null,
        participant_uuid: participant_uuid || null,
        admin_participant_uuid: participant_uuid || null,
        admin_user_uuid: ctx.staff_user_uuid,
        user_uuid: ctx.staff_user_uuid,
        role: 'admin',
        tier: ctx.staff_tier,
        source_channel: 'admin',
        pathname,
        support_mode: null,
        skipped_reason: !locked_room ? 'missing_active_room_uuid' : 'missing_admin_participant_uuid',
        dependency_values,
        mounted_at: mounted_at_ref.current,
        phase: 'admin_chat_detail_support_enter',
      })
      return
    }

    const session_key = `${locked_room}|${participant_uuid}`

    if (!ctx.staff_user_uuid) {
      send_chat_realtime_debug({
        event: 'admin_chat_useeffect_skipped_no_admin',
        room_uuid: locked_room,
        selected_room_uuid: locked_room,
        active_room_uuid: locked_room,
        participant_uuid,
        admin_participant_uuid: participant_uuid,
        admin_user_uuid: null,
        user_uuid: null,
        role: 'admin',
        tier: ctx.staff_tier,
        source_channel: 'admin',
        pathname,
        support_mode: null,
        skipped_reason: 'missing_admin_user_uuid',
        dependency_values,
        mounted_at: mounted_at_ref.current,
        phase: 'admin_chat_detail_support_enter',
      })

      return
    }

    if (support_enter_session_ref.current === session_key) {
      send_chat_realtime_debug({
        event: 'admin_chat_useeffect_skipped_already_active',
        room_uuid: locked_room,
        selected_room_uuid: locked_room,
        active_room_uuid: locked_room,
        participant_uuid,
        admin_participant_uuid: participant_uuid,
        admin_user_uuid: ctx.staff_user_uuid,
        user_uuid: ctx.staff_user_uuid,
        role: 'admin',
        tier: ctx.staff_tier,
        source_channel: 'admin',
        pathname,
        support_mode: null,
        skipped_reason: 'same_room_same_admin_already_invoked',
        dependency_values,
        mounted_at: mounted_at_ref.current,
        phase: 'admin_chat_detail_support_enter',
      })

      return
    }

    send_chat_realtime_debug({
      event: 'admin_chat_room_enter_started',
      room_uuid: locked_room,
      selected_room_uuid: locked_room,
      active_room_uuid: locked_room,
      participant_uuid,
      admin_participant_uuid: participant_uuid,
      admin_user_uuid: ctx.staff_user_uuid,
      user_uuid: ctx.staff_user_uuid,
      role: 'admin',
      tier: ctx.staff_tier,
      source_channel: 'admin',
      pathname,
      support_mode: null,
      dependency_values,
      mounted_at: mounted_at_ref.current,
      component_file,
      phase: 'admin_chat_detail_support_enter',
    })

    try {
      const result = await call_enter_support_room(locked_room)

      if (result.ok && result.action) {
        apply_support_action_to_timeline(
          support_room_api_action_to_realtime(result.action),
          'enter_api',
        )
      }

      send_chat_realtime_debug({
        event: result.ok
          ? 'admin_chat_room_enter_succeeded'
          : 'admin_chat_room_enter_failed',
        room_uuid: locked_room,
        selected_room_uuid: locked_room,
        active_room_uuid: locked_room,
        participant_uuid,
        admin_participant_uuid: participant_uuid,
        admin_user_uuid: ctx.staff_user_uuid,
        user_uuid: ctx.staff_user_uuid,
        role: 'admin',
        tier: ctx.staff_tier,
        source_channel: 'admin',
        pathname,
        support_mode: null,
        skip_reason: result.ok && result.skipped ? 'duplicate' : null,
        skipped_reason: result.ok && result.skipped ? 'duplicate' : null,
        error_code: result.ok ? null : result.error,
        error_message: result.ok ? null : result.error,
        dependency_values,
        mounted_at: mounted_at_ref.current,
        component_file,
        phase: 'admin_chat_detail_support_enter',
      })

      if (result.ok) {
        support_enter_session_ref.current = session_key
      }
    } catch (error) {
      send_chat_realtime_debug({
        event: 'admin_chat_room_enter_failed',
        room_uuid: locked_room,
        selected_room_uuid: locked_room,
        active_room_uuid: locked_room,
        participant_uuid,
        admin_participant_uuid: participant_uuid,
        admin_user_uuid: ctx.staff_user_uuid,
        user_uuid: ctx.staff_user_uuid,
        role: 'admin',
        tier: ctx.staff_tier,
        source_channel: 'admin',
        pathname,
        support_mode: null,
        error_code: 'support_enter_call_failed',
        error_message: error instanceof Error ? error.message : String(error),
        dependency_values,
        mounted_at: mounted_at_ref.current,
        component_file,
        phase: 'admin_chat_detail_support_enter',
      })
    }
  }, [apply_support_action_to_timeline])

  useEffect(() => {
    const pathname =
      typeof window !== 'undefined' ? window.location.pathname : null
    const dependency_values = JSON.stringify({
      room_uuid,
      staff_participant_uuid,
      staff_user_uuid,
      staff_tier,
    })

    send_chat_realtime_debug({
      event: 'admin_chat_useeffect_triggered',
      room_uuid,
      selected_room_uuid: room_uuid,
      active_room_uuid: room_uuid,
      participant_uuid: staff_participant_uuid,
      admin_participant_uuid: staff_participant_uuid,
      admin_user_uuid: staff_user_uuid,
      user_uuid: staff_user_uuid,
      role: 'admin',
      tier: staff_tier,
      source_channel: 'admin',
      pathname,
      support_mode: null,
      dependency_values,
      mounted_at: mounted_at_ref.current,
      phase: 'admin_chat_detail_support_lifecycle',
    })

    if (!room_uuid) {
      send_chat_realtime_debug({
        event: 'admin_chat_useeffect_skipped_no_room',
        room_uuid: null,
        selected_room_uuid: null,
        active_room_uuid: null,
        participant_uuid: staff_participant_uuid,
        admin_participant_uuid: staff_participant_uuid,
        admin_user_uuid: staff_user_uuid,
        user_uuid: staff_user_uuid,
        role: 'admin',
        tier: staff_tier,
        source_channel: 'admin',
        pathname,
        support_mode: null,
        skipped_reason: 'missing_active_room_uuid',
        dependency_values,
        mounted_at: mounted_at_ref.current,
        phase: 'admin_chat_detail_support_lifecycle',
      })

      return
    }

    if (!staff_user_uuid || !staff_participant_uuid) {
      send_chat_realtime_debug({
        event: 'admin_chat_useeffect_skipped_no_admin',
        room_uuid,
        selected_room_uuid: room_uuid,
        active_room_uuid: room_uuid,
        participant_uuid: staff_participant_uuid || null,
        admin_participant_uuid: staff_participant_uuid || null,
        admin_user_uuid: staff_user_uuid,
        user_uuid: staff_user_uuid,
        role: 'admin',
        tier: staff_tier,
        source_channel: 'admin',
        pathname,
        support_mode: null,
        skipped_reason: !staff_user_uuid
          ? 'missing_admin_user_uuid'
          : 'missing_admin_participant_uuid',
        dependency_values,
        mounted_at: mounted_at_ref.current,
        phase: 'admin_chat_detail_support_lifecycle',
      })

      return
    }

    void run_enter_support_room()

    return () => {
      const cleanup_pathname =
        typeof window !== 'undefined' ? window.location.pathname : null
      const cleanup_dependency_values = JSON.stringify({
        room_uuid,
        staff_participant_uuid,
        staff_user_uuid,
        staff_tier,
      })

      send_chat_realtime_debug({
        event: 'admin_chat_cleanup_started',
        room_uuid,
        selected_room_uuid: room_uuid,
        active_room_uuid: room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        participant_uuid: staff_participant_uuid,
        admin_participant_uuid: staff_participant_uuid,
        admin_user_uuid: staff_user_uuid,
        user_uuid: staff_user_uuid,
        role: 'admin',
        tier: staff_tier,
        source_channel: 'admin',
        pathname: cleanup_pathname,
        support_mode: null,
        reason: 'component_cleanup',
        dependency_values: cleanup_dependency_values,
        mounted_at: mounted_at_ref.current,
        phase: 'admin_chat_detail_support_lifecycle',
      })

      send_chat_realtime_debug({
        event: 'admin_support_leave_invocation_started',
        room_uuid,
        selected_room_uuid: room_uuid,
        active_room_uuid: room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        participant_uuid: staff_participant_uuid,
        admin_participant_uuid: staff_participant_uuid,
        admin_user_uuid: staff_user_uuid,
        user_uuid: staff_user_uuid,
        role: 'admin',
        tier: staff_tier,
        source_channel: 'admin',
        pathname: cleanup_pathname,
        support_mode: null,
        reason: 'component_cleanup',
        dependency_values: cleanup_dependency_values,
        mounted_at: mounted_at_ref.current,
        phase: 'admin_chat_detail_support_lifecycle',
      })

      void call_leave_support_room({
        room_uuid,
        participant_uuid: staff_participant_uuid,
        leave_reason: 'component_cleanup',
        support_session_key: `${room_uuid}|${staff_participant_uuid}`,
        keepalive: true,
      })
        .then((result) => {
          if (result.ok && result.action) {
            apply_support_action_to_timeline(
              support_room_api_action_to_realtime(result.action),
              'leave_api',
            )
          }

          send_chat_realtime_debug({
            event: result.ok
              ? 'admin_support_leave_invocation_succeeded'
              : 'admin_support_leave_invocation_failed',
            room_uuid,
            selected_room_uuid: room_uuid,
            active_room_uuid: room_uuid,
            previous_room_uuid: room_uuid,
            next_room_uuid: null,
            participant_uuid: staff_participant_uuid,
            admin_participant_uuid: staff_participant_uuid,
            admin_user_uuid: staff_user_uuid,
            user_uuid: staff_user_uuid,
            role: 'admin',
            tier: staff_tier,
            source_channel: 'admin',
            pathname: cleanup_pathname,
            support_mode: null,
            skipped_reason: result.ok && result.skipped ? 'duplicate' : null,
            error_code: result.ok ? null : result.error,
            error_message: result.ok ? null : result.error,
            reason: 'component_cleanup',
            dependency_values: cleanup_dependency_values,
            mounted_at: mounted_at_ref.current,
            phase: 'admin_chat_detail_support_lifecycle',
          })
        })
        .catch((error) => {
          send_chat_realtime_debug({
            event: 'admin_support_leave_invocation_failed',
            room_uuid,
            selected_room_uuid: room_uuid,
            active_room_uuid: room_uuid,
            previous_room_uuid: room_uuid,
            next_room_uuid: null,
            participant_uuid: staff_participant_uuid,
            admin_participant_uuid: staff_participant_uuid,
            admin_user_uuid: staff_user_uuid,
            user_uuid: staff_user_uuid,
            role: 'admin',
            tier: staff_tier,
            source_channel: 'admin',
            pathname: cleanup_pathname,
            support_mode: null,
            error_code: 'support_leave_invocation_failed',
            error_message:
              error instanceof Error ? error.message : String(error),
            reason: 'component_cleanup',
            dependency_values: cleanup_dependency_values,
            mounted_at: mounted_at_ref.current,
            phase: 'admin_chat_detail_support_lifecycle',
          })
        })
    }
  }, [
    apply_support_action_to_timeline,
    room_uuid,
    run_enter_support_room,
    staff_participant_uuid,
    staff_tier,
    staff_user_uuid,
  ])

  use_admin_reception_support_presence({
    room_uuid,
    staff_participant_uuid,
    staff_user_uuid,
    staff_tier,
    enabled: Boolean(staff_participant_uuid.trim()),
    on_support_action: (action) => {
      apply_support_action_to_timeline(action, 'leave_api')
    },
    on_recover_enter: () => {
      void run_enter_support_room()
    },
  })

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      bottom_ref.current?.scrollIntoView({ block: 'end' })
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [rows.length, typing_lines.length])

  const refresh_typing_lines = useCallback(() => {
    const now = new Date()
    const lines: string[] = []
    const staff = staff_participant_uuid_ref.current

    for (const typing of typing_rows_ref.current.values()) {
      if (typing.participant_uuid === staff) {
        continue
      }

      if (
        !chat_typing_is_fresh({
          is_typing: typing.is_typing,
          sent_at: typing.sent_at,
          now,
        })
      ) {
        continue
      }

      if (typing.role === 'user') {
        lines.push('ユーザーが入力中...')
      } else if (typing.role === 'admin' || typing.role === 'concierge') {
        const name = typing.display_name?.trim() || 'Admin'
        lines.push(`${name} が入力中...`)
      }
    }

    set_typing_lines(Array.from(new Set(lines)))
  }, [])

  const schedule_typing_refresh = useCallback(() => {
    if (typing_timer_ref.current !== null) {
      window.clearTimeout(typing_timer_ref.current)
    }

    typing_timer_ref.current = window.setTimeout(() => {
      typing_timer_ref.current = null
      refresh_typing_lines()
    }, 3_100)
  }, [refresh_typing_lines])

  const update_jump_button_visibility = useCallback((visible: boolean) => {
    if (show_jump_button_ref.current === visible) {
      return
    }

    show_jump_button_ref.current = visible
    set_show_jump_button(visible)

    if (visible) {
      send_chat_realtime_debug({
        event: 'chat_scroll_jump_visible',
        room_uuid,
        active_room_uuid: room_uuid,
        participant_uuid: staff_participant_uuid_ref.current,
        user_uuid: admin_rt_ctx_ref.current.staff_user_uuid,
        role: 'admin',
        tier: admin_rt_ctx_ref.current.staff_tier,
        source_channel: 'admin',
        phase: 'admin_chat_scroll',
      })
    }
  }, [room_uuid])

  const handle_message_scroll = useCallback(() => {
    const near_bottom = compute_message_list_near_bottom(
      message_list_scroll_ref.current,
    )

    update_jump_button_visibility(!near_bottom)
  }, [update_jump_button_visibility])

  useEffect(() => {
    if (!room_uuid) {
      return
    }

    const supabase_reused = admin_browser_supabase_ref.current !== null
    let supabase = admin_browser_supabase_ref.current

    if (!supabase) {
      supabase = create_browser_supabase()
      admin_browser_supabase_ref.current = supabase
    }

    if (!supabase) {
      send_chat_realtime_debug({
        event: 'admin_realtime_client_room_ready',
        room_uuid: room_uuid.trim(),
        active_room_uuid: room_uuid.trim(),
        participant_uuid: admin_rt_ctx_ref.current.staff_participant_uuid,
        user_uuid: admin_rt_ctx_ref.current.staff_user_uuid,
        role: 'admin',
        tier: admin_rt_ctx_ref.current.staff_tier,
        source_channel: 'admin',
        skipped_reason: 'create_browser_supabase_returned_null',
        phase: 'admin_realtime_client_guard',
        dependency_values: JSON.stringify({
          supabase_client_resolved: false,
          supabase_singleton_reused_before_attempt: supabase_reused,
        }),
      })

      return
    }

    const locked_room = room_uuid
    const active_room_focus = locked_room.trim()
    const ctx = admin_rt_ctx_ref.current
    const messages_already_subscribed =
      subscribed_room_uuid_ref.current === active_room_focus &&
      Boolean(realtime_channel_ref.current)
    const actions_already_subscribed =
      subscribed_chat_actions_room_ref.current === active_room_focus &&
      Boolean(chat_actions_channel_ref.current)

    send_chat_realtime_debug({
      event: 'admin_realtime_client_room_ready',
      room_uuid: active_room_focus,
      active_room_uuid: active_room_focus,
      participant_uuid: ctx.staff_participant_uuid,
      user_uuid: ctx.staff_user_uuid,
      role: 'admin',
      tier: ctx.staff_tier,
      source_channel: 'admin',
      filter: `room_uuid=eq.${active_room_focus}`,
      phase: 'admin_realtime_client_guard',
      dependency_values: JSON.stringify({
        supabase_client_resolved: true,
        supabase_singleton_reused: supabase_reused,
        messages_postgres_filter: `room_uuid=eq.${active_room_focus}`,
        realtime_channel_topic: `admin_active_chat:${active_room_focus}`,
        messages_already_subscribed,
        actions_already_subscribed,
      }),
    })

    if (!messages_already_subscribed) {
      send_chat_realtime_debug({
        event: 'chat_realtime_client_created',
        room_uuid: active_room_focus,
        active_room_uuid: active_room_focus,
        participant_uuid: ctx.staff_participant_uuid,
        user_uuid: ctx.staff_user_uuid,
        role: 'admin',
        tier: ctx.staff_tier,
        source_channel: 'admin',
        channel_name: chat_room_realtime_channel_name(active_room_focus),
        phase: 'admin_chat_create_browser_supabase',
      })
    }

    let channel = realtime_channel_ref.current

    if (!messages_already_subscribed) {
      channel = subscribe_chat_room_realtime({
        supabase,
        room_uuid: active_room_focus,
        active_room_uuid: active_room_focus,
        participant_uuid: ctx.staff_participant_uuid,
        user_uuid: ctx.staff_user_uuid,
        role: 'admin',
        tier: ctx.staff_tier,
        source_channel: 'admin',
        listener_scope: 'admin_active',
        active_typing_identity_ref,
        on_subscribe_status: ({ status, error_message }) => {
          const dbg_rt = admin_rt_ctx_ref.current

          send_chat_realtime_debug({
            event: 'admin_realtime_client_subscribe_status',
            room_uuid: active_room_focus,
            active_room_uuid: active_room_focus,
            participant_uuid: dbg_rt.staff_participant_uuid,
            user_uuid: dbg_rt.staff_user_uuid,
            role: 'admin',
            tier: dbg_rt.staff_tier,
            source_channel: 'admin',
            channel_name: chat_room_realtime_channel_name(active_room_focus),
            subscribe_status: status,
            error_message,
            message_uuid: null,
            payload_room_uuid: null,
            channel: null,
            direction: null,
            ignored_reason: null,
            prev_message_count: null,
            next_message_count: null,
            phase: 'admin_chat_realtime_subscribe',
          })
        },
        on_message: (archived) => {
          if (!archived) {
            return
          }

          const dbg_ctx = admin_rt_ctx_ref.current
          const ch_name = chat_room_realtime_channel_name(active_room_focus)
          const payload_room_uuid = (archived.room_uuid ?? '').trim()
          const message_sc_raw = archived.body_source_channel
          const message_ch_raw = archived.insert_row_channel
          const message_sc =
            typeof message_sc_raw === 'string' && message_sc_raw.trim()
              ? message_sc_raw.trim().toLowerCase()
              : null
          const message_ch =
            typeof message_ch_raw === 'string' && message_ch_raw.trim()
              ? message_ch_raw.trim().toLowerCase()
              : null
          const source_channel = message_sc ?? message_ch ?? 'web'
          const channel = message_ch ?? message_sc ?? 'web'
          const dir_raw = archived.body_direction
          const direction =
            typeof dir_raw === 'string' && dir_raw.trim()
              ? dir_raw.trim().toLowerCase()
              : null

          const msg_debug_base = {
            room_uuid: active_room_focus,
            active_room_uuid: active_room_focus,
            participant_uuid: dbg_ctx.staff_participant_uuid,
            user_uuid: dbg_ctx.staff_user_uuid,
            role: 'admin' as const,
            tier: dbg_ctx.staff_tier,
            source_channel,
            channel,
            direction,
            channel_name: ch_name,
            payload_room_uuid,
            message_uuid: archived.archive_uuid,
            ignored_reason: null as string | null,
            prev_message_count: null as number | null,
            next_message_count: null as number | null,
            phase: 'admin_chat_message_append',
          }

          send_chat_realtime_debug({
            event: 'admin_realtime_client_payload_received',
            ...msg_debug_base,
          })

          if (payload_room_uuid !== active_room_focus) {
            send_chat_realtime_debug({
              event: 'admin_realtime_client_payload_ignored',
              ...msg_debug_base,
              ignored_reason: 'payload_room_uuid_mismatch',
            })

            return
          }

          const mapped = archived_message_to_timeline_message({
            archive_uuid: archived.archive_uuid,
            room_uuid: archived.room_uuid,
            sequence: archived.sequence,
            created_at: archived.created_at,
            bundle: archived.bundle,
          })

          send_chat_realtime_debug({
            event: 'admin_realtime_client_payload_accepted',
            ...msg_debug_base,
            message_uuid: mapped.message_uuid,
          })

          const row_rt_debug = {
            message_channel: archived.insert_row_channel ?? null,
            message_source_channel: archived.body_source_channel ?? null,
            message_direction:
              archived.body_direction ?? mapped.direction ?? null,
            payload_channel: archived.insert_row_channel ?? null,
            payload_source_channel: archived.body_source_channel ?? null,
            payload_direction:
              archived.body_direction ?? mapped.direction ?? null,
            sender_participant_uuid: archived.sender_participant_uuid ?? null,
          }

          const near_bottom_before = compute_message_list_near_bottom(
            message_list_scroll_ref.current,
          )

          send_chat_realtime_debug({
            event: 'admin_realtime_client_state_append_started',
            ...msg_debug_base,
            message_uuid: mapped.message_uuid,
          })

          let update_result = {
            prev_message_count: 0,
            next_message_count: 0,
            dedupe_hit: false,
          }

          let append_error: string | null = null

          set_rows((previous) => {
            try {
              const dbg = admin_rt_ctx_ref.current
              const ch = chat_room_realtime_channel_name(active_room_focus)

              send_chat_realtime_debug({
                event: 'realtime_message_merge_started',
                room_uuid: active_room_focus,
                active_room_uuid: active_room_focus,
                participant_uuid: dbg.staff_participant_uuid,
                user_uuid: dbg.staff_user_uuid,
                role: 'admin',
                tier: dbg.staff_tier,
                source_channel: 'admin',
                channel_name: ch,
                phase: 'admin_chat_timeline_merge',
                message_count_before: previous.length,
                message_count_after: null,
                oldest_created_at: null,
                newest_created_at: null,
                realtime_message_uuid: mapped.message_uuid,
                realtime_created_at: mapped.created_at,
              })

              send_chat_realtime_debug({
                event: 'chat_messages_normalize_started',
                room_uuid: active_room_focus,
                active_room_uuid: active_room_focus,
                participant_uuid: dbg.staff_participant_uuid,
                user_uuid: dbg.staff_user_uuid,
                role: 'admin',
                tier: dbg.staff_tier,
                source_channel: 'admin',
                channel_name: ch,
                phase: 'admin_chat_timeline_merge',
                message_count_before: previous.length + 1,
                message_count_after: null,
                oldest_created_at: null,
                newest_created_at: null,
                realtime_message_uuid: mapped.message_uuid,
                realtime_created_at: mapped.created_at,
              })

              const result = merge_timeline_rows(previous, [mapped])

              send_chat_realtime_debug({
                event: 'chat_messages_sorted',
                room_uuid: active_room_focus,
                active_room_uuid: active_room_focus,
                participant_uuid: dbg.staff_participant_uuid,
                user_uuid: dbg.staff_user_uuid,
                role: 'admin',
                tier: dbg.staff_tier,
                source_channel: 'admin',
                channel_name: ch,
                phase: 'admin_chat_timeline_merge',
                message_count_before: result.combined_len_before_normalize,
                message_count_after: result.next_message_count,
                oldest_created_at: result.oldest_created_at,
                newest_created_at: result.newest_created_at,
                realtime_message_uuid: mapped.message_uuid,
                realtime_created_at: mapped.created_at,
              })

              send_chat_realtime_debug({
                event: 'realtime_message_merge_succeeded',
                room_uuid: active_room_focus,
                active_room_uuid: active_room_focus,
                participant_uuid: dbg.staff_participant_uuid,
                user_uuid: dbg.staff_user_uuid,
                role: 'admin',
                tier: dbg.staff_tier,
                source_channel: 'admin',
                channel_name: ch,
                phase: 'admin_chat_timeline_merge',
                message_count_before: result.combined_len_before_normalize,
                message_count_after: result.next_message_count,
                oldest_created_at: result.oldest_created_at,
                newest_created_at: result.newest_created_at,
                realtime_message_uuid: mapped.message_uuid,
                realtime_created_at: mapped.created_at,
              })

              update_result = {
                prev_message_count: result.prev_message_count,
                next_message_count: result.next_message_count,
                dedupe_hit: result.dedupe_hit,
              }

              return result.rows
            } catch (error) {
              append_error =
                error instanceof Error ? error.message : String(error)
              update_result = {
                prev_message_count: previous.length,
                next_message_count: previous.length,
                dedupe_hit: false,
              }

              return previous
            }
          })

          if (append_error) {
            const dbg = admin_rt_ctx_ref.current

            send_chat_realtime_debug({
              event: 'admin_realtime_client_state_append_failed',
              room_uuid: active_room_focus,
              active_room_uuid: active_room_focus,
              participant_uuid: dbg.staff_participant_uuid,
              user_uuid: dbg.staff_user_uuid,
              role: 'admin',
              tier: dbg.staff_tier,
              source_channel,
              channel,
              direction,
              channel_name: ch_name,
              message_uuid: mapped.message_uuid,
              payload_room_uuid,
              ...row_rt_debug,
              error_message: append_error,
              ignored_reason: null,
              prev_message_count: update_result.prev_message_count,
              next_message_count: update_result.next_message_count,
              phase: 'admin_chat_message_append',
            })

            return
          }

          send_chat_realtime_debug({
            event: 'admin_realtime_client_state_append_succeeded',
            room_uuid: active_room_focus,
            active_room_uuid: active_room_focus,
            participant_uuid: dbg_ctx.staff_participant_uuid,
            user_uuid: dbg_ctx.staff_user_uuid,
            role: 'admin',
            tier: dbg_ctx.staff_tier,
            source_channel,
            channel,
            direction,
            channel_name: ch_name,
            message_uuid: mapped.message_uuid,
            payload_room_uuid,
            ...row_rt_debug,
            prev_message_count: update_result.prev_message_count,
            next_message_count: update_result.next_message_count,
            ignored_reason: update_result.dedupe_hit
              ? 'message_uuid_dedupe'
              : null,
            dedupe_hit: update_result.dedupe_hit,
            phase: 'admin_chat_message_append',
          })

          if (update_result.dedupe_hit) {
            return
          }

          const dbg = admin_rt_ctx_ref.current

          handle_chat_message_toast({
            room_uuid: archived.room_uuid,
            active_room_uuid: active_room_focus,
            message_uuid: archived.archive_uuid,
            sender_user_uuid: archived.sender_user_uuid ?? null,
            sender_participant_uuid: archived.sender_participant_uuid ?? null,
            sender_role: archived.sender_role ?? archived.bundle.sender ?? null,
            active_user_uuid: dbg.staff_user_uuid,
            active_participant_uuid: dbg.staff_participant_uuid,
            active_role: 'admin',
            role: 'admin',
            tier: dbg.staff_tier,
            source_channel: 'admin',
            target_path: `/admin/reception/${archived.room_uuid}`,
            phase: 'admin_chat_detail_realtime_message',
            is_scrolled_to_bottom: near_bottom_before,
            subtitle: resolve_realtime_message_subtitle_for_toast(
              archived,
              room_display_title_ref.current,
            ),
            scroll_to_bottom: () => {
              bottom_ref.current?.scrollIntoView({
                block: 'end',
                behavior: 'smooth',
              })
            },
          })

          send_chat_realtime_debug({
            event: 'chat_realtime_message_state_updated',
            room_uuid: active_room_focus,
            active_room_uuid: active_room_focus,
            participant_uuid: dbg.staff_participant_uuid,
            user_uuid: dbg.staff_user_uuid,
            role: 'admin',
            tier: dbg.staff_tier,
            source_channel: 'admin',
            channel_name: ch_name,
            event_name: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `room_uuid=eq.${active_room_focus}`,
            payload_room_uuid: archived.room_uuid,
            payload_message_uuid: archived.archive_uuid,
            prev_message_count: update_result.prev_message_count,
            next_message_count: update_result.next_message_count,
            dedupe_hit: update_result.dedupe_hit,
            ignored_reason: null,
            phase: 'admin_chat_realtime_state_update',
          })
        },
        on_typing: (typing) => {
          typing_rows_ref.current.set(typing.participant_uuid, typing)
          refresh_typing_lines()
          schedule_typing_refresh()

          const dbg = admin_rt_ctx_ref.current

          send_chat_realtime_debug({
            event: 'chat_typing_state_updated',
            room_uuid: active_room_focus,
            active_room_uuid: active_room_focus,
            participant_uuid: dbg.staff_participant_uuid,
            user_uuid: dbg.staff_user_uuid,
            role: 'admin',
            tier: dbg.staff_tier,
            source_channel: 'admin',
            channel_name: chat_room_realtime_channel_name(active_room_focus),
            event_name: 'typing',
            payload_room_uuid: typing.room_uuid,
            sender_user_uuid: typing.user_uuid ?? null,
            sender_participant_uuid: typing.participant_uuid,
            active_participant_uuid: dbg.staff_participant_uuid,
            sender_role: typing.role,
            display_name: typing.display_name ?? null,
            is_typing: typing.is_typing,
            phase: 'admin_chat_typing_state_update',
          })
        },
      })

      subscribed_room_uuid_ref.current = active_room_focus
      realtime_channel_ref.current = channel
    } else {
      send_chat_realtime_debug({
        event: 'chat_realtime_subscribe_skipped',
        room_uuid,
        active_room_uuid: room_uuid,
        participant_uuid: ctx.staff_participant_uuid,
        user_uuid: ctx.staff_user_uuid,
        role: 'admin',
        tier: ctx.staff_tier,
        source_channel: 'admin',
        channel_name: chat_room_realtime_channel_name(room_uuid),
        cleanup_reason: 'duplicate_messages_subscribe',
        phase: 'admin_chat_realtime_guard',
      })
    }

    let actions_channel = chat_actions_channel_ref.current

    if (!actions_already_subscribed) {
      support_enter_session_ref.current = null

      actions_channel = subscribe_chat_actions_realtime({
        supabase,
        room_uuid: active_room_focus,
        scope: 'admin_active',
        source_channel: 'admin',
        on_subscribed: () => {
          const session_key = `${active_room_focus}|${staff_participant_uuid_ref.current}`

          if (support_enter_session_ref.current === session_key) {
            return
          }

          void run_enter_support_room()
        },
        on_action: (action: chat_action_realtime_payload, inserted_index) => {
          apply_support_action_to_timeline(action, 'realtime', inserted_index)
        },
      })

      subscribed_chat_actions_room_ref.current = active_room_focus
      chat_actions_channel_ref.current = actions_channel
    } else if (
      support_enter_session_ref.current !==
      `${active_room_focus}|${staff_participant_uuid_ref.current}`
    ) {
      void run_enter_support_room()
    }

    const typing_channel = supabase.channel(
      chat_room_realtime_channel_name(active_room_focus),
      { config: { broadcast: { self: true } } },
    )

    typing_channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const raw = payload.payload

        if (!raw || typeof raw !== 'object') {
          return
        }

        const row = raw as chat_typing_payload

        if ((row.room_uuid ?? '').trim() !== active_room_focus) {
          return
        }

        typing_rows_ref.current.set(row.participant_uuid, row)
        refresh_typing_lines()
        schedule_typing_refresh()
      })
      .subscribe()

    typing_broadcast_channel_ref.current = typing_channel

    return () => {
      const cleanup_reason =
        (latest_room_uuid_ref.current ?? '').trim() !== active_room_focus
          ? 'room_uuid_changed'
          : 'unmount'
      const dbg = admin_rt_ctx_ref.current

      void supabase.removeChannel(typing_channel)

      if (typing_broadcast_channel_ref.current === typing_channel) {
        typing_broadcast_channel_ref.current = null
      }

      if (channel) {
        cleanup_chat_room_realtime({
          supabase,
          channel,
          room_uuid: active_room_focus,
          active_room_uuid: active_room_focus,
          participant_uuid: dbg.staff_participant_uuid,
          user_uuid: dbg.staff_user_uuid,
          role: 'admin',
          tier: dbg.staff_tier,
          source_channel: 'admin',
          cleanup_reason,
        })
      }

      if (actions_channel) {
        cleanup_chat_actions_realtime({
          supabase,
          channel: actions_channel,
          room_uuid: active_room_focus,
          scope: 'admin_active',
          cleanup_reason,
        })
      }

      if (subscribed_room_uuid_ref.current === active_room_focus) {
        subscribed_room_uuid_ref.current = null
      }

      if (subscribed_chat_actions_room_ref.current === active_room_focus) {
        subscribed_chat_actions_room_ref.current = null
        support_enter_session_ref.current = null
      }

      if (realtime_channel_ref.current === channel) {
        realtime_channel_ref.current = null
      }

      if (chat_actions_channel_ref.current === actions_channel) {
        chat_actions_channel_ref.current = null
      }
    }
  }, [
    apply_support_action_to_timeline,
    room_uuid,
    run_enter_support_room,
  ])

  const post_typing_presence = useCallback(
    (action: 'typing_start' | 'typing_stop') => {
      if (!room_uuid || !staff_participant_uuid) {
        return
      }

      if (action === 'typing_stop' && !typing_active_ref.current) {
        return
      }

      const channel =
        typing_broadcast_channel_ref.current ?? realtime_channel_ref.current
      const is_heartbeat = action === 'typing_start' && typing_active_ref.current

      if (action === 'typing_start') {
        typing_active_ref.current = true
      } else {
        typing_active_ref.current = false
      }

      sync_chat_typing_presence({
        room_uuid,
        participant_uuid: staff_participant_uuid,
        is_typing: action === 'typing_start',
        source_channel: 'admin',
        typing_phase:
          action === 'typing_start'
            ? is_heartbeat
              ? 'heartbeat'
              : 'start'
            : undefined,
      })

      if (
        channel &&
        (action === 'typing_stop' || (action === 'typing_start' && !is_heartbeat))
      ) {
        publish_chat_typing({
          channel,
          room_uuid,
          active_room_uuid: room_uuid,
          participant_uuid: staff_participant_uuid,
          user_uuid: staff_user_uuid,
          role: 'admin',
          tier: staff_tier,
          display_name: staff_display_name,
          is_typing: action === 'typing_start',
          source_channel: 'admin',
        })
      }
    },
    [room_uuid, staff_display_name, staff_participant_uuid, staff_tier, staff_user_uuid],
  )

  useEffect(() => {
    return () => {
      if (typing_timer_ref.current !== null) {
        window.clearTimeout(typing_timer_ref.current)
      }

      if (publish_typing_timer_ref.current !== null) {
        window.clearTimeout(publish_typing_timer_ref.current)
      }

      post_typing_presence('typing_stop')
    }
  }, [post_typing_presence])

  function schedule_publish_typing_stop() {
    if (publish_typing_timer_ref.current !== null) {
      window.clearTimeout(publish_typing_timer_ref.current)
    }

    publish_typing_timer_ref.current = window.setTimeout(() => {
      publish_typing_timer_ref.current = null
      post_typing_presence('typing_stop')
    }, 5_000)
  }

  async function submit_reply(raw_text: string) {
    const text = raw_text.trim()

    if (!text || is_sending || !room_uuid) {
      return
    }

    post_typing_presence('typing_stop')
    set_is_sending(true)

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          source: 'admin_reception',
          room_uuid,
          text,
          locale: 'ja',
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            ok: true
            kind: string
            messages?: Array<{
              archive_uuid: string
              room_uuid: string
              sequence: number
              created_at: string
              bundle: message_bundle_payload
            }>
          }
        | { ok: false; error?: string }
        | null

      if (!response.ok || !payload || payload.ok !== true) {
        return
      }

      const returned = payload.messages ?? []

      if (returned.length === 0) {
        return
      }

      const mapped = returned.map(archived_payload_to_reception_message)

      set_rows((previous) => merge_timeline_rows(previous, mapped).rows)
      set_reply_text('')
    } catch (error) {
      console.error('[admin_reception] submit_reply_failed', error)
    } finally {
      set_is_sending(false)
    }
  }

  function handle_submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit_reply(reply_text)
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-debug-component="components/admin/c.tsx"
    >
      <AdminRenderProbe file_path="components/admin/c.tsx" />
      <div className="relative min-h-0 w-full flex-1">
        <div
          ref={message_list_scroll_ref}
          onScroll={handle_message_scroll}
          className="h-full min-h-0 w-full overflow-y-auto overscroll-contain px-6 pb-24 pt-3"
        >
        {load_failed ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm font-medium text-neutral-500">
            メッセージを読み込めませんでした
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm font-medium text-neutral-500">
            メッセージはまだありません
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((message) => {
              if (message.bundle_type === 'room_action_log') {
                return (
                  <li
                    key={message.message_uuid}
                    className="flex justify-center px-2"
                  >
                    <div className="max-w-[92%] rounded-full bg-neutral-100 px-4 py-1.5 text-center text-[11px] font-medium text-neutral-600">
                      {message.text}
                    </div>
                  </li>
                )
              }

              const is_outgoing = is_outgoing_message(message)
              const timestamp = format_time(message.created_at)

              return (
                <li
                  key={message.message_uuid}
                  className={`flex ${is_outgoing ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                      is_outgoing
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-black'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">
                      {message.text}
                    </div>
                    <div
                      className={`mt-1 text-[10px] font-medium ${
                        is_outgoing ? 'text-neutral-300' : 'text-neutral-400'
                      }`}
                    >
                      {message.role ?? message.sender ?? 'message'}
                      {timestamp ? ` - ${timestamp}` : ''}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
        {typing_lines.length > 0 ? (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-[12px] font-medium text-neutral-600">
            {typing_lines.join(' / ')}
          </div>
        ) : null}
          <div ref={bottom_ref} className="h-1" aria-hidden="true" />
        </div>
        {show_jump_button ? (
          <button
            type="button"
            aria-label="最新メッセージへ移動"
            onClick={() => {
              send_chat_realtime_debug({
                event: 'chat_scroll_jump_clicked',
                room_uuid,
                active_room_uuid: room_uuid,
                participant_uuid: staff_participant_uuid_ref.current,
                user_uuid: admin_rt_ctx_ref.current.staff_user_uuid,
                role: 'admin',
                tier: admin_rt_ctx_ref.current.staff_tier,
                source_channel: 'admin',
                phase: 'admin_chat_scroll',
              })
              bottom_ref.current?.scrollIntoView({
                block: 'end',
                behavior: 'smooth',
              })
              update_jump_button_visibility(false)
            }}
            className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-[18px] font-semibold leading-none text-neutral-700 shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <ArrowDown className="h-5 w-5" strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-neutral-200 bg-white pb-[max(8px,env(safe-area-inset-bottom,0px))] pt-2">
        <form
          className="flex items-center gap-3 px-4 pb-2"
          onSubmit={handle_submit}
        >
          <input
            type="text"
            name="admin_reception_reply"
            value={reply_text}
            onChange={(event) => {
              const value = event.target.value
              set_reply_text(value)

              if (value.trim().length > 0) {
                post_typing_presence('typing_start')
                schedule_publish_typing_stop()
              } else {
                post_typing_presence('typing_stop')
              }
            }}
            autoComplete="off"
            enterKeyHint="send"
            placeholder="返信を入力"
            disabled={is_sending}
            className="h-12 min-w-0 flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400 focus-visible:border-neutral-400 disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="send"
            disabled={is_sending || reply_text.trim().length === 0}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3ebe2] shadow-[0_2px_8px_rgba(42,29,24,0.06)] disabled:opacity-60"
          >
            <div className="h-[22px] w-[22px]">
              <PawIcon className="text-[#9b6b4b]" />
            </div>
          </button>
        </form>
      </footer>
    </div>
  )
}
