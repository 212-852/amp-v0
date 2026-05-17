'use client'

import type { Liff } from '@line/liff'
import { useEffect, useState } from 'react'

import { build_liff_redirect_uri } from '@/lib/auth/liff/redirect_uri'
import Loading from '@/components/shared/loading'

async function read_liff_id_token(liff: Liff): Promise<string | null> {
  try {
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
  } catch {
    return null
  }
}

export default function LiffPage() {
  const [is_loading, set_is_loading] = useState(true)
  const [status, set_status] = useState<'loading' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false

    async function run() {
      const liff_id = process.env.NEXT_PUBLIC_LIFF_ID ?? ''

      if (!liff_id) {
        if (!cancelled) {
          set_status('failed')
          set_is_loading(false)
        }

        return
      }

      let skip_loading_off = false

      try {
        const { default: liff } = await import('@line/liff')

        await liff.init({
          liffId: liff_id,
          withLoginOnExternalBrowser: true,
        } as Parameters<Liff['init']>[0])

        const id_token = await read_liff_id_token(liff)

        let response: Response

        if (id_token) {
          response = await fetch('/api/auth/line/liff', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id_token }),
          })
        } else if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: build_liff_redirect_uri() })
          skip_loading_off = true

          return
        } else {
          const profile = await liff.getProfile()

          response = await fetch('/api/auth/line/liff', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              line_user_id: profile.userId,
              display_name: profile.displayName ?? null,
              picture_url: profile.pictureUrl ?? null,
            }),
          })
        }

        if (!response.ok || cancelled) {
          if (!cancelled) {
            set_status('failed')
          }

          return
        }

        const data = (await response.json().catch(() => null)) as {
          ok?: boolean
        } | null

        if (!data?.ok) {
          if (!cancelled) {
            set_status('failed')
          }

          return
        }

        if (!cancelled) {
          window.location.href = '/'
        }
      } catch (error) {
        console.error('[liff] page bootstrap failed', error)

        if (!cancelled) {
          set_status('failed')
        }
      } finally {
        if (!cancelled && !skip_loading_off) {
          set_is_loading(false)
        }
      }
    }

    void run().catch((error) => {
      console.error('[liff] page run rejected', error)
      set_is_loading(false)
      set_status('failed')
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (is_loading) {
    return <Loading full_screen text="LOADING..." />
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[#f6e5cf] px-6 text-center text-[#2a1d18]">
      <p className="text-[15px] font-medium leading-[1.7]">
        {status === 'loading'
          ? 'LINEで確認しています'
          : 'LINE連携を完了できませんでした'}
      </p>
    </div>
  )
}
