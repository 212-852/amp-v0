'use client'

import Loading from '@/components/shared/loading'
import { useEffect, useState } from 'react'

type liff_profile = {
  userId: string
  displayName?: string
  pictureUrl?: string
}

type liff_client = {
  init: (input: { liffId: string }) => Promise<void>
  isLoggedIn: () => boolean
  login: (input?: { redirectUri?: string }) => void
  getProfile: () => Promise<liff_profile>
  getLanguage: () => string
}

declare global {
  interface Window {
    liff?: liff_client
  }
}

function load_liff_sdk() {
  return new Promise<liff_client>((resolve, reject) => {
    if (window.liff) {
      resolve(window.liff)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js'
    script.async = true
    script.onload = () => {
      if (window.liff) {
        resolve(window.liff)
        return
      }

      reject(new Error('LIFF SDK was not loaded'))
    }
    script.onerror = () => reject(new Error('LIFF SDK load failed'))

    document.head.appendChild(script)
  })
}

export default function LiffPage() {
  const [is_loading, set_is_loading] = useState(true)
  const [status, set_status] = useState('loading')

  useEffect(() => {
    let cancelled = false

    async function run_liff_login() {
      set_is_loading(true)

      let deferred_line_login = false

      try {
        const liff_id = process.env.NEXT_PUBLIC_LINE_LIFF_ID

        if (!liff_id) {
          set_status('missing_liff_id')
          return
        }

        const liff = await load_liff_sdk()

        await liff.init({ liffId: liff_id })

        if (!liff.isLoggedIn()) {
          deferred_line_login = true
          liff.login()
          return
        }

        const profile = await liff.getProfile()
        const locale = liff.getLanguage()

        const response = await fetch('/api/auth/liff', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            line_user_id: profile.userId,
            display_name: profile.displayName ?? null,
            image_url: profile.pictureUrl ?? null,
            locale,
          }),
        })

        if (!response.ok) {
          set_status('failed')
          return
        }

        if (!cancelled) {
          window.location.href = '/'
        }
      } catch {
        if (!cancelled) {
          set_status('failed')
        }
      } finally {
        if (!cancelled && !deferred_line_login) {
          set_is_loading(false)
        }
      }
    }

    void run_liff_login()

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
