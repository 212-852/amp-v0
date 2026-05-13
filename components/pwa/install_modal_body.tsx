'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  clear_retained_before_install_prompt,
  get_retained_before_install_prompt,
  is_standalone_pwa,
  manifest_is_available,
  post_pwa_debug,
  set_pwa_source_channel_cookie,
  use_before_install_prompt_state,
} from '@/lib/pwa/client'
import {
  normalize_pwa_install_share_url,
  resolve_pwa_install_modal_ios_assist_copy,
  resolve_pwa_install_modal_panel_copy,
  resolve_pwa_install_ui_locale,
} from '@/lib/pwa/copy'
import { resolve_pwa_install_client_os } from '@/lib/pwa/rules'
import type { locale_key } from '@/lib/locale/action'

import Pwa_install_modal_body_view from '@/components/pwa/modal/body'

function copy_url_via_exec_command(text: string): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  const ta = document.createElement('textarea')

  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.left = '0'
  ta.style.top = '0'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()

  let ok = false

  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }

  document.body.removeChild(ta)

  return ok
}

type pwa_install_modal_body_props = {
  role: string | null
  tier: string | null
  session_locale: string | null | undefined
  client_locale_fallback: locale_key
  source_channel: string | null
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
  const {
    client_locale_fallback,
    on_close,
    role,
    session_locale,
    source_channel,
    tier,
  } = props
  const prompt = use_before_install_prompt_state()
  const has_prompt = Boolean(prompt)
  const [is_busy, set_is_busy] = useState(false)
  const [share_url, set_share_url] = useState('')
  const [toast_visible, set_toast_visible] = useState(false)
  const toast_timer_ref = useRef<number | null>(null)
  const [standalone_now, set_standalone_now] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return is_standalone_pwa()
  })

  const is_liff = source_channel === 'liff'

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    set_share_url(normalize_pwa_install_share_url(window.location.href))
  }, [])

  useEffect(() => {
    return () => {
      if (toast_timer_ref.current !== null) {
        window.clearTimeout(toast_timer_ref.current)
      }
    }
  }, [])

  const user_agent =
    typeof navigator === 'undefined' ? null : navigator.userAgent

  const client_os = useMemo(
    () => resolve_pwa_install_client_os(user_agent),
    [user_agent],
  )

  const pwa_ui_locale = useMemo(
    () =>
      resolve_pwa_install_ui_locale({
        session_locale,
        client_locale_fallback,
      }),
    [client_locale_fallback, session_locale],
  )

  const panel_copy = useMemo(
    () =>
      resolve_pwa_install_modal_panel_copy({
        locale: pwa_ui_locale.locale,
        client_os,
        standalone: standalone_now,
        has_before_install_prompt: has_prompt,
      }),
    [client_os, has_prompt, pwa_ui_locale.locale, standalone_now],
  )

  const debug_base = useMemo(
    () => ({
      role,
      tier,
      source_channel: source_channel ?? resolve_pwa_debug_channel(),
      locale: pwa_ui_locale.locale,
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
    [
      has_prompt,
      pwa_ui_locale.locale,
      role,
      source_channel,
      standalone_now,
      tier,
    ],
  )

  const interaction_debug = useMemo(
    () => ({
      ...debug_base,
      current_url: share_url,
      is_ios: client_os === 'ios',
      is_liff,
    }),
    [client_os, debug_base, is_liff, share_url],
  )

  const ios_assist_strings = useMemo(
    () => resolve_pwa_install_modal_ios_assist_copy({ locale: pwa_ui_locale.locale }),
    [pwa_ui_locale.locale],
  )

  useEffect(() => {
    post_pwa_debug({
      event: 'pwa_install_locale_resolved',
      phase: 'pwa_install_modal',
      locale: pwa_ui_locale.locale,
      fallback_used: pwa_ui_locale.fallback_used,
      source_channel: source_channel ?? resolve_pwa_debug_channel(),
      role,
      tier,
    })
  }, [
    pwa_ui_locale.fallback_used,
    pwa_ui_locale.locale,
    role,
    source_channel,
    tier,
  ])

  useEffect(() => {
    const ua =
      typeof navigator === 'undefined' ? null : navigator.userAgent
    const os = resolve_pwa_install_client_os(ua)
    const standalone = is_standalone_pwa()
    const prompt_ok = Boolean(get_retained_before_install_prompt())
    const base = {
      role,
      tier,
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
  }, [role, tier])

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
      on_close()
    }

    window.addEventListener('appinstalled', handle_app_installed)

    return () => {
      window.removeEventListener('appinstalled', handle_app_installed)
    }
  }, [debug_base, on_close])

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

  const handle_copy_url = useCallback(async () => {
    if (!share_url.trim()) {
      return
    }

    post_pwa_debug({
      event: 'pwa_install_copy_clicked',
      ...interaction_debug,
      phase: 'pwa_install_modal',
    })

    try {
      if (typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(share_url)
      } else if (!copy_url_via_exec_command(share_url)) {
        throw new Error('clipboard_copy_failed')
      }

      post_pwa_debug({
        event: 'pwa_install_copy_succeeded',
        ...interaction_debug,
        phase: 'pwa_install_modal',
      })

      if (toast_timer_ref.current !== null) {
        window.clearTimeout(toast_timer_ref.current)
      }

      set_toast_visible(true)
      toast_timer_ref.current = window.setTimeout(() => {
        set_toast_visible(false)
        toast_timer_ref.current = null
      }, 2000)
    } catch (error) {
      post_pwa_debug({
        event: 'pwa_install_copy_failed',
        ...interaction_debug,
        phase: 'pwa_install_modal',
        error_code: 'clipboard_copy_failed',
        error_message:
          error instanceof Error ? error.message : String(error),
      })
    }
  }, [interaction_debug, share_url])

  const handle_open_safari = useCallback(() => {
    if (!share_url.trim()) {
      return
    }

    post_pwa_debug({
      event: 'pwa_install_open_safari_clicked',
      ...interaction_debug,
      phase: 'pwa_install_modal',
    })

    window.open(share_url, '_blank', 'noopener,noreferrer')

    post_pwa_debug({
      event: 'pwa_install_open_safari_succeeded',
      ...interaction_debug,
      phase: 'pwa_install_modal',
    })
  }, [interaction_debug, share_url])

  const ios_install_assist =
    client_os === 'ios' && !standalone_now && share_url.trim().length > 0
      ? {
          strings: ios_assist_strings,
          current_url: share_url,
          toast_visible,
          on_copy: () => {
            void handle_copy_url()
          },
          on_open_safari: handle_open_safari,
        }
      : null

  const show_badge = standalone_now

  return (
    <Pwa_install_modal_body_view
      title={panel_copy.title}
      body={panel_copy.body}
      steps={panel_copy.steps}
      primary_button_label={panel_copy.primary_button_label}
      android_chrome_install_hint={panel_copy.android_chrome_install_hint}
      close_label={panel_copy.close_label}
      close_aria_label={panel_copy.close_aria_label}
      installed_badge_label={panel_copy.installed_badge_label}
      show_installed_badge={show_badge}
      ios_install_assist={ios_install_assist}
      on_close={on_close}
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
