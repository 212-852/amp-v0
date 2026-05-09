'use client'

import Link from 'next/link'
import {
  ArrowRight,
  MessageCircle,
  MessageCircleOff,
  Search,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { reception_card } from '@/lib/admin/reception/rules'

// ============================================================================
// Single admin reception UI
// ----------------------------------------------------------------------------
// Three named exports share one source of truth here. UI rule reminders:
//   - Reads/writes through /api/admin/reception only.
//   - Never imports lib/admin/reception/action.ts (server-only).
//   - Never queries DB tables (visitors/users/messages) directly.
//   - Never owns business logic; just renders normalized cards from the API.
// ============================================================================

type reception_state_value = 'open' | 'offline'

type reception_state_response = {
  ok: boolean
  state?: reception_state_value
}

type reception_rooms_response = {
  ok: boolean
  cards?: reception_card[]
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

function format_relative_time(iso: string | null): string {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  const diff_ms = Date.now() - date.getTime()

  if (Number.isNaN(diff_ms)) {
    return ''
  }

  const diff_min = Math.floor(diff_ms / 60_000)

  if (diff_min < 1) {
    return 'たった今'
  }

  if (diff_min < 60) {
    return `${diff_min}分前`
  }

  const diff_hour = Math.floor(diff_min / 60)

  if (diff_hour < 24) {
    return `${diff_hour}時間前`
  }

  const diff_day = Math.floor(diff_hour / 24)

  if (diff_day < 7) {
    return `${diff_day}日前`
  }

  return date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  })
}

// ============================================================================
// Hooks
// ============================================================================

function use_reception_state() {
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

        if (cancelled) {
          return
        }

        if (
          payload.ok &&
          (payload.state === 'open' || payload.state === 'offline')
        ) {
          set_state(payload.state)
        }
      } catch {
        // Swallow network errors; button stays in unknown state.
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

  return { state, is_pending, toast_message, toggle }
}

function use_reception_rooms({
  limit,
  keyword,
}: {
  limit: number
  keyword: string | null
}) {
  const [cards, set_cards] = useState<reception_card[]>([])
  const [is_loading, set_is_loading] = useState(true)
  const [is_error, set_is_error] = useState(false)

  useEffect(() => {
    let cancelled = false
    set_is_loading(true)

    void (async () => {
      try {
        const params = new URLSearchParams()
        params.set('limit', String(limit))

        if (keyword) {
          params.set('keyword', keyword)
        }

        const response = await fetch(
          `/api/admin/reception/rooms?${params.toString()}`,
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          },
        )

        if (cancelled) {
          return
        }

        if (!response.ok) {
          set_is_error(true)
          set_cards([])
          return
        }

        const payload = (await response.json()) as reception_rooms_response

        if (cancelled) {
          return
        }

        if (payload.ok && Array.isArray(payload.cards)) {
          set_cards(payload.cards)
          set_is_error(false)
        } else {
          set_is_error(true)
          set_cards([])
        }
      } catch {
        if (!cancelled) {
          set_is_error(true)
          set_cards([])
        }
      } finally {
        if (!cancelled) {
          set_is_loading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [limit, keyword])

  return { cards, is_loading, is_error }
}

// ============================================================================
// AdminReceptionButton -- header pill (ON/OFF)
// ============================================================================

export function AdminReceptionButton() {
  const { state, is_pending, toast_message, toggle } = use_reception_state()

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

// ============================================================================
// Card view (shared by inbox + page)
// ============================================================================

function CardView({
  card,
  variant,
}: {
  card: reception_card
  variant: 'inbox' | 'page'
}) {
  const short_id = card.room_uuid.slice(0, 8)
  const relative_time = format_relative_time(card.updated_at)
  const subtitle = card.typing_label ?? card.preview
  const subtitle_class =
    card.typing_label !== null
      ? 'text-amber-700'
      : variant === 'inbox'
        ? 'text-neutral-500'
        : 'text-neutral-600'

  return (
    <Link
      href={`/admin/reception/${card.room_uuid}`}
      className={
        variant === 'inbox'
          ? 'flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white px-3 py-2.5 transition-colors hover:border-neutral-200 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900'
          : 'flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900'
      }
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
        aria-hidden
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold leading-tight text-black">
            {card.title}
          </span>
          {relative_time ? (
            <span className="shrink-0 text-[11px] font-medium leading-none text-neutral-400">
              {relative_time}
            </span>
          ) : null}
        </div>
        <p className={`mt-0.5 truncate text-[12px] leading-tight ${subtitle_class}`}>
          {subtitle}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium leading-none text-neutral-500">
          <span className="font-mono text-neutral-400">{short_id}</span>
          {card.mode ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
              {card.mode}
            </span>
          ) : null}
          {card.active_label ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">
              {card.active_label}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

// ============================================================================
// AdminReceptionInbox -- mini latest 3 + link to /admin/reception
// ============================================================================

export function AdminReceptionInbox() {
  const { cards, is_loading, is_error } = use_reception_rooms({
    limit: 3,
    keyword: null,
  })

  if (is_loading && cards.length === 0) {
    return (
      <section
        aria-label="Reception inbox"
        className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-[12px] text-neutral-400"
      >
        <span>読み込み中...</span>
        <Link
          href="/admin/reception"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-black"
        >
          一覧へ
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </section>
    )
  }

  if (cards.length === 0) {
    return (
      <section
        aria-label="Reception inbox"
        className="flex items-center justify-between rounded-2xl border border-dashed border-neutral-200 bg-white px-3 py-2 text-[12px] text-neutral-500"
      >
        <span>
          {is_error
            ? 'チャット一覧を読み込めませんでした'
            : '対応中の案件はありません'}
        </span>
        <Link
          href="/admin/reception"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-black"
        >
          一覧へ
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </section>
    )
  }

  return (
    <section
      aria-label="Reception inbox"
      className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
    >
      <ul className="flex flex-col">
        {cards.slice(0, 3).map((card) => (
          <li key={card.room_uuid}>
            <CardView card={card} variant="inbox" />
          </li>
        ))}
      </ul>
      <div className="flex justify-end pr-1 pt-1">
        <Link
          href="/admin/reception"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-black"
        >
          一覧へ
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </section>
  )
}

// ============================================================================
// AdminReceptionPage -- full reception list page body
// ============================================================================

export function AdminReceptionPage() {
  const [keyword_input, set_keyword_input] = useState<string>('')
  const [debounced_keyword, set_debounced_keyword] = useState<string | null>(
    null,
  )

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = keyword_input.trim()
      set_debounced_keyword(trimmed.length > 0 ? trimmed : null)
    }, 220)

    return () => {
      window.clearTimeout(handle)
    }
  }, [keyword_input])

  const query_filters = useMemo(
    () => ({
      limit: 50,
      keyword: debounced_keyword,
    }),
    [debounced_keyword],
  )

  const { cards, is_loading, is_error } = use_reception_rooms(query_filters)

  return (
    <div className="flex flex-col gap-4">
      <header>
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-500"
        >
          <Link href="/admin" className="transition-colors hover:text-black">
            Home
          </Link>
          <ArrowRight
            className="h-3 w-3 text-neutral-400"
            strokeWidth={2}
            aria-hidden
          />
          <span className="text-neutral-900">チャット一覧</span>
        </nav>
      </header>

      <section
        aria-label="Reception search"
        className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            inputMode="search"
            value={keyword_input}
            onChange={(event) => set_keyword_input(event.target.value)}
            placeholder="名前・メッセージ・ID で検索"
            className="block w-full rounded-full border border-neutral-200 bg-white py-2 pl-9 pr-3 text-[13px] text-black placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
          />
        </div>
      </section>

      {is_error && cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          チャット一覧を読み込めませんでした
        </div>
      ) : is_loading && cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-400">
          読み込み中...
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          {debounced_keyword
            ? '一致する案件はありません'
            : 'コンシェルジュ案件はまだありません'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => (
            <li key={card.room_uuid}>
              <CardView card={card} variant="page" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
