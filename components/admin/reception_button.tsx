'use client'

import { MessageCircle, MessageCircleOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { create_browser_supabase } from '@/lib/db/browser'
import {
  normalize_reception_state,
  type reception_state,
} from '@/lib/admin/reception/rules'

type reception_state_response = {
  ok: boolean
  state?: reception_state
  is_available?: boolean
}

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

function resolve_state_from_payload(
  payload: reception_state_response,
): reception_state | null {
  if (!payload.ok) {
    return null
  }

  const from_state = normalize_reception_state(payload.state)

  if (from_state) {
    return from_state
  }

  if (typeof payload.is_available === 'boolean') {
    return payload.is_available ? 'open' : 'closed'
  }

  return null
}

export function AdminReceptionButton() {
  const [state, set_state] = useState<reception_state | null>(null)
  const [is_pending, set_is_pending] = useState(false)
  const [toast_message, set_toast_message] = useState<string | null>(null)
  const toast_timer_ref = useRef<number | null>(null)

  const apply_state = useCallback((next: reception_state) => {
    set_state(next)
  }, [])

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
        const next_state = resolve_state_from_payload(payload)

        if (!cancelled && next_state) {
          apply_state(next_state)
        }
      } catch {
        // Keep the button in its neutral state.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [apply_state])

  useEffect(() => {
    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const channel = supabase
      .channel('receptions:header_toggle')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receptions',
        },
        (payload) => {
          const row = payload.new as { state?: unknown } | null

          if (!row) {
            return
          }

          const next_state = normalize_reception_state(row.state)

          if (next_state) {
            apply_state(next_state)
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [apply_state])

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
      const next_state = resolve_state_from_payload(payload)

      if (next_state) {
        apply_state(next_state)
        show_toast(reception_label[next_state])
      }
    } finally {
      set_is_pending(false)
    }
  }, [apply_state, is_pending, show_toast])

  const is_open = state === 'open'
  const is_closed = state === 'closed'
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
