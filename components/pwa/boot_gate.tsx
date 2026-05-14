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
  chat?: {
    room_uuid?: string | null
    participant_uuid?: string | null
  } | null
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
        user_uuid: null,
        role: null,
        tier: null,
        room_uuid: null,
        participant_uuid: null,
        reason: 'standalone_pwa_boot',
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

      function room_ready(session: merged_session | null) {
        return Boolean(
          session?.chat?.room_uuid && session.chat.participant_uuid,
        )
      }

      function room_payload(session: merged_session | null) {
        return {
          visitor_uuid: session?.visitor_uuid ?? read_local_visitor_uuid(),
          user_uuid: session?.user_uuid ?? null,
          role: session?.role ?? null,
          tier: session?.tier ?? null,
          room_uuid: session?.chat?.room_uuid ?? null,
          participant_uuid: session?.chat?.participant_uuid ?? null,
        }
      }

      let boot_ready = false

      try {
        let session = await fetch_session()

        write_local_visitor_uuid(session?.visitor_uuid ?? null)

        const started_at = Date.now()

        while (!cancelled && !room_ready(session)) {
          if (Date.now() - started_at >= 20_000) {
            post_pwa_debug({
              event: 'chat_room_resolve_failed',
              phase: 'pwa_boot_gate',
              reason: 'boot_gate_timeout',
              error_code: 'room_or_participant_missing',
              error_message:
                'room_uuid and participant_uuid were not restored before timeout',
              ...room_payload(session),
              ...build_pwa_diagnostic_payload({}),
            })

            return
          }

          await new Promise((resolve) => setTimeout(resolve, 500))
          session = await fetch_session()
          write_local_visitor_uuid(session?.visitor_uuid ?? null)
        }

        if (!cancelled) {
          router.refresh()
          await new Promise((resolve) => setTimeout(resolve, 300))
        }

        boot_ready = true

        post_pwa_debug({
          event: 'pwa_boot_loading_finished',
          phase: 'pwa_boot_gate',
          reason: 'room_and_participant_ready',
          ...room_payload(session),
          ...base_diag,
        })
      } catch {
        post_pwa_debug({
          event: 'chat_room_resolve_failed',
          phase: 'pwa_boot_gate',
          error_code: 'boot_failed',
          error_message: 'session_fetch_or_refresh_failed',
          visitor_uuid: read_local_visitor_uuid(),
          ...build_pwa_diagnostic_payload({}),
        })
      } finally {
        if (!cancelled && boot_ready) {
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
