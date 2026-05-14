'use client'

import { useEffect, useRef } from 'react'

import {
  build_pwa_diagnostic_payload,
  post_pwa_debug,
} from '@/lib/pwa/client'
import {
  pending_pwa_line_pass_storage_key,
  poll_pwa_line_link_status_client,
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

    const visitor = sessionStorage
      .getItem(pending_pwa_line_pass_storage_key)
      ?.trim()

    if (!visitor) {
      return
    }

    ran_ref.current = true

    void (async () => {
      post_pwa_debug({
        event: 'pwa_line_link_poll_started',
        phase: 'link_return_probe',
        visitor_uuid: visitor,
        provider: 'line',
        status: 'open',
        ...build_pwa_diagnostic_payload(),
      })

      const outcome = await poll_pwa_line_link_status_client({
        visitor_uuid: visitor,
        max_ms: 60_000,
      })

      sessionStorage.removeItem(pending_pwa_line_pass_storage_key)

      if (outcome.status !== 'completed') {
        post_pwa_debug({
          event: 'pwa_line_link_poll_completed',
          phase: 'link_return_probe',
          visitor_uuid: visitor,
          provider: 'line',
          status: outcome.status,
          ...build_pwa_diagnostic_payload(),
        })

        return
      }

      post_pwa_debug({
        event: 'pwa_line_link_poll_completed',
        phase: 'link_return_probe',
        visitor_uuid: visitor,
        provider: 'line',
        status: 'completed',
        completed_user_uuid: outcome.completed_user_uuid,
        ...build_pwa_diagnostic_payload(),
      })

      post_pwa_debug({
        event: 'pwa_session_refresh_started',
        phase: 'link_return_probe',
        visitor_uuid: visitor,
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
          visitor_uuid: visitor,
          user_uuid: payload?.user_uuid ?? null,
          ...build_pwa_diagnostic_payload(),
        })

        post_pwa_debug({
          event: 'pwa_reload_triggered',
          phase: 'link_return_probe',
          visitor_uuid: visitor,
          ...build_pwa_diagnostic_payload(),
        })

        window.location.reload()
      } catch (error) {
        post_pwa_debug({
          event: 'pwa_session_refresh_failed',
          phase: 'link_return_probe',
          visitor_uuid: visitor,
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
