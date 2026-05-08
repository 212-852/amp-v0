'use client'

import { MessageCircle, MessageCircleOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const button_class =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-black shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 active:scale-[0.98] sm:h-11 sm:w-11'

const off_button_class =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-400 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 active:scale-[0.98] sm:h-11 sm:w-11'

const toast_text = {
  on: 'チャット受付をONにしました',
  off: 'チャット受付をOFFにしました',
} as const

type availability_response = {
  ok: boolean
  chat_available?: boolean
  error?: string
}

export default function AdminChatAvailabilityButton() {
  const [chat_available, set_chat_available] = useState<boolean | null>(null)
  const [is_pending, set_is_pending] = useState(false)
  const [toast_message, set_toast_message] = useState<string | null>(null)
  const toast_timer_ref = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await fetch('/api/admin/availability', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        })

        if (!response.ok || cancelled) {
          return
        }

        const payload = (await response.json()) as availability_response

        if (cancelled) {
          return
        }

        if (payload.ok && typeof payload.chat_available === 'boolean') {
          set_chat_available(payload.chat_available)
        }
      } catch {
        // Network errors leave the button in its initial unknown state.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (toast_timer_ref.current !== null) {
        window.clearTimeout(toast_timer_ref.current)
      }
    }
  }, [])

  function show_toast(message: string) {
    if (toast_timer_ref.current !== null) {
      window.clearTimeout(toast_timer_ref.current)
    }

    set_toast_message(message)
    toast_timer_ref.current = window.setTimeout(() => {
      set_toast_message(null)
      toast_timer_ref.current = null
    }, 2200)
  }

  async function handle_toggle() {
    if (is_pending) {
      return
    }

    set_is_pending(true)

    try {
      const response = await fetch('/api/admin/availability', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        return
      }

      const payload = (await response.json()) as availability_response

      if (payload.ok && typeof payload.chat_available === 'boolean') {
        set_chat_available(payload.chat_available)
        show_toast(payload.chat_available ? toast_text.on : toast_text.off)
      }
    } finally {
      set_is_pending(false)
    }
  }

  const is_off = chat_available === false
  const is_on = chat_available === true
  const aria_label = is_off
    ? 'Chat (off)'
    : is_on
      ? 'Chat (on)'
      : 'Chat'

  return (
    <div className="relative">
      <button
        type="button"
        className={is_off ? off_button_class : button_class}
        aria-label={aria_label}
        aria-pressed={is_on}
        disabled={is_pending}
        onClick={() => {
          void handle_toggle()
        }}
      >
        {is_off ? (
          <MessageCircleOff className="h-5 w-5" strokeWidth={2} />
        ) : (
          <MessageCircle className="h-5 w-5" strokeWidth={2} />
        )}
        {is_on ? (
          <span
            className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
            aria-hidden
          />
        ) : null}
      </button>

      {toast_message ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute left-1/2 top-full z-[200] mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/85 px-3 py-1.5 text-[12px] font-medium text-white shadow-lg"
        >
          {toast_message}
        </div>
      ) : null}
    </div>
  )
}
