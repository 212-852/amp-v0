'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'

import {
  build_pwa_diagnostic_payload,
  is_standalone_pwa,
  post_pwa_debug,
} from '@/lib/pwa/client'
import {
  build_session_restore_headers,
  read_local_visitor_uuid,
  write_local_visitor_uuid,
} from '@/lib/visitor/client'

type boot_context_value = {
  is_boot_overlay_visible: boolean
}

const PwaBootContext = createContext<boot_context_value>({
  is_boot_overlay_visible: false,
})

export function use_pwa_boot_gate() {
  return useContext(PwaBootContext)
}

type merged_session = {
  user_uuid?: string | null
  tier?: string | null
  role?: string | null
  visitor_uuid?: string | null
  chat?: { room_uuid?: string | null } | null
}

function merge_session_json(
  raw: Record<string, unknown> | null,
): merged_session | null {
  if (!raw) {
    return null
  }

  const nested =
    raw.session && typeof raw.session === 'object'
      ? (raw.session as Record<string, unknown>)
      : {}

  return { ...raw, ...nested } as merged_session
}

export function PwaBootProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [overlay_visible, set_overlay_visible] = useState(false)

  useEffect(() => {
    if (!is_standalone_pwa()) {
      return
    }

    let cancelled = false

    set_overlay_visible(true)

    void (async () => {
      const base_diag = build_pwa_diagnostic_payload({})

      post_pwa_debug({
        event: 'pwa_boot_loading_started',
        phase: 'pwa_boot_gate',
        visitor_uuid: read_local_visitor_uuid(),
        ...base_diag,
      })

      async function fetch_session(): Promise<merged_session | null> {
        const response = await fetch('/api/session', {
          method: 'GET',
          credentials: 'include',
          headers: build_session_restore_headers(),
        })

        const raw = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null

        return merge_session_json(raw)
      }

      try {
        let session = await fetch_session()

        write_local_visitor_uuid(session?.visitor_uuid ?? null)

        const needs_room =
          Boolean(session?.user_uuid) &&
          (session?.tier === 'member' || session?.tier === 'vip')

        const room_uuid =
          session?.chat && typeof session.chat === 'object'
            ? session.chat.room_uuid
            : null

        if (needs_room && !room_uuid && !cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 450))
          session = await fetch_session()
          write_local_visitor_uuid(session?.visitor_uuid ?? null)
        }

        if (!cancelled) {
          router.refresh()
          await new Promise((resolve) => setTimeout(resolve, 300))
        }

        const room_after =
          session?.chat && typeof session.chat === 'object'
            ? session.chat.room_uuid
            : null

        post_pwa_debug({
          event: 'pwa_boot_loading_finished',
          phase: 'pwa_boot_gate',
          visitor_uuid: session?.visitor_uuid ?? read_local_visitor_uuid(),
          user_uuid: session?.user_uuid ?? null,
          role: session?.role ?? null,
          tier: session?.tier ?? null,
          room_uuid: room_after ?? null,
          ...base_diag,
        })
      } catch {
        post_pwa_debug({
          event: 'pwa_boot_loading_finished',
          phase: 'pwa_boot_gate',
          error_code: 'boot_failed',
          error_message: 'session_fetch_or_refresh_failed',
          visitor_uuid: read_local_visitor_uuid(),
          ...build_pwa_diagnostic_payload({}),
        })
      } finally {
        if (!cancelled) {
          set_overlay_visible(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  const value = useMemo(
    () => ({ is_boot_overlay_visible: overlay_visible }),
    [overlay_visible],
  )

  return (
    <PwaBootContext.Provider value={value}>
      {children}
      {overlay_visible ? (
        <div
          className="fixed inset-0 z-[200000] flex flex-col items-center justify-center bg-[#f6e5cf] px-8 text-center"
          role="status"
          aria-live="polite"
        >
          <h1 className="text-[18px] font-semibold tracking-wide text-[#2a1d18]">
            読み込み中
          </h1>
          <p className="mt-3 max-w-[280px] text-[14px] leading-relaxed text-[#6f5b4d]">
            アプリを準備しています
          </p>
        </div>
      ) : null}
    </PwaBootContext.Provider>
  )
}
