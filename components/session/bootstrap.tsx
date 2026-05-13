'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import {
  build_session_restore_headers,
  write_local_visitor_uuid,
} from '@/lib/visitor/client'

export default function SessionBootstrap({
  enabled,
}: {
  enabled: boolean
}) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false

    fetch('/api/session', {
      method: 'GET',
      credentials: 'include',
      headers: build_session_restore_headers(),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          visitor_uuid?: string | null
        } | null

        write_local_visitor_uuid(payload?.visitor_uuid ?? null)

        if (!cancelled) {
          router.refresh()
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [enabled, router])

  return null
}
