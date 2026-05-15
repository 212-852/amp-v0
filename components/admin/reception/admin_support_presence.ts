'use client'

import { useEffect, useRef } from 'react'

const heartbeat_interval_ms = 20_000
const visibility_hidden_leave_delay_ms = 10_000

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
        post_admin_support_presence({
          room_uuid,
          participant_uuid,
          action: 'admin_support_idle',
          keepalive: true,
          support_session_key: support_session_key_ref.current,
        })
        clear_idle_leave_timer()
        idle_leave_timer_ref.current = window.setTimeout(() => {
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

    document.addEventListener('visibilitychange', on_visibility)
    window.addEventListener('pagehide', on_pagehide)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', on_visibility)
      window.removeEventListener('pagehide', on_pagehide)
      clear_idle_leave_timer()
      post_admin_support_presence({
        room_uuid,
        participant_uuid,
        action: 'admin_support_leave',
        keepalive: true,
        leave_reason: 'route_change',
        support_session_key: support_session_key_ref.current,
      })
    }
  }, [
    input.enabled,
    input.room_uuid,
    input.staff_participant_uuid,
    input.staff_tier,
    input.staff_user_uuid,
  ])
}
