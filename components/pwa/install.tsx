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

import Pwa_install_menu_item from './install_menu_item'

type PwaInstallButtonProps = {
  can_install: boolean
  user_uuid: string | null
  participant_uuid: string | null
  room_uuid: string | null
  role: string | null
  tier: string | null
}

function initial_pwa_installed_state() {
  if (typeof window === 'undefined') {
    return false
  }

  return is_standalone_pwa()
}

export default function PwaInstallButton(props: PwaInstallButtonProps) {
  const [installed, set_installed] = useState(initial_pwa_installed_state)
  const prompt = use_before_install_prompt_state()
  const [is_busy, set_is_busy] = useState(false)
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

      post_pwa_debug({
        event: 'pwa_install_accepted',
        ...debug_context,
        source_channel: 'pwa',
        has_beforeinstallprompt: false,
        is_standalone: true,
        phase: 'install_prompt',
      })

      set_pwa_source_channel_cookie()
      set_installed(true)
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

  if (!props.can_install) {
    return null
  }

  if (installed) {
    return (
      <Pwa_install_menu_item
        tone="user"
        installed
        copy_variant="standard"
        interactive={false}
      />
    )
  }

  return (
    <Pwa_install_menu_item
      tone="user"
      installed={false}
      copy_variant={copy_variant}
      interactive={prompt_available}
      is_busy={is_busy}
      on_press={prompt_available ? () => void handle_click() : undefined}
    />
  )
}
