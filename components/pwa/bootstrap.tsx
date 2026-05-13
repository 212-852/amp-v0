'use client'

import { useEffect, useRef } from 'react'

import {
  build_pwa_diagnostic_payload,
  capture_before_install_prompt,
  get_retained_before_install_prompt,
  is_standalone_pwa,
  load_pwa_manifest_for_debug,
  log_pwa_installability_state,
  post_pwa_debug,
  post_pwa_installability_checked,
  register_pwa_service_worker_with_debug,
  set_pwa_source_channel_cookie,
  type pwa_manifest_probe_result,
} from '@/lib/pwa/client'

export default function PwaBootstrap() {
  const probe_cache_ref = useRef<pwa_manifest_probe_result | null>(null)
  const sw_registered_ref = useRef(false)

  useEffect(() => {
    let cancelled = false
    const missing_timer_ref = { id: null as number | null }
    const standalone = is_standalone_pwa()

    if (standalone) {
      set_pwa_source_channel_cookie()
    }

    void (async () => {
      const manifest = await load_pwa_manifest_for_debug()

      if (cancelled) {
        return
      }

      probe_cache_ref.current = manifest

      post_pwa_debug({
        event: 'pwa_manifest_loaded',
        phase: 'pwa_bootstrap',
        ...build_pwa_diagnostic_payload({
          manifest_exists: manifest.manifest_exists,
          manifest_valid: manifest.manifest_valid,
          manifest_url: manifest.manifest_url,
        }),
      })

      const registration = await register_pwa_service_worker_with_debug()

      if (cancelled) {
        return
      }

      sw_registered_ref.current = Boolean(registration)

      post_pwa_installability_checked({
        manifest_exists: manifest.manifest_exists,
        manifest_valid: manifest.manifest_valid,
        manifest_url: manifest.manifest_url,
        service_worker_registered: sw_registered_ref.current,
        has_beforeinstallprompt: Boolean(get_retained_before_install_prompt()),
      })

      log_pwa_installability_state({
        phase: 'bootstrap_probe_complete',
        has_beforeinstallprompt: Boolean(get_retained_before_install_prompt()),
        service_worker_registered: sw_registered_ref.current,
      })

      missing_timer_ref.id = window.setTimeout(() => {
        if (!get_retained_before_install_prompt()) {
          post_pwa_debug({
            event: 'pwa_beforeinstallprompt_missing',
            phase: 'pwa_bootstrap',
            ...build_pwa_diagnostic_payload({
              manifest_exists: manifest.manifest_exists,
              manifest_valid: manifest.manifest_valid,
              manifest_url: manifest.manifest_url,
              service_worker_registered: sw_registered_ref.current,
              has_beforeinstallprompt: false,
            }),
          })
        }
      }, 15_000)
    })()

    function clear_missing_timer() {
      if (missing_timer_ref.id !== null) {
        window.clearTimeout(missing_timer_ref.id)
        missing_timer_ref.id = null
      }
    }

    function handle_before_install_prompt(event: Event) {
      clear_missing_timer()
      capture_before_install_prompt(event)

      const cached = probe_cache_ref.current

      post_pwa_installability_checked({
        manifest_exists: cached?.manifest_exists ?? null,
        manifest_valid: cached?.manifest_valid ?? null,
        manifest_url: cached?.manifest_url ?? null,
        service_worker_registered: sw_registered_ref.current,
        has_beforeinstallprompt: true,
      })

      log_pwa_installability_state({
        phase: 'beforeinstallprompt',
        has_beforeinstallprompt: true,
        service_worker_registered: sw_registered_ref.current,
      })

      post_pwa_debug({
        event: 'pwa_install_prompt_available',
        phase: 'beforeinstallprompt',
        ...build_pwa_diagnostic_payload({
          manifest_exists: cached?.manifest_exists ?? null,
          manifest_valid: cached?.manifest_valid ?? null,
          manifest_url: cached?.manifest_url ?? null,
          service_worker_registered: sw_registered_ref.current,
          has_beforeinstallprompt: true,
        }),
      })
    }

    function handle_app_installed() {
      clear_missing_timer()

      const cached = probe_cache_ref.current

      post_pwa_debug({
        event: 'pwa_install_completed',
        phase: 'appinstalled',
        ...build_pwa_diagnostic_payload({
          manifest_exists: cached?.manifest_exists ?? null,
          manifest_valid: cached?.manifest_valid ?? null,
          manifest_url: cached?.manifest_url ?? null,
          service_worker_registered: sw_registered_ref.current,
          has_beforeinstallprompt: false,
        }),
        source_channel: 'pwa',
        is_standalone: true,
      })
    }

    window.addEventListener('beforeinstallprompt', handle_before_install_prompt)
    window.addEventListener('appinstalled', handle_app_installed)

    return () => {
      cancelled = true
      clear_missing_timer()
      window.removeEventListener(
        'beforeinstallprompt',
        handle_before_install_prompt,
      )
      window.removeEventListener('appinstalled', handle_app_installed)
    }
  }, [])

  return null
}
