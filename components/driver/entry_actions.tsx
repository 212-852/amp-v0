'use client'

import { useState } from 'react'

const content = {
  cta_line: 'LINE連携する',
  pending: 'LINEへ移動中...',
  error: 'LINE連携を開始できませんでした。しばらくしてから再度お試しください。',
} as const

export default function DriverEntryActions() {
  const [is_pending, set_is_pending] = useState(false)
  const [error_message, set_error_message] = useState<string | null>(null)

  async function start_line_link() {
    if (is_pending) {
      return
    }

    set_is_pending(true)
    set_error_message(null)

    try {
      const response = await fetch('/api/auth/link/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'line',
          return_path: '/apply',
          source_channel: 'web',
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; auth_url?: string }
        | null

      if (!response.ok || !payload?.ok || !payload.auth_url) {
        set_error_message(content.error)
        return
      }

      window.location.assign(payload.auth_url)
    } catch {
      set_error_message(content.error)
    } finally {
      set_is_pending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="inline-flex h-12 items-center justify-center rounded-full border border-[#06C755] bg-[#06C755] px-6 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
        disabled={is_pending}
        onClick={() => {
          void start_line_link()
        }}
      >
        {is_pending ? content.pending : content.cta_line}
      </button>
      {error_message ? (
        <p className="text-center text-xs font-medium text-red-600">
          {error_message}
        </p>
      ) : null}
    </div>
  )
}
