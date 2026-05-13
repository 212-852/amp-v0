'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

import {
  clear_retained_before_install_prompt,
  is_standalone_pwa,
  manifest_is_available,
  post_pwa_debug,
  set_pwa_source_channel_cookie,
  use_before_install_prompt_state,
} from '@/lib/pwa/client'

import { Pwa_safari_install_steps_list } from './safari_install_steps'

type pwa_install_modal_body_props = {
  role: string | null
  tier: string | null
  on_close: () => void
}

function resolve_pwa_debug_channel() {
  if (typeof window === 'undefined') {
    return 'web'
  }

  return is_standalone_pwa() ? 'pwa' : 'web'
}

export default function Pwa_install_modal_body(
  props: pwa_install_modal_body_props,
) {
  const prompt = use_before_install_prompt_state()
  const has_prompt = Boolean(prompt)
  const [is_busy, set_is_busy] = useState(false)
  const [standalone_now, set_standalone_now] = useState(false)

  useEffect(() => {
    set_standalone_now(is_standalone_pwa())
  }, [])

  const debug_base = useMemo(
    () => ({
      role: props.role,
      tier: props.tier,
      source_channel: resolve_pwa_debug_channel(),
      has_beforeinstallprompt: has_prompt,
      is_standalone: standalone_now,
      modal_reused: 'overlay_root_center',
      user_agent:
        typeof navigator === 'undefined' ? null : navigator.userAgent,
      app_visibility_state:
        typeof document === 'undefined' ? null : document.visibilityState,
      manifest_available:
        typeof document === 'undefined' ? null : manifest_is_available(),
      phase: 'admin_pwa_install_modal',
    }),
    [has_prompt, props.role, props.tier, standalone_now],
  )

  useEffect(() => {
    function handle_app_installed() {
      post_pwa_debug({
        event: 'pwa_install_completed',
        ...debug_base,
        source_channel: 'pwa',
        has_beforeinstallprompt: false,
        is_standalone: true,
        phase: 'appinstalled',
      })
      props.on_close()
    }

    window.addEventListener('appinstalled', handle_app_installed)

    return () => {
      window.removeEventListener('appinstalled', handle_app_installed)
    }
  }, [debug_base, props.on_close])

  async function handle_install_click() {
    if (!prompt || is_busy) {
      return
    }

    set_is_busy(true)

    post_pwa_debug({
      event: 'pwa_install_started',
      ...debug_base,
      phase: 'install_prompt',
    })

    try {
      await prompt.prompt()
      const choice = await prompt.userChoice

      if (choice.outcome !== 'accepted') {
        post_pwa_debug({
          event: 'pwa_install_dismissed',
          ...debug_base,
          phase: 'install_prompt',
        })
        return
      }

      post_pwa_debug({
        event: 'pwa_install_accepted',
        ...debug_base,
        source_channel: 'pwa',
        has_beforeinstallprompt: false,
        is_standalone: true,
        phase: 'install_prompt',
      })

      set_pwa_source_channel_cookie()
      clear_retained_before_install_prompt()
    } catch (error) {
      post_pwa_debug({
        event: 'pwa_install_failed',
        ...debug_base,
        error_message: error instanceof Error ? error.message : String(error),
        phase: 'install_prompt',
      })
    } finally {
      set_is_busy(false)
    }
  }

  return (
    <div className="relative w-[92%] max-w-[360px] rounded-[26px] bg-white px-6 py-6 shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="pr-2 text-[18px] font-semibold leading-snug text-neutral-900">
          アプリをインストール
        </h2>
        <button
          type="button"
          aria-label="close"
          onClick={props.on_close}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
        >
          <X className="h-[22px] w-[22px] stroke-[2.1] text-neutral-700" />
        </button>
      </div>

      <p className="mt-3 text-left text-[14px] leading-[1.65] text-neutral-600">
        この端末にPET TAXIをインストールしますか？
      </p>

      {standalone_now ? (
        <div className="mt-5">
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-full bg-neutral-200 px-5 py-3 text-[14px] font-semibold text-neutral-500"
          >
            インストール済み
          </button>
        </div>
      ) : has_prompt ? (
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            disabled={is_busy}
            onClick={() => {
              void handle_install_click()
            }}
            className="w-full rounded-full bg-neutral-900 px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            インストール
          </button>
          <button
            type="button"
            onClick={props.on_close}
            className="text-center text-[12px] font-medium text-neutral-500"
          >
            閉じる
          </button>
        </div>
      ) : (
        <div className="mt-4 text-left">
          <p className="text-[12px] font-semibold text-neutral-800">
            iPhone Safari / LIFF の場合
          </p>
          <Pwa_safari_install_steps_list />
          <button
            type="button"
            onClick={props.on_close}
            className="mt-5 w-full rounded-full bg-neutral-900 px-5 py-3 text-[14px] font-semibold text-white"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  )
}
