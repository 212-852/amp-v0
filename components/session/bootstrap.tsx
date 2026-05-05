'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
    })
      .then(() => {
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
