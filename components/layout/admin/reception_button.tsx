'use client'

import { MessageCircle, MessageCircleOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const button_class =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-black shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 active:scale-[0.98] sm:h-11 sm:w-11'

const off_button_class =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-400 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 active:scale-[0.98] sm:h-11 sm:w-11'

const reception_label = {
  open: 'チャット ON',
  offline: 'チャット OFF',
} as const

type reception_state_value = 'open' | 'offline'

type reception_response = {
  ok: boolean
  admin_user_uuid?: string
  state?: reception_state_value
  error?: string
}

function send_admin_reception_debug(
  event: string,
  payload: Record<string, unknown>,
) {
  void fetch('/api/admin/reception/debug', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event, payload }),
  }).catch(() => {})
}

export default function AdminReceptionButton() {
  const [reception_state, set_reception_state] =
    useState<reception_state_value | null>(null)
  const [admin_uuid, set_admin_uuid] = useState<string | null>(null)
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

        const payload = (await response.json()) as reception_response

        if (cancelled) {
          return
        }

        if (
          payload.ok &&
          (payload.state === 'open' || payload.state === 'offline')
        ) {
          set_reception_state(payload.state)
          set_admin_uuid(payload.admin_user_uuid ?? null)
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

    const next_state: reception_state_value | null =
      reception_state === 'open'
        ? 'offline'
        : reception_state === 'offline'
          ? 'open'
          : null

    send_admin_reception_debug('admin_reception_button_clicked', {
      admin_user_uuid: admin_uuid,
      current_state: reception_state,
      next_state,
    })

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

      const payload = (await response.json()) as reception_response

      if (
        payload.ok &&
        (payload.state === 'open' || payload.state === 'offline')
      ) {
        set_reception_state(payload.state)
        set_admin_uuid(payload.admin_user_uuid ?? admin_uuid)
        show_toast(reception_label[payload.state])
      }
    } finally {
      set_is_pending(false)
    }
  }

  const is_offline = reception_state === 'offline'
  const is_open = reception_state === 'open'
  const aria_label =
    reception_state === null
      ? 'Chat'
      : reception_state === 'open'
        ? reception_label.open
        : reception_label.offline

  return (
    <div className="relative">
      <button
        type="button"
        className={is_offline ? off_button_class : button_class}
        aria-label={aria_label}
        aria-pressed={is_open}
        disabled={is_pending}
        onClick={() => {
          void handle_toggle()
        }}
      >
        {is_offline ? (
          <MessageCircleOff className="h-5 w-5" strokeWidth={2} />
        ) : (
          <MessageCircle className="h-5 w-5" strokeWidth={2} />
        )}
        {is_open ? (
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
