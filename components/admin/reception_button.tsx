'use client'

import { MessageCircle, MessageCircleOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

type reception_state_value = 'open' | 'offline'

type reception_state_response = {
  ok: boolean
  state?: reception_state_value
}

const reception_label = {
  open: 'ON',
  offline: 'OFF',
} as const

const base_button_class =
  'relative flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:opacity-60 sm:h-11 sm:px-3.5'

const open_button_class =
  'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_2px_8px_rgba(16,185,129,0.16)] hover:bg-emerald-100 focus-visible:outline-emerald-500'

const offline_button_class =
  'border-neutral-200 bg-neutral-100 text-neutral-500 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:bg-neutral-200 focus-visible:outline-neutral-500'

const idle_button_class =
  'border-neutral-200 bg-white text-neutral-500 shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus-visible:outline-neutral-500'

export function AdminReceptionButton() {
  const [state, set_state] = useState<reception_state_value | null>(null)
  const [is_pending, set_is_pending] = useState(false)
  const [toast_message, set_toast_message] = useState<string | null>(null)
  const toast_timer_ref = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await fetch('/api/admin/reception', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        })

        if (!response.ok || cancelled) {
          return
        }

        const payload = (await response.json()) as reception_state_response

        if (
          !cancelled &&
          payload.ok &&
          (payload.state === 'open' || payload.state === 'offline')
        ) {
          set_state(payload.state)
        }
      } catch {
        // Keep the button in its neutral state.
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

  const show_toast = useCallback((message: string) => {
    if (toast_timer_ref.current !== null) {
      window.clearTimeout(toast_timer_ref.current)
    }

    set_toast_message(message)
    toast_timer_ref.current = window.setTimeout(() => {
      set_toast_message(null)
      toast_timer_ref.current = null
    }, 2200)
  }, [])

  const toggle = useCallback(async () => {
    if (is_pending) {
      return
    }

    set_is_pending(true)

    try {
      const response = await fetch('/api/admin/reception', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        return
      }

      const payload = (await response.json()) as reception_state_response

      if (
        payload.ok &&
        (payload.state === 'open' || payload.state === 'offline')
      ) {
        set_state(payload.state)
        show_toast(reception_label[payload.state])
      }
    } finally {
      set_is_pending(false)
    }
  }, [is_pending, show_toast])

  const is_open = state === 'open'
  const is_offline = state === 'offline'
  const button_class = `${base_button_class} ${
    is_open
      ? open_button_class
      : is_offline
        ? offline_button_class
        : idle_button_class
  }`
  const label = is_open
    ? reception_label.open
    : is_offline
      ? reception_label.offline
      : '...'
  const aria_label =
    state === null ? 'Reception' : `Reception ${reception_label[state]}`

  return (
    <div className="relative">
      <button
        type="button"
        className={button_class}
        aria-label={aria_label}
        aria-pressed={is_open}
        disabled={is_pending}
        onClick={() => {
          void toggle()
        }}
      >
        {is_offline ? (
          <MessageCircleOff className="h-4 w-4" strokeWidth={2} />
        ) : (
          <MessageCircle className="h-4 w-4" strokeWidth={2} />
        )}
        <span className="leading-none">{label}</span>
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
