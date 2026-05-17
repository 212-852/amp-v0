'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { usePathname } from 'next/navigation'

type presence_active_area =
  | 'admin_app'
  | 'admin_reception_list'
  | 'admin_reception_room'

type presence_target = {
  active_area: presence_active_area
  active_room_uuid: string | null
}

function resolve_source_channel(): 'web' | 'pwa' | 'liff' {
  const href = window.location.href.toLowerCase()
  const referrer = document.referrer.toLowerCase()
  const is_liff =
    href.includes('liff') ||
    referrer.includes('liff.line.me') ||
    window.location.hostname.includes('liff.line.me')

  if (is_liff) {
    return 'liff'
  }

  const is_standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true

  return is_standalone ? 'pwa' : 'web'
}

function resolve_presence_target(pathname: string | null): presence_target {
  const path = pathname ?? ''
  const room_match = path.match(
    /^\/admin\/reception\/([0-9a-fA-F-]{36})(?:\/|$)/,
  )

  if (room_match?.[1]) {
    return {
      active_area: 'admin_reception_room',
      active_room_uuid: room_match[1].toLowerCase(),
    }
  }

  if (path === '/admin/reception') {
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

export default function PresenceClient() {
  const pathname = usePathname()
  const target = useMemo(() => resolve_presence_target(pathname), [pathname])
  const target_ref = useRef(target)

  useEffect(() => {
    target_ref.current = target
  }, [target])

  const post_presence = useCallback((input?: {
    visibility_state?: DocumentVisibilityState
    keepalive?: boolean
  }) => {
    const current = target_ref.current
    const visibility_state =
      input?.visibility_state ?? document.visibilityState

    void fetch('/api/presence', {
      method: 'POST',
      credentials: 'include',
      keepalive: input?.keepalive,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source_channel: resolve_source_channel(),
        active_area: current.active_area,
        active_room_uuid: current.active_room_uuid,
        visibility_state,
      }),
    }).catch(() => {})
  }, [])

  useEffect(() => {
    post_presence()
  }, [post_presence, target])

  useEffect(() => {
    const post_visible = () => {
      if (document.visibilityState === 'visible') {
        post_presence()
      }
    }
    const post_hidden = () =>
      post_presence({ visibility_state: 'hidden', keepalive: true })
    const on_visibility_change = () =>
      post_presence({ keepalive: document.visibilityState === 'hidden' })

    post_presence()

    const heartbeat = window.setInterval(post_visible, 15_000)

    document.addEventListener('visibilitychange', on_visibility_change)
    window.addEventListener('blur', post_hidden)
    window.addEventListener('pagehide', post_hidden)
    window.addEventListener('beforeunload', post_hidden)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', on_visibility_change)
      window.removeEventListener('blur', post_hidden)
      window.removeEventListener('pagehide', post_hidden)
      window.removeEventListener('beforeunload', post_hidden)
      post_hidden()
    }
  }, [post_presence])

  return null
}
