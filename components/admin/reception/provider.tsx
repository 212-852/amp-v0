'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  default_reception_state,
  normalize_reception_state,
  type reception_state,
} from '@/lib/admin/reception/rules'
import { create_browser_supabase } from '@/lib/db/browser'

type reception_api_response = {
  ok?: boolean
  state?: unknown
}

type admin_reception_context_value = {
  admin_user_uuid: string
  reception_state: reception_state
  is_loading: boolean
  is_toggling: boolean
  toggle_reception: () => Promise<reception_state | null>
  set_reception_state: (state: reception_state) => void
}

const AdminReceptionContext = createContext<admin_reception_context_value | null>(
  null,
)

async function fetch_reception_state_from_api(): Promise<reception_state> {
  const response = await fetch('/api/admin/reception', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    return default_reception_state
  }

  const payload = (await response.json().catch(() => null)) as
    | reception_api_response
    | null

  return normalize_reception_state(payload?.state) ?? default_reception_state
}

async function post_reception_toggle(): Promise<reception_state | null> {
  const response = await fetch('/api/admin/reception', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json().catch(() => null)) as
    | reception_api_response
    | null

  return normalize_reception_state(payload?.state)
}

type AdminReceptionProviderProps = {
  admin_user_uuid: string
  children: ReactNode
}

/**
 * Single client source for `public.receptions.state` (header toggle + chat list).
 */
export function AdminReceptionProvider({
  admin_user_uuid,
  children,
}: AdminReceptionProviderProps) {
  const [reception_state, set_reception_state] =
    useState<reception_state>(default_reception_state)
  const [is_loading, set_is_loading] = useState(true)
  const [is_toggling, set_is_toggling] = useState(false)

  const apply_reception_state = useCallback((next: reception_state) => {
    set_reception_state(next)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const next = await fetch_reception_state_from_api()

      if (!cancelled) {
        apply_reception_state(next)
        set_is_loading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [admin_user_uuid, apply_reception_state])

  useEffect(() => {
    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const handle_row = (row: { state?: unknown } | null) => {
      const next = normalize_reception_state(row?.state)

      if (next) {
        apply_reception_state(next)
      }
    }

    const channel = supabase
      .channel(`receptions:admin:${admin_user_uuid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'receptions',
          filter: `user_uuid=eq.${admin_user_uuid}`,
        },
        (payload) => {
          handle_row(payload.new as { state?: unknown } | null)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'receptions',
          filter: `user_uuid=eq.${admin_user_uuid}`,
        },
        (payload) => {
          handle_row(payload.new as { state?: unknown } | null)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [admin_user_uuid, apply_reception_state])

  const toggle_reception = useCallback(async () => {
    set_is_toggling(true)

    try {
      const next = await post_reception_toggle()

      if (next) {
        apply_reception_state(next)
      }

      return next
    } finally {
      set_is_toggling(false)
    }
  }, [apply_reception_state])

  const value = useMemo(
    () => ({
      admin_user_uuid,
      reception_state,
      is_loading,
      is_toggling,
      toggle_reception,
      set_reception_state: apply_reception_state,
    }),
    [
      admin_user_uuid,
      apply_reception_state,
      is_loading,
      is_toggling,
      reception_state,
      toggle_reception,
    ],
  )

  return (
    <AdminReceptionContext.Provider value={value}>
      {children}
    </AdminReceptionContext.Provider>
  )
}

export function use_admin_reception() {
  const context = useContext(AdminReceptionContext)

  if (!context) {
    throw new Error('use_admin_reception must be used within AdminReceptionProvider')
  }

  return context
}
