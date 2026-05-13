'use client'

import { Download, Smartphone } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  clear_retained_before_install_prompt,
  get_retained_before_install_prompt,
  is_standalone_pwa,
  log_pwa_installability_state,
  manifest_is_available,
  post_pwa_debug,
  register_push_subscription,
  register_pwa_service_worker,
  set_pwa_source_channel_cookie,
  subscribe_before_install_prompt,
  type pwa_before_install_prompt_event,
} from '@/lib/pwa/client'

type PwaInstallButtonProps = {
  can_install: boolean
  user_uuid: string | null
  participant_uuid: string | null
  room_uuid: string | null
  role: string | null
  tier: string | null
  label: string
  fallback_label: string
  fallback_help: string
}

function initial_pwa_installed_state() {
  if (typeof window === 'undefined') {
    return false
  }

  return is_standalone_pwa()
}

export default function PwaInstallButton(props: PwaInstallButtonProps) {
  const [installed, set_installed] = useState(initial_pwa_installed_state)
  const [prompt, set_prompt] =
    useState<pwa_before_install_prompt_event | null>(
      get_retained_before_install_prompt,
    )
  const [is_busy, set_is_busy] = useState(false)
  const prompt_available = Boolean(prompt)
  const show_install_section = props.can_install && !installed
  const debug_context = useMemo(
    () => ({
      user_uuid: props.user_uuid,
      participant_uuid: props.participant_uuid,
      role: props.role,
      tier: props.tier,
      room_uuid: props.room_uuid,
      source_channel: installed ? 'pwa' : 'web',
      has_beforeinstallprompt: prompt_available,
      is_standalone: installed,
      manifest_available:
        typeof document === 'undefined' ? null : manifest_is_available(),
      user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      app_visibility_state:
        typeof document === 'undefined' ? null : document.visibilityState,
    }),
    [
      installed,
      prompt_available,
      props.participant_uuid,
      props.role,
      props.room_uuid,
      props.tier,
      props.user_uuid,
    ],
  )

  useEffect(() => {
    const standalone = is_standalone_pwa()

    if (standalone) {
      set_pwa_source_channel_cookie()
      void register_pwa_service_worker()
    }
  }, [])

  useEffect(() => {
    async function handle_app_installed() {
      set_installed(true)
      set_prompt(null)
      clear_retained_before_install_prompt()
      set_pwa_source_channel_cookie()

      post_pwa_debug({
        event: 'pwa_install_completed',
        ...debug_context,
        source_channel: 'pwa',
        has_beforeinstallprompt: false,
        is_standalone: true,
        phase: 'appinstalled',
      })

      const push_ok = await register_push_subscription({
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        room_uuid: props.room_uuid,
        role: props.role,
        tier: props.tier,
      })

      if (push_ok) {
        post_pwa_debug({
          event: 'pwa_install_succeeded',
          ...debug_context,
          source_channel: 'pwa',
          has_beforeinstallprompt: false,
          is_standalone: true,
          has_push_subscription: true,
          phase: 'appinstalled',
        })
      }
    }

    const unsubscribe = subscribe_before_install_prompt(set_prompt)
    window.addEventListener('appinstalled', handle_app_installed)

    return () => {
      unsubscribe()
      window.removeEventListener('appinstalled', handle_app_installed)
    }
  }, [
    debug_context,
    props.participant_uuid,
    props.role,
    props.room_uuid,
    props.tier,
    props.user_uuid,
  ])

  useEffect(() => {
    log_pwa_installability_state({
      phase: 'install_button_render_check',
      has_beforeinstallprompt: prompt_available,
      service_worker_registered: null,
    })

    if (show_install_section) {
      post_pwa_debug({
        event: 'pwa_install_button_rendered',
        ...debug_context,
        phase: prompt_available
          ? 'install_button_prompt_render'
          : 'install_button_fallback_render',
      })
    }

    if (!prompt_available) {
      post_pwa_debug({
        event: 'pwa_install_not_available',
        ...debug_context,
        phase: !props.can_install
          ? 'install_rule_not_allowed'
          : installed
            ? 'already_standalone'
            : 'beforeinstallprompt_missing_fallback_visible',
      })
    }
  }, [
    debug_context,
    installed,
    props.can_install,
    prompt_available,
    show_install_section,
  ])

  if (!show_install_section) {
    return null
  }

  async function handle_click() {
    if (!prompt || is_busy) {
      return
    }

    set_is_busy(true)

    post_pwa_debug({
      event: 'pwa_install_started',
      ...debug_context,
      phase: 'install_prompt',
    })

    try {
      await prompt.prompt()
      const choice = await prompt.userChoice

      if (choice.outcome !== 'accepted') {
        post_pwa_debug({
          event: 'pwa_install_dismissed',
          ...debug_context,
          phase: 'install_prompt',
        })
        return
      }

      set_pwa_source_channel_cookie()
      set_installed(true)
      set_prompt(null)
      clear_retained_before_install_prompt()

      const push_ok = await register_push_subscription({
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        room_uuid: props.room_uuid,
        role: props.role,
        tier: props.tier,
      })

      if (push_ok) {
        post_pwa_debug({
          event: 'pwa_install_succeeded',
          ...debug_context,
          source_channel: 'pwa',
          has_beforeinstallprompt: false,
          is_standalone: true,
          has_push_subscription: true,
          phase: 'install_prompt',
        })
      }
    } catch (error) {
      post_pwa_debug({
        event: 'pwa_install_failed',
        ...debug_context,
        error_message: error instanceof Error ? error.message : String(error),
        phase: 'install_prompt',
      })
    } finally {
      clear_retained_before_install_prompt()
      set_is_busy(false)
    }
  }

  if (!prompt_available) {
    return (
      <div className="mt-auto w-full rounded-2xl border border-[#eadfd7] bg-white px-4 py-3 text-left shadow-[0_2px_10px_rgba(42,29,24,0.04)]">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3ebe2] text-[#9b6b4b]">
            <Smartphone className="h-4.5 w-4.5" strokeWidth={2.2} />
          </span>
          <span className="text-[14px] font-semibold text-[#2a1d18]">
            {props.fallback_label}
          </span>
        </div>
        <p className="mt-2 pl-12 text-[11px] font-medium leading-[1.55] text-[#8a7568]">
          {props.fallback_help}
        </p>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handle_click}
      disabled={is_busy}
      className="mt-auto flex w-full items-center gap-3 rounded-2xl border border-[#eadfd7] bg-white px-4 py-3 text-left text-[14px] font-semibold text-[#2a1d18] shadow-[0_2px_10px_rgba(42,29,24,0.04)] disabled:opacity-60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3ebe2] text-[#9b6b4b]">
        <Download className="h-4.5 w-4.5" strokeWidth={2.2} />
      </span>
      <span>{props.label}</span>
    </button>
  )
}
