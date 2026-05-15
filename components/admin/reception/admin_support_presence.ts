'use client'

import { useEffect, useRef } from 'react'

import { send_chat_realtime_debug } from '@/lib/chat/realtime/client'

const heartbeat_interval_ms = 20_000
const visibility_hidden_leave_delay_ms = 10_000

function leave_trigger_debug(input: {
  event: string
  room_uuid: string
  previous_room_uuid: string | null
  next_room_uuid: string | null
  admin_user_uuid: string | null
  admin_participant_uuid: string
  leave_reason: string
}) {
  const pathname =
    typeof window !== 'undefined' ? window.location.pathname : null
  const visibility_state =
    typeof document !== 'undefined' ? document.visibilityState : null

  send_chat_realtime_debug({
    event: input.event,
    phase: 'admin_support_presence',
    room_uuid: input.room_uuid,
    active_room_uuid: input.room_uuid,
    previous_room_uuid: input.previous_room_uuid,
    next_room_uuid: input.next_room_uuid,
    admin_user_uuid: input.admin_user_uuid,
    participant_uuid: input.admin_participant_uuid,
    visibility_state,
    pathname,
    leave_reason: input.leave_reason,
  })
}

function post_admin_support_presence(input: {
  room_uuid: string
  participant_uuid: string
  action: string
  keepalive?: boolean
  leave_reason?: string
  support_session_key?: string
}) {
  void fetch('/api/chat/presence', {
    method: 'POST',
    credentials: 'include',
    keepalive: input.keepalive,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      room_uuid: input.room_uuid,
      participant_uuid: input.participant_uuid,
      action: input.action,
      last_channel: 'admin',
      leave_reason: input.leave_reason,
      previous_active_room_uuid: input.room_uuid,
      next_active_room_uuid: null,
      support_session_key: input.support_session_key,
    }),
  }).catch(() => {})
}

export function use_admin_reception_support_presence(input: {
  room_uuid: string
  staff_participant_uuid: string
  staff_user_uuid: string | null
  staff_tier: string | null
  enabled: boolean
}) {
  const idle_leave_timer_ref = useRef<number | null>(null)
  const was_hidden_ref = useRef(false)
  const support_session_key_ref = useRef<string>('')
  const prev_room_for_change_ref = useRef<string | null>(null)

  useEffect(() => {
    if (
      !input.enabled ||
      !input.room_uuid.trim() ||
      !input.staff_participant_uuid.trim()
    ) {
      return
    }

    const room_uuid = input.room_uuid
    const participant_uuid = input.staff_participant_uuid

    support_session_key_ref.current = `${room_uuid}|${participant_uuid}|${Date.now()}`

    const prev_tracked = prev_room_for_change_ref.current

    if (prev_tracked && prev_tracked !== room_uuid) {
      leave_trigger_debug({
        event: 'admin_leave_room_change_detected',
        room_uuid: prev_tracked,
        previous_room_uuid: prev_tracked,
        next_room_uuid: room_uuid,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'room_change',
      })
    }

    prev_room_for_change_ref.current = room_uuid

    const on_before_unload = () => {
      leave_trigger_debug({
        event: 'admin_leave_beforeunload_detected',
        room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'beforeunload',
      })
    }

    const post = (
      action: string,
      extra?: { leave_reason?: string; keepalive?: boolean },
    ) => {
      post_admin_support_presence({
        room_uuid,
        participant_uuid,
        action,
        keepalive: extra?.keepalive,
        leave_reason: extra?.leave_reason,
        support_session_key: support_session_key_ref.current,
      })
    }

    post('admin_support_join')

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return
      }

      post('admin_support_heartbeat')
      post_admin_support_presence({
        room_uuid,
        participant_uuid,
        action: 'admin_support_timeout_check',
        support_session_key: support_session_key_ref.current,
      })
    }, heartbeat_interval_ms)

    const clear_idle_leave_timer = () => {
      if (idle_leave_timer_ref.current !== null) {
        window.clearTimeout(idle_leave_timer_ref.current)
        idle_leave_timer_ref.current = null
      }
    }

    const on_visibility = () => {
      if (document.visibilityState === 'hidden') {
        was_hidden_ref.current = true
        leave_trigger_debug({
          event: 'admin_leave_visibility_hidden_detected',
          room_uuid,
          previous_room_uuid: room_uuid,
          next_room_uuid: null,
          admin_user_uuid: input.staff_user_uuid,
          admin_participant_uuid: participant_uuid,
          leave_reason: 'visibility_hidden',
        })
        post_admin_support_presence({
          room_uuid,
          participant_uuid,
          action: 'admin_support_idle',
          keepalive: true,
          support_session_key: support_session_key_ref.current,
        })
        clear_idle_leave_timer()
        idle_leave_timer_ref.current = window.setTimeout(() => {
          leave_trigger_debug({
            event: 'admin_leave_visibility_hidden_detected',
            room_uuid,
            previous_room_uuid: room_uuid,
            next_room_uuid: null,
            admin_user_uuid: input.staff_user_uuid,
            admin_participant_uuid: participant_uuid,
            leave_reason: 'visibility_hidden_timeout',
          })
          post_admin_support_presence({
            room_uuid,
            participant_uuid,
            action: 'admin_support_leave',
            keepalive: true,
            leave_reason: 'visibility_hidden_timeout',
            support_session_key: support_session_key_ref.current,
          })
        }, visibility_hidden_leave_delay_ms)
      } else {
        clear_idle_leave_timer()
        if (was_hidden_ref.current) {
          was_hidden_ref.current = false
          void fetch('/api/chat/presence', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              room_uuid,
              participant_uuid,
              action: 'admin_support_recovered',
              last_channel: 'admin',
              support_session_key: support_session_key_ref.current,
            }),
          }).catch(() => {})
        }
        post('admin_support_join')
      }
    }

    const on_pagehide = () => {
      leave_trigger_debug({
        event: 'admin_leave_pagehide_detected',
        room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'pagehide',
      })
      void fetch('/api/chat/presence', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          room_uuid,
          participant_uuid,
          action: 'admin_support_page_unload',
          last_channel: 'admin',
          leave_reason: 'pagehide',
          previous_active_room_uuid: room_uuid,
          next_active_room_uuid: null,
          support_session_key: support_session_key_ref.current,
        }),
      }).catch(() => {})
    }

    window.addEventListener('beforeunload', on_before_unload)
    document.addEventListener('visibilitychange', on_visibility)
    window.addEventListener('pagehide', on_pagehide)

    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener('beforeunload', on_before_unload)
      document.removeEventListener('visibilitychange', on_visibility)
      window.removeEventListener('pagehide', on_pagehide)
      clear_idle_leave_timer()
      leave_trigger_debug({
        event: 'admin_leave_route_change_detected',
        room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'route_change',
      })
      post_admin_support_presence({
        room_uuid,
        participant_uuid,
        action: 'admin_support_leave',
        keepalive: true,
        leave_reason: 'route_change',
        support_session_key: support_session_key_ref.current,
      })
      prev_room_for_change_ref.current = null
    }
  }, [
    input.enabled,
    input.room_uuid,
    input.staff_participant_uuid,
    input.staff_tier,
    input.staff_user_uuid,
  ])
}
