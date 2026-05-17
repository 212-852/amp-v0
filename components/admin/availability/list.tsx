'use client'

import Link from 'next/link'
import { UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { admin_user_summary } from '@/lib/admin/management/action'
import { create_browser_supabase } from '@/lib/db/browser'

type AdminAvailabilityListProps = {
  initial_admins: admin_user_summary[]
}

function format_time(iso: string | null): string {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function reception_label(state: 'open' | 'offline' | null): string {
  if (state === 'open') {
    return '受付中'
  }

  if (state === 'offline') {
    return '受付停止'
  }

  return '未設定'
}

function reception_chip_class(state: 'open' | 'offline' | null): string {
  if (state === 'open') {
    return 'border-black bg-black text-white'
  }

  if (state === 'offline') {
    return 'border-neutral-300 bg-neutral-100 text-neutral-600'
  }

  return 'border-dashed border-neutral-300 bg-white text-neutral-500'
}

function sort_available_admins(admins: admin_user_summary[]) {
  return [...admins]
    .filter((admin) => admin.is_available)
    .sort((a, b) => {
      const left = new Date(a.reception_updated_at ?? 0).getTime()
      const right = new Date(b.reception_updated_at ?? 0).getTime()
      return right - left
    })
}

export default function AdminAvailabilityList({
  initial_admins,
}: AdminAvailabilityListProps) {
  const [admins, set_admins] = useState(() =>
    sort_available_admins(initial_admins),
  )

  const reload_admins = useCallback(async () => {
    const response = await fetch('/api/admin/availability', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error('admin_availability_fetch_failed')
    }

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; admins?: admin_user_summary[] }
      | null

    if (!payload?.ok || !Array.isArray(payload.admins)) {
      throw new Error('admin_availability_payload_invalid')
    }

    set_admins(sort_available_admins(payload.admins))
  }, [])

  useEffect(() => {
    set_admins(sort_available_admins(initial_admins))
  }, [initial_admins])

  useEffect(() => {
    const supabase = create_browser_supabase()

    if (!supabase) {
      send_admin_chat_debug({
        event: 'admin_availability_realtime_failed',
        level: 'error',
        error_code: 'supabase_client_unavailable',
        error_message: 'Supabase browser client is unavailable.',
        phase: 'admin_availability_list',
      })
      return
    }

    const channel = supabase
      .channel('admin_availability:list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_availability',
        },
        () => {
          void reload_admins().catch((error) => {
            send_admin_chat_debug({
              event: 'admin_availability_realtime_failed',
              level: 'error',
              error_code: 'admin_availability_reload_failed',
              error_message:
                error instanceof Error ? error.message : String(error),
              phase: 'admin_availability_list',
            })
          })
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          send_admin_chat_debug({
            event: 'admin_availability_realtime_failed',
            level: 'error',
            error_code: 'admin_availability_subscribe_failed',
            error_message: status,
            subscribe_status: status,
            phase: 'admin_availability_list',
          })
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [reload_admins])

  if (admins.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
        受付中の運営者はいません
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {admins.map((admin) => (
        <li key={admin.user_uuid}>
          <Link
            href={`/admin/management/${admin.user_uuid}`}
            className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-700"
              aria-hidden
            >
              {admin.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={admin.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : admin.display_name ? (
                <span className="text-[12px] font-semibold">
                  {admin.display_name.slice(0, 1)}
                </span>
              ) : (
                <UserRound className="h-4 w-4" strokeWidth={2} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-semibold leading-tight text-black">
                  {admin.display_name ?? '名称未設定'}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${reception_chip_class(admin.reception_state)}`}
                >
                  {reception_label(admin.reception_state)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium leading-none text-neutral-500">
                <span>{admin.role ?? 'admin'}</span>
                <span aria-hidden>{'/'}</span>
                <span>{admin.tier ?? '未設定'}</span>
                {admin.reception_updated_at ? (
                  <>
                    <span aria-hidden>{'/'}</span>
                    <span>{format_time(admin.reception_updated_at)}</span>
                  </>
                ) : null}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
