'use client'

import { useEffect, useRef } from 'react'

function post_admin_support_presence(input: {
  room_uuid: string
  participant_uuid: string
  action: string
}) {
  void fetch('/api/chat/presence', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      room_uuid: input.room_uuid,
      participant_uuid: input.participant_uuid,
      action: input.action,
      last_channel: 'admin',
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
      }
    }, 15_000)

    const clear_idle_leave_timer = () => {
      if (idle_leave_timer_ref.current !== null) {
        window.clearTimeout(idle_leave_timer_ref.current)
        idle_leave_timer_ref.current = null
      }
    }

    const on_visibility = () => {
      if (document.visibilityState === 'hidden') {
        was_hidden_ref.current = true
        post('admin_support_idle')
        clear_idle_leave_timer()
        idle_leave_timer_ref.current = window.setTimeout(() => {
          post('admin_support_leave')
        }, 120_000)
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
          action: 'admin_support_leave',
          last_channel: 'admin',
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
      post('admin_support_leave')
    }
  }, [
    input.enabled,
    input.room_uuid,
    input.staff_participant_uuid,
    input.staff_tier,
    input.staff_user_uuid,
  ])
}
