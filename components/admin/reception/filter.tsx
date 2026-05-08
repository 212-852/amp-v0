'use client'

import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  is_reception_room_role,
  is_reception_status_mode,
  type reception_room_role_filter,
  type reception_room_status_mode_filter,
  type reception_search_filters,
} from '@/lib/admin/reception/rules'

type AdminReceptionFilterProps = {
  initial: reception_search_filters
  onFiltersChange: (filters: reception_search_filters) => void
}

const status_mode_options: Array<{
  value: reception_room_status_mode_filter | ''
  label: string
}> = [
  { value: '', label: 'すべてのモード/状態' },
  { value: 'concierge', label: 'コンシェルジュ' },
  { value: 'bot', label: 'ボット' },
  { value: 'active', label: 'アクティブ' },
  { value: 'closed', label: 'クローズ' },
]

const role_options: Array<{
  value: reception_room_role_filter | ''
  label: string
}> = [
  { value: '', label: 'すべての参加者' },
  { value: 'user', label: 'ユーザー' },
  { value: 'driver', label: 'ドライバー' },
  { value: 'admin', label: '管理者' },
  { value: 'concierge', label: 'コンシェルジュ' },
  { value: 'bot', label: 'ボット' },
]

export default function AdminReceptionFilter({
  initial,
  onFiltersChange,
}: AdminReceptionFilterProps) {
  const [keyword, set_keyword] = useState<string>(initial.keyword ?? '')
  const [status_mode, set_status_mode] = useState<
    reception_room_status_mode_filter | ''
  >(initial.status_mode ?? '')
  const [role, set_role] = useState<reception_room_role_filter | ''>(
    initial.role ?? '',
  )
  const [has_typing, set_has_typing] = useState<boolean>(initial.has_typing)
  const [pending_only, set_pending_only] = useState<boolean>(
    initial.pending_only,
  )

  const filters = useMemo<reception_search_filters>(
    () => ({
      keyword: keyword.trim().length > 0 ? keyword.trim() : null,
      status_mode: is_reception_status_mode(status_mode) ? status_mode : null,
      role: is_reception_room_role(role) ? role : null,
      has_typing,
      pending_only,
    }),
    [keyword, status_mode, role, has_typing, pending_only],
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
      aria-label="Reception filters"
      className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
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
          placeholder="名前・メッセージ・room_uuid で検索"
          className="block w-full rounded-full border border-neutral-200 bg-white py-2 pl-9 pr-3 text-[13px] text-black placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Mode / Status"
          value={status_mode}
          onChange={(event) => {
            const next = event.target.value
            set_status_mode(
              is_reception_status_mode(next) ? next : '',
            )
          }}
          className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-[12px] text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
        >
          {status_mode_options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Participant role"
          value={role}
          onChange={(event) => {
            const next = event.target.value
            set_role(is_reception_room_role(next) ? next : '')
          }}
          className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-[12px] text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
        >
          {role_options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-neutral-700">
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={pending_only}
            onChange={(event) => set_pending_only(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-neutral-300 text-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500"
          />
          <span>未対応のみ</span>
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={has_typing}
            onChange={(event) => set_has_typing(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-neutral-300 text-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-500"
          />
          <span>入力中のみ</span>
        </label>
      </div>
    </section>
  )
}
