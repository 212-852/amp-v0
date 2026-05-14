'use client'

import { useEffect, useRef } from 'react'

import {
  build_pwa_diagnostic_payload,
  post_pwa_debug,
} from '@/lib/pwa/client'
import {
  pending_line_link_session_storage_key,
  poll_auth_link_session_client,
} from '@/lib/pwa/link_return_client'
import {
  build_session_restore_headers,
  write_local_visitor_uuid,
} from '@/lib/visitor/client'

export default function PwaLinkReturnProbe() {
  const ran_ref = useRef(false)

  useEffect(() => {
    if (ran_ref.current || typeof window === 'undefined') {
      return
    }

    const uuid = sessionStorage.getItem(pending_line_link_session_storage_key)

    if (!uuid?.trim()) {
      return
    }

    ran_ref.current = true

    void (async () => {
      post_pwa_debug({
        event: 'pwa_link_poll_started',
        phase: 'link_return_probe',
        link_session_uuid: uuid,
        provider: 'line',
        status: 'pending',
        ...build_pwa_diagnostic_payload(),
      })

      const outcome = await poll_auth_link_session_client({
        link_session_uuid: uuid,
        max_ms: 90_000,
      })

      sessionStorage.removeItem(pending_line_link_session_storage_key)

      if (outcome.status !== 'completed') {
        post_pwa_debug({
          event: 'pwa_link_poll_completed',
          phase: 'link_return_probe',
          link_session_uuid: uuid,
          provider: 'line',
          status: outcome.status,
          ...build_pwa_diagnostic_payload(),
        })

        return
      }

      post_pwa_debug({
        event: 'pwa_link_poll_completed',
        phase: 'link_return_probe',
        link_session_uuid: uuid,
        provider: 'line',
        status: 'completed',
        completed_user_uuid: outcome.completed_user_uuid,
        ...build_pwa_diagnostic_payload(),
      })

      post_pwa_debug({
        event: 'pwa_session_refresh_started',
        phase: 'link_return_probe',
        link_session_uuid: uuid,
        ...build_pwa_diagnostic_payload(),
      })

      try {
        const response = await fetch('/api/session', {
          method: 'GET',
          credentials: 'include',
          headers: build_session_restore_headers(),
        })

        const payload = (await response.json().catch(() => null)) as {
          visitor_uuid?: string | null
          user_uuid?: string | null
        } | null

        write_local_visitor_uuid(payload?.visitor_uuid ?? null)

        if (!response.ok) {
          throw new Error(`session_refresh_http_${response.status}`)
        }

        post_pwa_debug({
          event: 'pwa_session_refresh_succeeded',
          phase: 'link_return_probe',
          link_session_uuid: uuid,
          user_uuid: payload?.user_uuid ?? null,
          visitor_uuid: payload?.visitor_uuid ?? null,
          ...build_pwa_diagnostic_payload(),
        })

        post_pwa_debug({
          event: 'pwa_reload_triggered',
          phase: 'link_return_probe',
          link_session_uuid: uuid,
          ...build_pwa_diagnostic_payload(),
        })

        window.location.reload()
      } catch (error) {
        post_pwa_debug({
          event: 'pwa_session_refresh_failed',
          phase: 'link_return_probe',
          link_session_uuid: uuid,
          error_code: 'session_refresh_failed',
          error_message:
            error instanceof Error ? error.message : String(error),
          ...build_pwa_diagnostic_payload(),
        })
      }
    })()
  }, [])

  return null
}
