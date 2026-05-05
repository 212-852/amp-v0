'use client'

import liff from '@line/liff'
import { useEffect, useState } from 'react'

import Loading from '@/components/shared/loading'

function should_skip_path(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/driver') ||
    pathname.startsWith('/api')
  )
}

function should_run_liff_bootstrap(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const ua = navigator.userAgent.toLowerCase()

  return ua.includes('line/') || window.location.href.includes('liff.line.me')
}

async function read_liff_id_token(): Promise<string | null> {
  const raw = liff.getIDToken()

  if (typeof raw === 'string') {
    return raw.length > 0 ? raw : null
  }

  if (
    raw !== null &&
    raw !== undefined &&
    typeof (raw as Promise<string | null>).then === 'function'
  ) {
    try {
      const resolved = await (raw as Promise<string | null>)

      return typeof resolved === 'string' && resolved.length > 0
        ? resolved
        : null
    } catch {
      return null
    }
  }

  return null
}

export default function LiffBootstrap() {
  const [is_loading, set_is_loading] = useState(false)
  const [liff_error, set_liff_error] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (should_skip_path(window.location.pathname)) {
      return
    }

    if (!should_run_liff_bootstrap()) {
      return
    }

    set_is_loading(true)
    set_liff_error(null)

    const liff_id = process.env.NEXT_PUBLIC_LIFF_ID ?? ''

    if (!liff_id) {
      set_is_loading(false)
      set_liff_error('NEXT_PUBLIC_LIFF_ID is not set')

      return
    }

    async function run() {
      try {
        await liff.init({
          liffId: liff_id,
          withLoginOnExternalBrowser: true,
        } as Parameters<typeof liff.init>[0])

        if (!liff.isInClient()) {
          window.location.replace(`https://liff.line.me/${liff_id}`)

          return
        }

        let id_token = await read_liff_id_token()

        if (!id_token) {
          liff.login()

          return
        }

        const global_gate = globalThis as unknown as {
          __amp_liff_id_token_sent?: boolean
        }

        if (global_gate.__amp_liff_id_token_sent) {
          set_is_loading(false)

          return
        }

        global_gate.__amp_liff_id_token_sent = true

        const response = await fetch('/api/auth/line/liff', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id_token }),
        })

        const result = await response.json().catch(() => null)

        console.log('[liff] id_token auth result', result)
        console.log('[liff] auth response status', response.status)

        if (!response.ok) {
          const msg =
            result &&
            typeof result === 'object' &&
            'error' in result &&
            typeof (result as { error?: string }).error === 'string'
              ? (result as { error: string }).error
              : `HTTP ${response.status}`
          set_liff_error(msg)
          console.error('[liff] auth API error', response.status, result)
        } else if (
          result &&
          typeof result === 'object' &&
          'ok' in result &&
          result.ok === true
        ) {
          window.dispatchEvent(new Event('amp_session_changed'))
        }

        set_is_loading(false)
      } catch (error) {
        console.error('[liff] bootstrap failed', error)
        set_liff_error(
          error instanceof Error ? error.message : 'LIFF bootstrap failed',
        )
        set_is_loading(false)
      }
    }

    void run()
  }, [])

  return (
    <>
      {is_loading ? (
        <Loading full_screen text="LOADING..." />
      ) : null}
      {liff_error ? (
        <div
          className="fixed bottom-4 left-1/2 z-[10000] max-w-[90vw] -translate-x-1/2 rounded-md bg-red-900/90 px-3 py-2 text-center text-[11px] text-white shadow-lg"
          role="alert"
        >
          {liff_error}
        </div>
      ) : null}
    </>
  )
}
