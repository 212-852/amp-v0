'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  clear_retained_before_install_prompt,
  is_standalone_pwa,
  log_pwa_installability_state,
  manifest_is_available,
  post_pwa_debug,
  register_push_subscription,
  register_pwa_service_worker,
  set_pwa_source_channel_cookie,
  use_before_install_prompt_state,
} from '@/lib/pwa/client'
import { resolve_pwa_install_menu_copy_variant } from '@/lib/pwa/install_menu_copy'
import {
  resolve_pwa_install_menu_labels,
  resolve_pwa_install_ui_locale,
} from '@/lib/pwa/copy'
import type { locale_key } from '@/lib/locale/action'

import Pwa_install_menu_item from '@/components/pwa/menu/item'

type PwaInstallButtonProps = {
  can_install: boolean
  user_uuid: string | null
  participant_uuid: string | null
  room_uuid: string | null
  role: string | null
  tier: string | null
  source_channel: string
  session_locale: string | null | undefined
  client_locale_fallback: locale_key
  on_open_install_modal: () => void
  on_close_menu: () => void
}

function initial_pwa_installed_state() {
  if (typeof window === 'undefined') {
    return false
  }

  return is_standalone_pwa()
}

function resolve_client_platform() {
  if (typeof navigator === 'undefined') {
    return null
  }

  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }

  return nav.userAgentData?.platform ?? nav.platform ?? null
}

export default function PwaInstallButton(props: PwaInstallButtonProps) {
  const [installed, set_installed] = useState(initial_pwa_installed_state)
  const prompt = use_before_install_prompt_state()
  const prompt_available = Boolean(prompt)
  const show_install_section = props.can_install && !installed

  const user_agent =
    typeof navigator === 'undefined' ? null : navigator.userAgent

  const copy_variant = useMemo(
    () =>
      resolve_pwa_install_menu_copy_variant({
        has_beforeinstallprompt: prompt_available,
        user_agent,
      }),
    [prompt_available, user_agent],
  )

  const pwa_ui_locale = useMemo(
    () =>
      resolve_pwa_install_ui_locale({
        session_locale: props.session_locale,
        client_locale_fallback: props.client_locale_fallback,
      }),
    [props.session_locale, props.client_locale_fallback],
  )

  const menu_labels = useMemo(
    () =>
      resolve_pwa_install_menu_labels({
        locale: pwa_ui_locale.locale,
        variant: copy_variant,
        installed,
      }),
    [copy_variant, installed, pwa_ui_locale.locale],
  )

  const debug_context = useMemo(
    () => ({
      user_uuid: props.user_uuid,
      participant_uuid: props.participant_uuid,
      role: props.role,
      tier: props.tier,
      room_uuid: props.room_uuid,
      source_channel: props.source_channel,
      has_beforeinstallprompt: prompt_available,
      is_standalone: installed,
      manifest_available:
        typeof document === 'undefined' ? null : manifest_is_available(),
      user_agent,
      app_visibility_state:
        typeof document === 'undefined' ? null : document.visibilityState,
    }),
    [
      installed,
      prompt_available,
      props.participant_uuid,
      props.role,
      props.room_uuid,
      props.source_channel,
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

    window.addEventListener('appinstalled', handle_app_installed)

    return () => {
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

    if (!prompt_available && (show_install_section || !props.can_install)) {
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

  function handle_menu_row_click() {
    const has_prompt = Boolean(prompt)
    const standalone_now = is_standalone_pwa()
    const base = {
      ...debug_context,
      has_beforeinstallprompt: has_prompt,
      is_standalone: standalone_now,
      click_handler_reached: true as const,
      modal_component_name: 'Pwa_install_modal_body' as const,
      platform: resolve_client_platform(),
      phase: 'user_menu_pwa_install_row',
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
      props.on_open_install_modal()
    } catch (error) {
      post_pwa_debug({
        event: 'pwa_install_modal_open_failed',
        ...base,
        error_message: error instanceof Error ? error.message : String(error),
        reason: 'open_install_modal_callback_threw',
      })

      return
    }

    window.requestAnimationFrame(() => {
      props.on_close_menu()
    })
  }

  if (!props.can_install) {
    return null
  }

  if (installed) {
    return (
      <Pwa_install_menu_item
        tone="user"
        installed
        title={menu_labels.title}
        subtitle={menu_labels.subtitle}
        badge_label={menu_labels.badge_label}
      />
    )
  }

  return (
    <Pwa_install_menu_item
      tone="user"
      installed={false}
      title={menu_labels.title}
      subtitle={menu_labels.subtitle}
      badge_label={menu_labels.badge_label}
      on_press={() => {
        handle_menu_row_click()
      }}
    />
  )
}
