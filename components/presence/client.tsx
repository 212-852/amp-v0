'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { usePathname } from 'next/navigation'

import { detect_source_channel } from '@/lib/channel/detect'
import type { presence_area } from '@/lib/presence/rules'

const presence_heartbeat_ms = 15_000

function resolve_presence_area(pathname: string | null): presence_area {
  const path = pathname ?? ''

  if (path.startsWith('/admin')) {
    return 'admin'
  }

  if (path.startsWith('/driver')) {
    return 'driver'
  }

  if (path.startsWith('/user')) {
    return 'user'
  }

  return 'app'
}

export default function PresenceClient() {
  const pathname = usePathname()
  const area = useMemo(() => resolve_presence_area(pathname), [pathname])
  const area_ref = useRef(area)
  const last_detection_key_ref = useRef<string | null>(null)

  useEffect(() => {
    area_ref.current = area
  }, [area])

  const post_presence = useCallback((input?: { visible?: boolean; keepalive?: boolean }) => {
    const visible =
      typeof input?.visible === 'boolean'
        ? input.visible
        : document.visibilityState === 'visible'
    const detection = detect_source_channel()
    const detection_key = [
      detection.detected_channel,
      detection.is_liff ? 'liff' : 'not_liff',
      detection.is_pwa ? 'pwa' : 'not_pwa',
      detection.display_mode ?? 'unknown',
      detection.navigator_standalone ? 'standalone' : 'not_standalone',
      detection.has_liff_object ? 'liff_object' : 'no_liff_object',
    ].join('|')
    const should_send_detection = last_detection_key_ref.current !== detection_key

    if (should_send_detection) {
      last_detection_key_ref.current = detection_key
    }

    void fetch('/api/presence', {
      method: 'POST',
      credentials: 'include',
      keepalive: input?.keepalive,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channel: detection.detected_channel,
        area: area_ref.current,
        visible,
        ...(should_send_detection ? { detection } : {}),
      }),
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const post_visible = () => {
      if (document.visibilityState === 'visible') {
        post_presence({ visible: true })
      }
    }

    const post_hidden = () => post_presence({ visible: false, keepalive: true })

    post_presence({
      visible: document.visibilityState === 'visible',
    })

    const heartbeat = window.setInterval(post_visible, presence_heartbeat_ms)

    const on_visibility_change = () => {
      if (document.visibilityState === 'hidden') {
        post_hidden()
        return
      }

      post_presence({ visible: true })
    }

    const on_focus = () => {
      post_presence({ visible: true })
    }

    document.addEventListener('visibilitychange', on_visibility_change)
    window.addEventListener('blur', post_hidden)
    window.addEventListener('pagehide', post_hidden)
    window.addEventListener('focus', on_focus)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', on_visibility_change)
      window.removeEventListener('blur', post_hidden)
      window.removeEventListener('pagehide', post_hidden)
      window.removeEventListener('focus', on_focus)
      post_hidden()
    }
  }, [post_presence])

  return null
}
