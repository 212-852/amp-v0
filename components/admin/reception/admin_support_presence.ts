'use client'

import { useEffect, useRef } from 'react'

function post_admin_support_presence(input: {
  room_uuid: string
  participant_uuid: string
  action: string
  keepalive?: boolean
  leave_reason?: string
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

    const post = (action: string) => {
      post_admin_support_presence({ room_uuid, participant_uuid, action })
    }

    post('admin_support_join')

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        post('admin_support_heartbeat')
        post_admin_support_presence({
          room_uuid,
          participant_uuid,
          action: 'admin_support_timeout_check',
        })
      }
    }, 10_000)

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
        })
        clear_idle_leave_timer()
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
          leave_reason: 'page_unload',
          previous_active_room_uuid: room_uuid,
          next_active_room_uuid: null,
        }),
      }).catch(() => {})
    }

    document.addEventListener('visibilitychange', on_visibility)
    window.addEventListener('beforeunload', on_pagehide)
    window.addEventListener('pagehide', on_pagehide)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', on_visibility)
      window.removeEventListener('beforeunload', on_pagehide)
      window.removeEventListener('pagehide', on_pagehide)
      clear_idle_leave_timer()
      post_admin_support_presence({
        room_uuid,
        participant_uuid,
        action: 'admin_support_leave',
        keepalive: true,
        leave_reason: 'route_change',
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
