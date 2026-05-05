'use client'

import liff from '@line/liff'
import {
  useEffect,
  useRef,
  useState,
} from 'react'

export default function LiffBootstrap() {
  const started_ref = useRef(false)
  const [is_loading, set_is_loading] = useState(false)

  useEffect(() => {
    if (started_ref.current) {
      return
    }

    started_ref.current = true

    async function run() {
      const liff_id = process.env.NEXT_PUBLIC_LIFF_ID

      if (!liff_id) {
        return
      }

      const href = window.location.href
      const user_agent = navigator.userAgent
      const is_line_browser = user_agent.includes('Line/')
      const is_liff_url = href.includes('liff.line.me')

      if (!is_line_browser && !is_liff_url) {
        return
      }

      set_is_loading(true)

      console.log('[liff] bootstrap started')
      console.log('[liff] liff_id', liff_id)
      console.log('[liff] href', href)
      console.log('[liff] ua', user_agent)

      await liff.init({ liffId: liff_id })

      console.log('[liff] init completed')
      console.log('[liff] isInClient', liff.isInClient())
      console.log('[liff] isLoggedIn', liff.isLoggedIn())

      if (!liff.isInClient() && !liff.isLoggedIn()) {
        console.log('[liff] login started')
        liff.login()
        return
      }

      const profile = await liff.getProfile()

      console.log('[liff] profile resolved', profile)

      const response = await fetch('/api/auth/liff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          line_user_id: profile.userId,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl ?? null,
          status_message: profile.statusMessage ?? null,
          source_channel: 'liff',
        }),
      })

      const result = await response.json()

      console.log('[liff] auth result', result)

      window.dispatchEvent(new Event('amp_session_changed'))
      set_is_loading(false)
    }

    run().catch((error) => {
      console.error('[liff] bootstrap failed', error)
      set_is_loading(false)
    })
  }, [])

  if (!is_loading) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#f6e5cf]">
      <div className="rounded-[28px] bg-white px-6 py-5 text-sm font-semibold text-[#3a2a21] shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        Loading...
      </div>
    </div>
  )
}
