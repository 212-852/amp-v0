'use client'

import { useEffect } from 'react'

import {
  capture_before_install_prompt,
  is_standalone_pwa,
  log_pwa_installability_state,
  manifest_is_available,
  post_pwa_debug,
  register_pwa_service_worker,
  set_pwa_source_channel_cookie,
} from '@/lib/pwa/client'

export default function PwaBootstrap() {
  useEffect(() => {
    const standalone = is_standalone_pwa()

    if (standalone) {
      set_pwa_source_channel_cookie()
    }

    let service_worker_registered = false

    void register_pwa_service_worker().then((registration) => {
      service_worker_registered = Boolean(registration)
      log_pwa_installability_state({
        phase: 'bootstrap_service_worker',
        has_beforeinstallprompt: false,
        service_worker_registered,
      })
    })

    function handle_before_install_prompt(event: Event) {
      capture_before_install_prompt(event)

      log_pwa_installability_state({
        phase: 'beforeinstallprompt',
        has_beforeinstallprompt: true,
        service_worker_registered,
      })

      post_pwa_debug({
        event: 'pwa_beforeinstallprompt_received',
        source_channel: standalone ? 'pwa' : 'web',
        has_beforeinstallprompt: true,
        is_standalone: standalone,
        manifest_available: manifest_is_available(),
        service_worker_registered,
        user_agent: navigator.userAgent,
        app_visibility_state: document.visibilityState,
        phase: 'beforeinstallprompt',
      })
    }

    function handle_app_installed() {
      post_pwa_debug({
        event: 'pwa_install_completed',
        source_channel: 'pwa',
        has_beforeinstallprompt: false,
        is_standalone: true,
        manifest_available: manifest_is_available(),
        service_worker_registered,
        user_agent: navigator.userAgent,
        app_visibility_state: document.visibilityState,
        phase: 'appinstalled',
      })
    }

    window.addEventListener('beforeinstallprompt', handle_before_install_prompt)
    window.addEventListener('appinstalled', handle_app_installed)

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handle_before_install_prompt,
      )
      window.removeEventListener('appinstalled', handle_app_installed)
    }
  }, [])

  return null
}
