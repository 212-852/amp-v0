'use client'

/* eslint-disable react-hooks/rules-of-hooks */

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

import {
  build_session_restore_headers,
  write_local_visitor_uuid,
} from '@/lib/visitor/client'
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
  user_uuid?: string | null
  room_uuid?: string | null
  participant_uuid?: string | null
  source_channel?: 'web' | 'liff' | 'pwa' | 'line'
  pwa_installed?: boolean
  chat?: {
    room_uuid?: string | null
    participant_uuid?: string | null
    mode?: string | null
    message_count?: number | null
  } | null
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
        headers: build_session_restore_headers(),
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

      write_local_visitor_uuid(data.visitor_uuid ?? null)
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

    function on_session_changed() {
      void refresh()
    }

    window.addEventListener('focus', on_focus)
    window.addEventListener('amp_session_changed', on_session_changed)

    return () => {
      window.removeEventListener('focus', on_focus)
      window.removeEventListener('amp_session_changed', on_session_changed)
    }
  }, [refresh])

  return { session, refresh }
}
