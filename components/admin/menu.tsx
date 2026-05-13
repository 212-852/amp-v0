'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import OverlayRoot from '@/components/overlay/root'
import Pwa_install_menu_item from '@/components/pwa/menu/item'
import Pwa_install_modal_body from '@/components/pwa/install_modal_body'
import { use_session_profile } from '@/components/session/profile'
import {
  is_standalone_pwa,
  manifest_is_available,
  post_pwa_debug,
  use_before_install_prompt_state,
} from '@/lib/pwa/client'
import type { locale_key } from '@/lib/locale/action'
import { get_locale, subscribe_locale } from '@/lib/locale/state'
import {
  resolve_pwa_install_menu_labels,
  resolve_pwa_install_ui_locale,
} from '@/lib/pwa/copy'
import { resolve_pwa_install_menu_copy_variant } from '@/lib/pwa/install_menu_copy'
import { can_offer_admin_pwa_install_menu_row } from '@/lib/push/rules'

type AdminHeaderMenuProps = {
  can_access_management: boolean
  role: string | null
  tier: string | null
}

const icon_button_class =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-black shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 active:scale-[0.98] sm:h-11 sm:w-11'

export default function AdminHeaderMenu({
  can_access_management,
  role,
  tier,
}: AdminHeaderMenuProps) {
  const { session } = use_session_profile()
  const [is_open, set_is_open] = useState(false)
  const [is_pwa_modal_open, set_is_pwa_modal_open] = useState(false)
  const [is_standalone_client, set_is_standalone_client] = useState(false)
  const [client_locale, set_client_locale] = useState<locale_key>('ja')
  const root_ref = useRef<HTMLDivElement | null>(null)
  const before_install_prompt = use_before_install_prompt_state()

  const show_pwa_row = can_offer_admin_pwa_install_menu_row({ role, tier })

  const user_agent =
    typeof navigator === 'undefined' ? null : navigator.userAgent

  const pwa_install_copy_variant = useMemo(
    () =>
      resolve_pwa_install_menu_copy_variant({
        has_beforeinstallprompt: Boolean(before_install_prompt),
        user_agent,
      }),
    [before_install_prompt, user_agent],
  )

  const pwa_ui_locale = useMemo(
    () =>
      resolve_pwa_install_ui_locale({
        session_locale: session?.locale,
        client_locale_fallback: client_locale,
      }),
    [client_locale, session?.locale],
  )

  const admin_pwa_menu_labels = useMemo(
    () =>
      resolve_pwa_install_menu_labels({
        locale: pwa_ui_locale.locale,
        variant: pwa_install_copy_variant,
        installed: is_standalone_client,
      }),
    [is_standalone_client, pwa_install_copy_variant, pwa_ui_locale.locale],
  )

  useEffect(() => {
    set_client_locale(get_locale())
    return subscribe_locale(set_client_locale)
  }, [])

  useEffect(() => {
    set_is_standalone_client(is_standalone_pwa())
  }, [])

  const close_pwa_modal = useCallback(() => {
    set_is_pwa_modal_open(false)
  }, [])

  useEffect(() => {
    if (!is_open) {
      return
    }

    const handle_pointer_down = (event: PointerEvent) => {
      const root = root_ref.current

      if (!root || root.contains(event.target as Node)) {
        return
      }

      set_is_open(false)
    }

    window.addEventListener('pointerdown', handle_pointer_down)

    return () => {
      window.removeEventListener('pointerdown', handle_pointer_down)
    }
  }, [is_open])

  function open_pwa_modal() {
    const has_before = Boolean(before_install_prompt)
    const standalone = is_standalone_pwa()
    const base = {
      role,
      tier,
      source_channel: session?.source_channel ?? ('web' as const),
      platform:
        typeof navigator === 'undefined' ? null : navigator.platform,
      has_beforeinstallprompt: has_before,
      is_standalone: standalone,
      click_handler_reached: true as const,
      modal_component_name: 'Pwa_install_modal_body' as const,
      user_agent:
        typeof navigator === 'undefined' ? null : navigator.userAgent,
      manifest_available:
        typeof document === 'undefined' ? null : manifest_is_available(),
      phase: 'admin_menu_pwa_install_row',
    }

    post_pwa_debug({
      event: 'pwa_install_menu_clicked',
      ...base,
    })

    post_pwa_debug({
      event: 'pwa_install_modal_open_started',
      ...base,
    })

    try {
      set_is_pwa_modal_open(true)
    } catch (error) {
      post_pwa_debug({
        event: 'pwa_install_modal_open_failed',
        ...base,
        error_message: error instanceof Error ? error.message : String(error),
        reason: 'set_modal_state_threw',
      })

      return
    }

    window.requestAnimationFrame(() => {
      set_is_open(false)
    })
  }

  const has_menu_items = can_access_management || show_pwa_row

  return (
    <div ref={root_ref} className="relative">
      <button
        type="button"
        className={icon_button_class}
        aria-label="Admin menu"
        aria-expanded={is_open}
        onClick={() => set_is_open((current) => !current)}
      >
        <ChevronDown className="h-5 w-5" strokeWidth={2} />
      </button>

      {is_open ? (
        <div className="absolute right-0 top-full z-[160] mt-2 flex min-w-52 max-w-[min(100vw-24px,280px)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
          <div className="flex flex-col">
            {can_access_management ? (
              <Link
                href="/admin/management"
                className="block rounded-xl px-3 py-2 text-[13px] font-semibold text-black transition-colors hover:bg-neutral-100"
                onClick={() => set_is_open(false)}
              >
                運営者一覧
              </Link>
            ) : null}

            {show_pwa_row ? (
              <div
                className={
                  can_access_management
                    ? 'mt-1 border-t border-neutral-100 pt-1'
                    : ''
                }
              >
                <Pwa_install_menu_item
                  tone="admin"
                  installed={is_standalone_client}
                  title={admin_pwa_menu_labels.title}
                  subtitle={admin_pwa_menu_labels.subtitle}
                  badge_label={admin_pwa_menu_labels.badge_label}
                  on_press={
                    is_standalone_client
                      ? undefined
                      : () => {
                          open_pwa_modal()
                        }
                  }
                />
              </div>
            ) : null}

            {!has_menu_items ? (
              <div className="px-3 py-2 text-[12px] font-medium text-neutral-400">
                メニューはありません
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <OverlayRoot
        open={is_pwa_modal_open}
        on_close={close_pwa_modal}
        variant="center"
      >
        <Pwa_install_modal_body
          role={role}
          tier={tier}
          session_locale={session?.locale ?? null}
          client_locale_fallback={client_locale}
          source_channel={session?.source_channel ?? 'web'}
          on_close={close_pwa_modal}
        />
      </OverlayRoot>
    </div>
  )
}
