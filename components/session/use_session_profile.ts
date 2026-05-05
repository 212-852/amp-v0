'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

import type { locale_key } from '@/lib/locale/action'

export type session_profile_snapshot = {
  ok?: boolean
  locale?: locale_key
  role?: 'user' | 'driver' | 'admin' | 'guest'
  tier?: 'guest' | 'member' | 'vip'
  display_name?: string | null
  image_url?: string | null
  line_connected?: boolean
  connected_providers?: Array<'line' | 'google' | 'email'>
  requires_line_auth?: boolean
  line_auth_method?: string | null
  visitor_uuid?: string | null
  source_channel?: 'web' | 'liff' | 'pwa' | 'line'
}

export function use_session_profile() {
  const pathname = usePathname()
  const [session, set_session] = useState<session_profile_snapshot | null>(
    null,
  )

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/session', {
        method: 'GET',
        credentials: 'include',
      })

      if (!response.ok) {
        set_session(null)

        return
      }

      const raw = (await response.json()) as session_profile_snapshot & {
        session?: session_profile_snapshot | null
      }
      const nested = raw.session && typeof raw.session === 'object'
        ? raw.session
        : {}
      const data = { ...raw, ...nested } as session_profile_snapshot

      set_session(data)
    } catch {
      set_session(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [pathname, refresh])

  useEffect(() => {
    function on_focus() {
      void refresh()
    }

    window.addEventListener('focus', on_focus)

    return () => window.removeEventListener('focus', on_focus)
  }, [refresh])

  return { session, refresh }
}
