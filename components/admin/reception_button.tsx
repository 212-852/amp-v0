'use client'

import { MessageCircle, MessageCircleOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { use_admin_reception } from '@/components/admin/reception/provider'
import type { reception_state } from '@/lib/admin/reception/rules'

const reception_label = {
  open: 'ON',
  closed: 'OFF',
} as const

const base_button_class =
  'relative flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:opacity-60 sm:h-11 sm:px-3.5'

const open_button_class =
  'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_2px_8px_rgba(16,185,129,0.16)] hover:bg-emerald-100 focus-visible:outline-emerald-500'

const closed_button_class =
  'border-neutral-200 bg-neutral-100 text-neutral-500 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:bg-neutral-200 focus-visible:outline-neutral-500'

const idle_button_class =
  'border-neutral-200 bg-white text-neutral-500 shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus-visible:outline-neutral-500'

export function AdminReceptionButton() {
  const { reception_state, is_loading, is_toggling, toggle_reception } =
    use_admin_reception()
  const [toast_message, set_toast_message] = useState<string | null>(null)
  const toast_timer_ref = useRef<number | null>(null)

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
    if (is_toggling) {
      return
    }

    const next_state = await toggle_reception()

    if (next_state) {
      show_toast(reception_label[next_state])
    }
  }, [is_toggling, show_toast, toggle_reception])

  const display_state: reception_state | null = is_loading
    ? null
    : reception_state
  const is_open = display_state === 'open'
  const is_closed = display_state === 'closed'
  const button_class = `${base_button_class} ${
    is_open
      ? open_button_class
      : is_closed
        ? closed_button_class
        : idle_button_class
  }`
  const label = is_open
    ? reception_label.open
    : is_closed
      ? reception_label.closed
      : '...'
  const aria_label =
    display_state === null
      ? 'Reception'
      : `Reception ${reception_label[display_state]}`

  return (
    <div className="relative">
      <button
        type="button"
        className={button_class}
        aria-label={aria_label}
        aria-pressed={is_open}
        disabled={is_toggling || is_loading}
        onClick={() => {
          void toggle()
        }}
      >
        {is_closed ? (
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
