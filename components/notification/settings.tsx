'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'

import type { locale_key } from '@/lib/locale/action'
import OverlayRoot from '@/components/overlay/root'
import Pwa_install_modal_body from '@/components/pwa/install_modal_body'
import {
  post_pwa_debug,
  register_push_subscription,
  resolve_pwa_install_state,
} from '@/lib/pwa/client'
import {
  enforce_notification_method_selection,
  type notification_method_trigger,
} from '@/lib/notification/settings_core'

type pwa_debug_input = Parameters<typeof post_pwa_debug>[0]

type notification_preferences = {
  primary_channel: 'push' | 'line' | 'none'
  pwa_push_enabled: boolean
  line_enabled: boolean
}

type notification_settings_props = {
  locale: locale_key
  user_uuid: string | null
  participant_uuid: string | null
  room_uuid: string | null
  role: string | null
  tier: string | null
  source_channel: string | null
  on_close: () => void
  settings_only?: boolean
}

const default_preferences: notification_preferences = {
  primary_channel: 'line',
  pwa_push_enabled: false,
  line_enabled: true,
}

function apply_push_channel_on(
  prev: notification_preferences,
): notification_preferences {
  return {
    ...prev,
    pwa_push_enabled: true,
    primary_channel: prev.line_enabled ? 'push' : 'push',
    line_enabled: prev.line_enabled,
  }
}

function apply_push_channel_off(
  prev: notification_preferences,
): notification_preferences {
  return {
    ...prev,
    pwa_push_enabled: false,
    primary_channel: prev.line_enabled ? 'line' : 'none',
    line_enabled: prev.line_enabled,
  }
}

function resolve_next_preferences(input: {
  previous: notification_preferences
  next: notification_preferences
  trigger_method: notification_method_trigger
  pwa_available?: boolean | null
}) {
  return enforce_notification_method_selection({
    previous: input.previous,
    next: input.next,
    trigger_method: input.trigger_method,
    pwa_available: input.pwa_available,
  })
}

function apply_line_channel_on(
  prev: notification_preferences,
): notification_preferences {
  return {
    ...prev,
    line_enabled: true,
    primary_channel: prev.pwa_push_enabled ? 'push' : 'line',
    pwa_push_enabled: prev.pwa_push_enabled,
  }
}

function apply_line_channel_off(
  prev: notification_preferences,
): notification_preferences {
  return {
    ...prev,
    line_enabled: false,
    primary_channel: prev.pwa_push_enabled ? 'push' : 'none',
    pwa_push_enabled: prev.pwa_push_enabled,
  }
}

const content = {
  title: {
    ja: '\u304A\u77E5\u3089\u305B',
    en: 'Notifications',
    es: 'Avisos',
  },
  settings_tab: {
    ja: '\u901A\u77E5\u8A2D\u5B9A',
    en: 'Settings',
    es: 'Ajustes',
  },
  pwa_push: {
    ja: 'PWA\u30D7\u30C3\u30B7\u30E5\u901A\u77E5',
    en: 'PWA push notifications',
    es: 'Notificaciones push PWA',
  },
  line: {
    ja: 'LINE\u901A\u77E5',
    en: 'LINE notifications',
    es: 'Avisos de LINE',
  },
  method_heading: {
    ja: '\u901A\u77E5\u65B9\u6CD5',
    en: 'Notification method',
    es: 'Metodo de aviso',
  },
  standalone_required: {
    ja: 'PWA\u30D7\u30C3\u30B7\u30E5\u901A\u77E5\u306F\u30DB\u30FC\u30E0\u753B\u9762\u306E\u30A2\u30D7\u30EA\u304B\u3089\u6709\u52B9\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002',
    en: 'Enable PWA push notifications from the installed Home Screen app.',
    es: 'Activa las notificaciones push desde la app instalada.',
  },
  denied: {
    ja: '\u30D6\u30E9\u30A6\u30B6\u30FC\u306E\u8A2D\u5B9A\u3067\u901A\u77E5\u304C\u30D6\u30ED\u30C3\u30AF\u3055\u308C\u3066\u3044\u307E\u3059\u3002',
    en: 'Notifications are blocked in browser settings.',
    es: 'Las notificaciones estan bloqueadas en el navegador.',
  },
  unsupported: {
    ja: '\u3053\u306E\u74B0\u5883\u3067\u306F\u30D7\u30C3\u30B7\u30E5\u901A\u77E5\u3092\u4F7F\u3048\u307E\u305B\u3093\u3002',
    en: 'Push notifications are not available here.',
    es: 'Las notificaciones push no estan disponibles aqui.',
  },
  saving: {
    ja: '\u4FDD\u5B58\u4E2D',
    en: 'Saving',
    es: 'Guardando',
  },
  save_failed: {
    ja: '\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002',
    en: 'Could not save the setting.',
    es: 'No se pudo guardar el ajuste.',
  },
  auto_adjusted: {
    ja: '\u901A\u77E5\u65B9\u6CD5\u3092\u81EA\u52D5\u8ABF\u6574\u3057\u307E\u3057\u305F',
    en: 'Notification methods were adjusted automatically',
    es: 'Los metodos de notificacion se ajustaron automaticamente',
  },
  pwa_install_required: {
    ja: 'PWA\u30A2\u30D7\u30EA\u3092\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u3059\u308B\u3068\u5229\u7528\u3067\u304D\u307E\u3059',
    en: 'Available after installing the PWA app',
    es: 'Disponible despues de instalar la aplicacion PWA',
  },
}

function Toggle(props: {
  checked: boolean
  disabled?: boolean
  label: string
  helper_text?: string | null
  is_last?: boolean
  on_change: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.on_change(!props.checked)}
      className={[
        'flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
        props.is_last ? '' : 'border-b border-[#f0e3d8]',
      ].join(' ')}
    >
      <span>
        <span className="block text-[14px] font-medium leading-[1.45] text-[#2a1d18]">
          {props.label}
        </span>
        {props.helper_text ? (
          <span className="mt-1 block text-[12px] font-medium leading-[1.45] text-[#9a877a]">
            {props.helper_text}
          </span>
        ) : null}
      </span>
      <span
        className={[
          'relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors',
          props.checked ? 'bg-[#2f7d5b]' : 'bg-[#cbbbae]',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-[3px] h-5 w-5 rounded-full bg-white transition-transform',
            props.checked ? 'translate-x-[23px]' : 'translate-x-[3px]',
          ].join(' ')}
        />
      </span>
    </button>
  )
}

export default function NotificationSettings(props: notification_settings_props) {
  const settings_only = props.settings_only === true
  const [preferences, set_preferences] =
    useState<notification_preferences>(default_preferences)
  const [is_saving, set_is_saving] = useState(false)
  const [message, set_message] = useState<string | null>(null)
  const [install_guide_open, set_install_guide_open] = useState(false)
  const [pwa_install_state, set_pwa_install_state] = useState(() =>
    resolve_pwa_install_state(),
  )
  const pwa_toggle_disabled = !pwa_install_state.installed

  const debug_payload = useCallback(
    (
      extra: Partial<pwa_debug_input> = {},
    ): Omit<pwa_debug_input, 'event'> => ({
      user_uuid: props.user_uuid,
      participant_uuid: props.participant_uuid,
      room_uuid: props.room_uuid,
      role: props.role,
      tier: props.tier,
      source_channel: props.source_channel ?? 'pwa',
      is_standalone: resolve_pwa_install_state().installed,
      display_mode: resolve_pwa_install_state().display_mode,
      navigator_standalone: resolve_pwa_install_state().navigator_standalone,
      phase: 'notification_settings',
      ...extra,
    }),
    [
      props.participant_uuid,
      props.role,
      props.room_uuid,
      props.source_channel,
      props.tier,
      props.user_uuid,
    ],
  )

  useEffect(() => {
    const state = resolve_pwa_install_state()
    const toggle_disabled_reason = state.installed ? null : 'pwa_not_installed'

    set_pwa_install_state(state)

    post_pwa_debug({
      event: 'pwa_install_state_checked',
      ...debug_payload({
        is_standalone: state.installed,
        display_mode: state.display_mode,
        navigator_standalone: state.navigator_standalone,
        toggle_disabled_reason,
        phase: 'notification_settings',
      }),
    })

    post_pwa_debug({
      event: state.installed
        ? 'pwa_notification_toggle_nstalled'
        : 'pwa_notification_toggle_disabled',
      ...debug_payload({
        is_standalone: state.installed,
        display_mode: state.display_mode,
        navigator_standalone: state.navigator_standalone,
        toggle_disabled_reason,
        phase: 'notification_settings',
      }),
    })

    function handle_app_installed() {
      const next_state = resolve_pwa_install_state()

      set_pwa_install_state(next_state)
      post_pwa_debug({
        event: 'pwa_install_state_checked',
        ...debug_payload({
          is_standalone: next_state.installed,
          display_mode: next_state.display_mode,
          navigator_standalone: next_state.navigator_standalone,
          toggle_disabled_reason: next_state.installed
            ? null
            : 'pwa_not_installed',
          phase: 'notification_settings_appinstalled',
        }),
      })
    }

    window.addEventListener('appinstalled', handle_app_installed)

    return () => {
      window.removeEventListener('appinstalled', handle_app_installed)
    }
  }, [debug_payload])

  const save_preferences = useCallback(
    async (
      next_preferences: notification_preferences,
      trigger_method: notification_method_trigger,
      auto_adjusted: boolean,
    ) => {
      const previous_preferences = preferences

      set_preferences(next_preferences)
      set_is_saving(true)

      if (next_preferences.primary_channel !== preferences.primary_channel) {
        post_pwa_debug({
          event: 'notification_primary_channel_changed',
          ...debug_payload({
            from_primary_channel: preferences.primary_channel,
            to_primary_channel: next_preferences.primary_channel,
            primary_channel: next_preferences.primary_channel,
            push_enabled: next_preferences.pwa_push_enabled,
            line_enabled: next_preferences.line_enabled,
            selected_route:
              next_preferences.primary_channel === 'none'
                ? null
                : next_preferences.primary_channel,
            skipped_reason:
              next_preferences.primary_channel === 'none'
                ? 'primary_channel_none'
                : null,
            phase: 'notification_settings',
          }),
        })
      }

      post_pwa_debug({
        event: 'notification_setting_save_started',
        ...debug_payload({
          enabled: next_preferences.pwa_push_enabled,
          primary_channel: next_preferences.primary_channel,
          push_enabled: next_preferences.pwa_push_enabled,
          line_enabled: next_preferences.line_enabled,
          selected_route:
            next_preferences.primary_channel === 'none'
              ? null
              : next_preferences.primary_channel,
          skipped_reason:
            next_preferences.primary_channel === 'none'
              ? 'primary_channel_none'
              : null,
          phase: 'notification_settings',
        }),
      })

      const response = await fetch('/api/notification/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          preferences: next_preferences,
          trigger_method,
        }),
      })

      if (!response.ok) {
        set_is_saving(false)
        set_preferences(previous_preferences)
        post_pwa_debug({
          event: 'notification_setting_save_failed',
          ...debug_payload({
            enabled: next_preferences.pwa_push_enabled,
            primary_channel: next_preferences.primary_channel,
            push_enabled: next_preferences.pwa_push_enabled,
            line_enabled: next_preferences.line_enabled,
            selected_route:
              next_preferences.primary_channel === 'none'
                ? null
                : next_preferences.primary_channel,
            skipped_reason:
              next_preferences.primary_channel === 'none'
                ? 'primary_channel_none'
                : null,
            error_code: `http_${response.status}`,
            error_message: 'notification_setting_save_failed',
            phase: 'notification_settings',
          }),
        })
        throw new Error(`notification_settings_http_${response.status}`)
      }

      const payload = (await response.json().catch(() => null)) as {
        preferences?: notification_preferences
        auto_adjusted?: boolean
      } | null
      const saved_preferences = payload?.preferences ?? next_preferences

      set_preferences({
        primary_channel: saved_preferences.primary_channel,
        pwa_push_enabled: saved_preferences.pwa_push_enabled,
        line_enabled: saved_preferences.line_enabled,
      })
      set_is_saving(false)
      if (auto_adjusted || payload?.auto_adjusted === true) {
        set_message(content.auto_adjusted[props.locale])
      }
      post_pwa_debug({
        event: 'notification_setting_save_succeeded',
        ...debug_payload({
          enabled: saved_preferences.pwa_push_enabled,
          primary_channel: saved_preferences.primary_channel,
          push_enabled: saved_preferences.pwa_push_enabled,
          line_enabled: saved_preferences.line_enabled,
          selected_route:
            saved_preferences.primary_channel === 'none'
              ? null
              : saved_preferences.primary_channel,
          skipped_reason:
            saved_preferences.primary_channel === 'none'
              ? 'primary_channel_none'
              : null,
          phase: 'notification_settings',
        }),
      })

      if (settings_only) {
        post_pwa_debug({
          event: 'admin_notification_settings_saved',
          ...debug_payload({
            enabled: saved_preferences.pwa_push_enabled,
            primary_channel: saved_preferences.primary_channel,
            push_enabled: saved_preferences.pwa_push_enabled,
            line_enabled: saved_preferences.line_enabled,
            phase: 'admin_notification_settings',
          }),
        })
      }
    },
    [debug_payload, preferences, props.locale, settings_only],
  )

  useEffect(() => {
    if (!settings_only) {
      return
    }

    post_pwa_debug({
      event: 'admin_notification_settings_rendered',
      ...debug_payload({
        phase: 'admin_notification_settings',
      }),
    })
  }, [debug_payload, settings_only])

  useEffect(() => {
    let cancelled = false

    fetch('/api/notification/settings', {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { preferences?: notification_preferences } | null) => {
        if (!cancelled && payload?.preferences) {
          set_preferences({
            primary_channel: payload.preferences.primary_channel,
            pwa_push_enabled: payload.preferences.pwa_push_enabled,
            line_enabled: payload.preferences.line_enabled,
          })
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  async function set_push_enabled(enabled: boolean) {
    set_message(null)
    post_pwa_debug({
      event: 'push_toggle_clicked',
      ...debug_payload({
        enabled,
        permission:
          typeof Notification !== 'undefined' ? Notification.permission : null,
        phase: 'notification_settings',
      }),
    })

    if (!enabled) {
      const adjustment = resolve_next_preferences({
        previous: preferences,
        next: apply_push_channel_off(preferences),
        trigger_method: 'pwa',
        pwa_available: pwa_install_state.installed,
      })

      try {
        const registration =
          'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null
        const subscription =
          registration ? await registration.pushManager.getSubscription() : null

        if (subscription) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          })
          await subscription.unsubscribe()
        }

        await save_preferences(
          adjustment.preferences,
          'pwa',
          adjustment.auto_adjusted,
        )
      } catch {
        await save_preferences(
          adjustment.preferences,
          'pwa',
          adjustment.auto_adjusted,
        )
      }

      return
    }

    if (pwa_toggle_disabled) {
      post_pwa_debug({
        event: 'pwa_notification_toggle_disabled',
        ...debug_payload({
          enabled,
          is_standalone: pwa_install_state.installed,
          display_mode: pwa_install_state.display_mode,
          navigator_standalone: pwa_install_state.navigator_standalone,
          toggle_disabled_reason: 'pwa_not_installed',
          phase: 'notification_settings',
        }),
      })
      return
    }

    const standalone = resolve_pwa_install_state().installed

    post_pwa_debug({
      event: 'push_standalone_checked',
      ...debug_payload({
        enabled,
        is_standalone: standalone,
        phase: 'notification_settings',
      }),
    })

    if (!standalone) {
      set_message(content.standalone_required[props.locale])
      set_install_guide_open(true)
      return
    }

    const service_worker_supported =
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    const push_supported =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'PushManager' in window &&
      service_worker_supported

    post_pwa_debug({
      event: 'push_service_worker_checked',
      ...debug_payload({
        enabled,
        service_worker_supported,
        permission:
          typeof Notification !== 'undefined' ? Notification.permission : null,
        phase: 'notification_settings',
      }),
    })

    if (!push_supported) {
      set_message(content.unsupported[props.locale])
      return
    }

    const saved = await register_push_subscription({
      user_uuid: props.user_uuid,
      participant_uuid: props.participant_uuid,
      room_uuid: props.room_uuid,
      role: props.role,
      tier: props.tier,
    })

    if (!saved) {
      set_message(
        Notification.permission === 'denied'
          ? content.denied[props.locale]
          : content.save_failed[props.locale],
      )
      return
    }

    try {
      const adjustment = resolve_next_preferences({
        previous: preferences,
        next: apply_push_channel_on(preferences),
        trigger_method: 'pwa',
        pwa_available: pwa_install_state.installed,
      })

      await save_preferences(
        adjustment.preferences,
        'pwa',
        adjustment.auto_adjusted,
      )
    } catch {
      set_message(content.save_failed[props.locale])
    }
  }

  async function set_line_enabled(enabled: boolean) {
    set_message(null)
    const adjustment = resolve_next_preferences({
      previous: preferences,
      next: enabled
        ? apply_line_channel_on(preferences)
        : apply_line_channel_off(preferences),
      trigger_method: 'line',
      pwa_available: pwa_install_state.installed,
    })

    try {
      await save_preferences(
        adjustment.preferences,
        'line',
        adjustment.auto_adjusted,
      )
    } catch {
      set_message(content.save_failed[props.locale])
    }
  }

  return (
    <>
      <div className="relative w-[92%] max-w-[430px] overflow-hidden rounded-[24px] bg-[#fdfaf8] px-6 py-6 shadow-[0_12px_40px_rgba(42,29,24,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[21px] font-semibold leading-[1.35] text-[#2a1d18]">
            {settings_only
              ? content.settings_tab[props.locale]
              : content.title[props.locale]}
          </h2>

          <button
            type="button"
            onClick={props.on_close}
            aria-label="close"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
          >
            <X className="h-[24px] w-[24px] stroke-[2.1] text-[#2a1d18]" />
          </button>
        </div>

        <section className="mt-5 rounded-[8px] border border-[#eadbd0] bg-white">
          <h3 className="px-4 pb-1 pt-3 text-[13px] font-semibold leading-[1.4] text-[#6d5c52]">
            {content.method_heading[props.locale]}
          </h3>

          <div>
            <Toggle
              label={content.pwa_push[props.locale]}
              checked={preferences.pwa_push_enabled}
              disabled={is_saving || pwa_toggle_disabled}
              helper_text={
                pwa_toggle_disabled
                  ? content.pwa_install_required[props.locale]
                  : null
              }
              on_change={set_push_enabled}
            />
            <Toggle
              label={content.line[props.locale]}
              checked={preferences.line_enabled}
              disabled={is_saving}
              is_last
              on_change={set_line_enabled}
            />
          </div>
        </section>

        {message || is_saving ? (
          <p className="mt-4 text-[13px] leading-[1.6] text-[#8a7568]">
            {is_saving ? content.saving[props.locale] : message}
          </p>
        ) : null}
      </div>

      <OverlayRoot
        open={install_guide_open}
        on_close={() => set_install_guide_open(false)}
        variant="center"
      >
        <Pwa_install_modal_body
          role={props.role}
          tier={props.tier}
          session_locale={props.locale}
          client_locale_fallback={props.locale}
          source_channel={props.source_channel ?? 'web'}
          on_close={() => set_install_guide_open(false)}
        />
      </OverlayRoot>
    </>
  )
}
