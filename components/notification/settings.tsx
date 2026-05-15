'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'

import type { locale_key } from '@/lib/locale/action'
import OverlayRoot from '@/components/overlay/root'
import Pwa_install_modal_body from '@/components/pwa/install_modal_body'
import { post_pwa_debug, register_push_subscription } from '@/lib/pwa/client'

type notification_kind_key = 'chat' | 'reservation' | 'announcement'
type notification_tab = 'notices' | 'settings'
type pwa_debug_input = Parameters<typeof post_pwa_debug>[0]

type notification_preferences = {
  primary_channel: 'push' | 'line' | 'none'
  pwa_push_enabled: boolean
  line_enabled: boolean
  kinds: Record<notification_kind_key, boolean>
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
}

const default_preferences: notification_preferences = {
  primary_channel: 'line',
  pwa_push_enabled: false,
  line_enabled: true,
  kinds: {
    chat: true,
    reservation: true,
    announcement: true,
  },
}

function apply_push_channel_on(
  prev: notification_preferences,
): notification_preferences {
  return {
    ...prev,
    primary_channel: 'push',
    pwa_push_enabled: true,
    line_enabled: false,
  }
}

function apply_push_channel_off(
  prev: notification_preferences,
): notification_preferences {
  return {
    ...prev,
    primary_channel: 'none',
    pwa_push_enabled: false,
    line_enabled: false,
  }
}

function apply_line_channel_on(
  prev: notification_preferences,
): notification_preferences {
  return {
    ...prev,
    primary_channel: 'line',
    line_enabled: true,
    pwa_push_enabled: false,
  }
}

function apply_line_channel_off(
  prev: notification_preferences,
): notification_preferences {
  return {
    ...prev,
    primary_channel: 'none',
    line_enabled: false,
    pwa_push_enabled: false,
  }
}

const content = {
  title: {
    ja: '\u304A\u77E5\u3089\u305B',
    en: 'Notifications',
    es: 'Avisos',
  },
  notices_tab: {
    ja: '\u304A\u77E5\u3089\u305B\u4E00\u89A7',
    en: 'Notices',
    es: 'Avisos',
  },
  settings_tab: {
    ja: '\u901A\u77E5\u8A2D\u5B9A',
    en: 'Settings',
    es: 'Ajustes',
  },
  empty_notices: {
    ja: '\u304A\u77E5\u3089\u305B\u306F\u3042\u308A\u307E\u305B\u3093',
    en: 'No notices',
    es: 'No hay avisos',
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
  content_heading: {
    ja: '\u901A\u77E5\u3059\u308B\u5185\u5BB9',
    en: 'Notification content',
    es: 'Contenido de aviso',
  },
  chat: {
    ja: '\u65B0\u3057\u3044\u30C1\u30E3\u30C3\u30C8',
    en: 'New chat',
    es: 'Nuevo chat',
  },
  reservation: {
    ja: '\u4E88\u7D04\u901A\u77E5',
    en: 'Reservation notifications',
    es: 'Avisos de reservas',
  },
  announcement: {
    ja: '\u904B\u55B6\u304B\u3089\u306E\u304A\u77E5\u3089\u305B',
    en: 'Announcements',
    es: 'Avisos del equipo',
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
}

function is_standalone_display() {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function Toggle(props: {
  checked: boolean
  disabled?: boolean
  label: string
  is_last?: boolean
  on_change: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.on_change(!props.checked)}
      className={[
        'flex w-full items-center justify-between gap-4 px-4 py-3 text-left disabled:opacity-60',
        props.is_last ? '' : 'border-b border-[#f0e3d8]',
      ].join(' ')}
    >
      <span className="text-[14px] font-medium leading-[1.45] text-[#2a1d18]">
        {props.label}
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
  const [active_tab, set_active_tab] = useState<notification_tab>('notices')
  const [preferences, set_preferences] =
    useState<notification_preferences>(default_preferences)
  const [is_saving, set_is_saving] = useState(false)
  const [message, set_message] = useState<string | null>(null)
  const [install_guide_open, set_install_guide_open] = useState(false)

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
      is_standalone: is_standalone_display(),
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

  const save_preferences = useCallback(
    async (next_preferences: notification_preferences) => {
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
        body: JSON.stringify({ preferences: next_preferences }),
      })

      if (!response.ok) {
        set_is_saving(false)
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
      } | null
      const saved_preferences = payload?.preferences ?? next_preferences

      set_preferences(saved_preferences)
      set_is_saving(false)
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
    },
    [debug_payload, preferences],
  )

  useEffect(() => {
    let cancelled = false

    fetch('/api/notification/settings', {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { preferences?: notification_preferences } | null) => {
        if (!cancelled && payload?.preferences) {
          set_preferences(payload.preferences)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  function change_tab(next_tab: notification_tab) {
    set_active_tab(next_tab)
    post_pwa_debug({
      event: 'notification_tab_changed',
      ...debug_payload({
        phase: next_tab,
      }),
    })
  }

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

        await save_preferences(apply_push_channel_off(preferences))
      } catch {
        await save_preferences(apply_push_channel_off(preferences))
      }

      return
    }

    const standalone = is_standalone_display()

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
      await save_preferences(apply_push_channel_on(preferences))
    } catch {
      set_message(content.save_failed[props.locale])
    }
  }

  async function set_line_enabled(enabled: boolean) {
    set_message(null)
    const next = enabled
      ? apply_line_channel_on(preferences)
      : apply_line_channel_off(preferences)

    try {
      await save_preferences(next)
    } catch {
      set_message(content.save_failed[props.locale])
    }
  }

  async function set_kind_enabled(
    key: notification_kind_key,
    enabled: boolean,
  ) {
    try {
      await save_preferences({
        ...preferences,
        kinds: {
          ...preferences.kinds,
          [key]: enabled,
        },
      })
    } catch {
      set_message(content.save_failed[props.locale])
    }
  }

  const tab_class = (tab: notification_tab) =>
    [
      'h-10 flex-1 rounded-[8px] text-[13px] font-semibold transition-colors',
      active_tab === tab
        ? 'bg-[#2a1d18] text-white'
        : 'bg-white text-[#6d5c52]',
    ].join(' ')

  return (
    <>
      <div className="relative w-[92%] max-w-[430px] overflow-hidden rounded-[24px] bg-[#fdfaf8] px-6 py-6 shadow-[0_12px_40px_rgba(42,29,24,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[21px] font-semibold leading-[1.35] text-[#2a1d18]">
            {content.title[props.locale]}
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

      <div className="mt-5 flex rounded-[10px] bg-[#f2e7df] p-1">
        <button
          type="button"
          className={tab_class('notices')}
          onClick={() => change_tab('notices')}
        >
          {content.notices_tab[props.locale]}
        </button>
        <button
          type="button"
          className={tab_class('settings')}
          onClick={() => change_tab('settings')}
        >
          {content.settings_tab[props.locale]}
        </button>
      </div>

      {active_tab === 'notices' ? (
        <div className="mt-6 rounded-[8px] border border-[#eadbd0] bg-white px-4 py-5">
          <p className="text-[14px] leading-[1.7] text-[#6d5c52]">
            {content.empty_notices[props.locale]}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 space-y-5">
            <section className="rounded-[8px] border border-[#eadbd0] bg-white">
              <h3 className="px-4 pb-1 pt-3 text-[13px] font-semibold leading-[1.4] text-[#6d5c52]">
                {content.method_heading[props.locale]}
              </h3>

              <div>
                <Toggle
                  label={content.pwa_push[props.locale]}
                  checked={preferences.pwa_push_enabled}
                  disabled={is_saving}
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

            <section className="rounded-[8px] border border-[#eadbd0] bg-white">
              <h3 className="px-4 pb-1 pt-3 text-[13px] font-semibold leading-[1.4] text-[#6d5c52]">
                {content.content_heading[props.locale]}
              </h3>

              <div>
                <Toggle
                  label={content.chat[props.locale]}
                  checked={preferences.kinds.chat}
                  disabled={is_saving}
                  on_change={(enabled) => set_kind_enabled('chat', enabled)}
                />
                <Toggle
                  label={content.reservation[props.locale]}
                  checked={preferences.kinds.reservation}
                  disabled={is_saving}
                  on_change={(enabled) => set_kind_enabled('reservation', enabled)}
                />
                <Toggle
                  label={content.announcement[props.locale]}
                  checked={preferences.kinds.announcement}
                  disabled={is_saving}
                  is_last
                  on_change={(enabled) => set_kind_enabled('announcement', enabled)}
                />
              </div>
            </section>
          </div>

          {message || is_saving ? (
            <p className="mt-4 text-[13px] leading-[1.6] text-[#8a7568]">
              {is_saving ? content.saving[props.locale] : message}
            </p>
          ) : null}
        </>
      )}
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
