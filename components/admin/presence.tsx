'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { usePathname } from 'next/navigation'

import { resolve_client_presence_source_channel } from '@/lib/chat/realtime/support_room_client'

type AdminAppPresenceProps = {
  participant_uuid: string | null
}

type admin_presence_target = {
  active_area: 'admin_app' | 'admin_reception_list' | 'admin_reception_room'
  active_room_uuid: string | null
}

function resolve_admin_presence_target(pathname: string | null): admin_presence_target {
  const path = pathname ?? ''
  const reception_room_match = path.match(
    /^\/admin\/reception\/([0-9a-fA-F-]{36})(?:\/|$)/,
  )

  if (reception_room_match?.[1]) {
    return {
      active_area: 'admin_reception_room',
      active_room_uuid: reception_room_match[1].toLowerCase(),
    }
  }

  if (path === '/admin/reception' || path.startsWith('/admin/reception?')) {
    return {
      active_area: 'admin_reception_list',
      active_room_uuid: null,
    }
  }

  return {
    active_area: 'admin_app',
    active_room_uuid: null,
  }
}

export default function AdminAppPresence(props: AdminAppPresenceProps) {
  const pathname = usePathname()
  const participant_uuid = props.participant_uuid?.trim() || null
  const target = useMemo(
    () => resolve_admin_presence_target(pathname),
    [pathname],
  )
  const target_ref = useRef(target)

  useEffect(() => {
    target_ref.current = target
  }, [target])

  const post_presence = useCallback(
    (visible: boolean, keepalive = false) => {
      const current = target_ref.current

      void fetch('/api/chat/presence', {
        method: 'POST',
        credentials: 'include',
        keepalive,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          participant_uuid,
          active_room_uuid: visible ? current.active_room_uuid : null,
          active_area: current.active_area,
          action: visible ? 'admin_app_visible' : 'admin_app_hidden',
          last_channel: resolve_client_presence_source_channel(),
        }),
      }).catch(() => {})
    },
    [participant_uuid],
  )

  useEffect(() => {
    if (document.visibilityState === 'visible') {
      post_presence(true)
    } else {
      post_presence(false, true)
    }
  }, [participant_uuid, post_presence, target])

  useEffect(() => {
    const send_visible = () => {
      if (document.visibilityState === 'visible') {
        post_presence(true)
      }
    }
    const send_hidden = () => post_presence(false, true)
    const on_visibility_change = () => {
      if (document.visibilityState === 'visible') {
        post_presence(true)
        return
      }

      post_presence(false, true)
    }

    send_visible()

    const heartbeat = window.setInterval(send_visible, 20_000)

    document.addEventListener('visibilitychange', on_visibility_change)
    window.addEventListener('focus', send_visible)
    window.addEventListener('blur', send_hidden)
    window.addEventListener('pagehide', send_hidden)
    window.addEventListener('beforeunload', send_hidden)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', on_visibility_change)
      window.removeEventListener('focus', send_visible)
      window.removeEventListener('blur', send_hidden)
      window.removeEventListener('pagehide', send_hidden)
      window.removeEventListener('beforeunload', send_hidden)
      send_hidden()
    }
  }, [participant_uuid, post_presence])

  return null
}
