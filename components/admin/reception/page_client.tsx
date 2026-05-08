'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  reception_room_summary,
  reception_search_filters,
} from '@/lib/admin/reception/rules'

import AdminReceptionFilter from './filter'
import AdminReceptionList from './list'

type AdminReceptionPageClientProps = {
  initial_filters: reception_search_filters
  initial_rooms: reception_room_summary[]
}

type rooms_response = {
  ok: boolean
  rooms?: reception_room_summary[]
  error?: string
}

function build_query(filters: reception_search_filters): string {
  const params = new URLSearchParams()

  if (filters.keyword) {
    params.set('keyword', filters.keyword)
  }

  if (filters.status_mode) {
    params.set('status_mode', filters.status_mode)
  }

  if (filters.role) {
    params.set('role', filters.role)
  }

  if (filters.has_typing) {
    params.set('has_typing', 'true')
  }

  if (filters.pending_only) {
    params.set('pending_only', 'true')
  }

  const query = params.toString()

  return query ? `?${query}` : ''
}

export default function AdminReceptionPageClient({
  initial_filters,
  initial_rooms,
}: AdminReceptionPageClientProps) {
  const [rooms, set_rooms] = useState<reception_room_summary[]>(initial_rooms)
  const [is_loading, set_is_loading] = useState(false)
  const fetch_token_ref = useRef(0)

  const handle_filters_change = useCallback(
    async (next_filters: reception_search_filters) => {
      const token = fetch_token_ref.current + 1
      fetch_token_ref.current = token
      set_is_loading(true)

      try {
        const response = await fetch(
          `/api/admin/reception/rooms${build_query(next_filters)}`,
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          },
        )

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as rooms_response

        if (token !== fetch_token_ref.current) {
          return
        }

        if (payload.ok && Array.isArray(payload.rooms)) {
          set_rooms(payload.rooms)
        }
      } catch {
        // Network failure: keep last successful list.
      } finally {
        if (token === fetch_token_ref.current) {
          set_is_loading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    set_rooms(initial_rooms)
  }, [initial_rooms])

  return (
    <div className="flex flex-col gap-3">
      <AdminReceptionFilter
        initial={initial_filters}
        onFiltersChange={handle_filters_change}
      />
      <AdminReceptionList rooms={rooms} is_loading={is_loading} />
    </div>
  )
}
