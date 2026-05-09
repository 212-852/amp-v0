'use client'

import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { reception_search_filters } from '@/lib/admin/reception/rules'

type AdminReceptionFilterProps = {
  initial: reception_search_filters
  onFiltersChange: (filters: reception_search_filters) => void
}

export default function AdminReceptionFilter({
  initial,
  onFiltersChange,
}: AdminReceptionFilterProps) {
  const [keyword, set_keyword] = useState<string>(initial.keyword ?? '')

  const filters = useMemo<reception_search_filters>(
    () => ({
      keyword: keyword.trim().length > 0 ? keyword.trim() : null,
      status_mode: 'concierge',
      role: null,
      has_typing: false,
      pending_only: false,
    }),
    [keyword],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onFiltersChange(filters)
    }, 220)

    return () => {
      window.clearTimeout(timer)
    }
  }, [filters, onFiltersChange])

  return (
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
          value={keyword}
          onChange={(event) => set_keyword(event.target.value)}
          placeholder="名前・メッセージで検索"
          className="block w-full rounded-full border border-neutral-200 bg-white py-2 pl-9 pr-3 text-[13px] text-black placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
        />
      </div>
    </section>
  )
}
