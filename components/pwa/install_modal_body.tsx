'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  clear_retained_before_install_prompt,
  get_retained_before_install_prompt,
  is_standalone_pwa,
  manifest_is_available,
  post_pwa_debug,
  set_pwa_source_channel_cookie,
  use_before_install_prompt_state,
} from '@/lib/pwa/client'
import { resolve_pwa_install_modal_panel_copy } from '@/lib/pwa/copy'
import { resolve_pwa_install_client_os } from '@/lib/pwa/rules'

import Pwa_install_modal_body_view from '@/components/pwa/modal/body'

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
  const [standalone_now, set_standalone_now] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return is_standalone_pwa()
  })

  const user_agent =
    typeof navigator === 'undefined' ? null : navigator.userAgent

  const client_os = useMemo(
    () => resolve_pwa_install_client_os(user_agent),
    [user_agent],
  )

  const panel_copy = useMemo(
    () =>
      resolve_pwa_install_modal_panel_copy({
        client_os,
        standalone: standalone_now,
        has_before_install_prompt: has_prompt,
      }),
    [client_os, standalone_now, has_prompt],
  )

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
      phase: 'pwa_install_modal',
    }),
    [has_prompt, props.role, props.tier, standalone_now],
  )

  useEffect(() => {
    const ua =
      typeof navigator === 'undefined' ? null : navigator.userAgent
    const os = resolve_pwa_install_client_os(ua)
    const standalone = is_standalone_pwa()
    const prompt_ok = Boolean(get_retained_before_install_prompt())
    const base = {
      role: props.role,
      tier: props.tier,
      source_channel: standalone ? 'pwa' : 'web',
      has_beforeinstallprompt: prompt_ok,
      is_standalone: standalone,
      modal_reused: 'overlay_root_center',
      user_agent: ua,
      app_visibility_state:
        typeof document === 'undefined' ? null : document.visibilityState,
      manifest_available:
        typeof document === 'undefined' ? null : manifest_is_available(),
      phase: 'pwa_install_modal',
    }

    post_pwa_debug({
      event: 'pwa_install_modal_opened',
      ...base,
      install_client_os: os,
    })

    post_pwa_debug({
      event: 'pwa_install_os_detected',
      ...base,
      install_client_os: os,
    })
  }, [props.role, props.tier])

  useEffect(() => {
    post_pwa_debug({
      event: 'pwa_install_prompt_available',
      ...debug_base,
      prompt_available: has_prompt,
      phase: 'pwa_install_modal',
    })
  }, [debug_base, has_prompt])

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
      phase: 'pwa_install_modal',
    })

    try {
      await prompt.prompt()
      const choice = await prompt.userChoice

      if (choice.outcome !== 'accepted') {
        post_pwa_debug({
          event: 'pwa_install_dismissed',
          ...debug_base,
          phase: 'pwa_install_modal',
        })
        return
      }

      post_pwa_debug({
        event: 'pwa_install_accepted',
        ...debug_base,
        source_channel: 'pwa',
        has_beforeinstallprompt: false,
        is_standalone: true,
        phase: 'pwa_install_modal',
      })

      set_pwa_source_channel_cookie()
      clear_retained_before_install_prompt()
      set_standalone_now(true)
    } catch (error) {
      post_pwa_debug({
        event: 'pwa_install_failed',
        ...debug_base,
        error_message: error instanceof Error ? error.message : String(error),
        phase: 'pwa_install_modal',
      })
    } finally {
      set_is_busy(false)
    }
  }

  const show_badge = standalone_now

  return (
    <Pwa_install_modal_body_view
      title={panel_copy.title}
      body={panel_copy.body}
      steps={panel_copy.steps}
      primary_button_label={panel_copy.primary_button_label}
      android_chrome_install_hint={panel_copy.android_chrome_install_hint}
      close_label={panel_copy.close_label}
      show_installed_badge={show_badge}
      on_close={props.on_close}
      on_primary_press={
        panel_copy.primary_button_label
          ? () => {
              void handle_install_click()
            }
          : undefined
      }
      primary_busy={is_busy}
    />
  )
}
