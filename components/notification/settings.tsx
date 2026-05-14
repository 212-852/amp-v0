'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

import type { locale_key } from '@/lib/locale/action'
import { post_pwa_debug, register_push_subscription } from '@/lib/pwa/client'

type notification_kind_key = 'chat' | 'reservation' | 'announcement'

type notification_preferences = {
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
  pwa_push_enabled: false,
  line_enabled: true,
  kinds: {
    chat: true,
    reservation: true,
    announcement: true,
  },
}

const content = {
  title: {
    ja: '\u304A\u77E5\u3089\u305B',
    en: 'Notifications',
    es: 'Avisos',
  },
  settings: {
    ja: '\u901A\u77E5\u8A2D\u5B9A',
    en: 'Notification settings',
    es: 'Ajustes de avisos',
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
  kinds: {
    ja: '\u901A\u77E5\u7A2E\u985E',
    en: 'Notification types',
    es: 'Tipos de aviso',
  },
  chat: {
    ja: '\u65B0\u3057\u3044\u30C1\u30E3\u30C3\u30C8',
    en: 'New chat',
    es: 'Nuevo chat',
  },
  reservation: {
    ja: '\u4E88\u7D04',
    en: 'Reservations',
    es: 'Reservas',
  },
  announcement: {
    ja: '\u904B\u55B6\u304B\u3089\u306E\u304A\u77E5\u3089\u305B',
    en: 'Announcements',
    es: 'Avisos del equipo',
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
  on_change: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.on_change(!props.checked)}
      className="flex w-full items-center justify-between gap-4 rounded-[8px] border border-[#eadbd0] bg-white px-4 py-3 text-left disabled:opacity-60"
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
  const [preferences, set_preferences] =
    useState<notification_preferences>(default_preferences)
  const [is_saving, set_is_saving] = useState(false)
  const [message, set_message] = useState<string | null>(null)
  const can_push = useMemo(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return 'Notification' in window && 'PushManager' in window
  }, [])

  const save_preferences = useCallback(
    async (next_preferences: notification_preferences) => {
      set_is_saving(true)
      const response = await fetch('/api/notification/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferences: next_preferences }),
      })
      set_is_saving(false)

      if (!response.ok) {
        throw new Error(`notification_settings_http_${response.status}`)
      }

      const payload = (await response.json().catch(() => null)) as {
        preferences?: notification_preferences
      } | null

      set_preferences(payload?.preferences ?? next_preferences)
    },
    [],
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

  async function set_push_enabled(enabled: boolean) {
    set_message(null)

    if (!enabled) {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()

        if (subscription) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          })
          await subscription.unsubscribe()
        }

        await save_preferences({
          ...preferences,
          pwa_push_enabled: false,
        })
      } catch {
        await save_preferences({
          ...preferences,
          pwa_push_enabled: false,
        })
      }

      return
    }

    if (!can_push) {
      set_message(content.unsupported[props.locale])
      return
    }

    const permission = Notification.permission

    if (permission === 'default') {
      post_pwa_debug({
        event: 'push_permission_requested',
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        room_uuid: props.room_uuid,
        role: props.role,
        tier: props.tier,
        source_channel: props.source_channel ?? 'pwa',
        is_standalone: is_standalone_display(),
        phase: 'notification_settings',
      })
    }

    const next_permission =
      permission === 'default'
        ? await Notification.requestPermission()
        : permission

    if (next_permission !== 'granted') {
      post_pwa_debug({
        event: 'push_permission_denied',
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        room_uuid: props.room_uuid,
        role: props.role,
        tier: props.tier,
        source_channel: props.source_channel ?? 'pwa',
        is_standalone: is_standalone_display(),
        error_code: `permission_${next_permission}`,
        error_message: 'notification_permission_denied',
        phase: 'notification_settings',
      })
      set_message(content.denied[props.locale])
      return
    }

    post_pwa_debug({
      event: 'push_permission_granted',
      user_uuid: props.user_uuid,
      participant_uuid: props.participant_uuid,
      room_uuid: props.room_uuid,
      role: props.role,
      tier: props.tier,
      source_channel: props.source_channel ?? 'pwa',
      is_standalone: is_standalone_display(),
      phase: 'notification_settings',
    })

    const saved = await register_push_subscription({
      user_uuid: props.user_uuid,
      participant_uuid: props.participant_uuid,
      room_uuid: props.room_uuid,
      role: props.role,
      tier: props.tier,
    })

    if (!saved) {
      post_pwa_debug({
        event: 'push_subscription_failed',
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        room_uuid: props.room_uuid,
        role: props.role,
        tier: props.tier,
        source_channel: props.source_channel ?? 'pwa',
        has_push_subscription: false,
        error_message: 'push_subscription_save_failed',
        phase: 'notification_settings',
      })
      return
    }

    post_pwa_debug({
      event: 'push_subscription_saved',
      user_uuid: props.user_uuid,
      participant_uuid: props.participant_uuid,
      room_uuid: props.room_uuid,
      role: props.role,
      tier: props.tier,
      source_channel: props.source_channel ?? 'pwa',
      has_push_subscription: true,
      phase: 'notification_settings',
    })

    await save_preferences({
      ...preferences,
      pwa_push_enabled: true,
    })
  }

  async function set_line_enabled(enabled: boolean) {
    await save_preferences({
      ...preferences,
      line_enabled: enabled,
    })
  }

  async function set_kind_enabled(
    key: notification_kind_key,
    enabled: boolean,
  ) {
    await save_preferences({
      ...preferences,
      kinds: {
        ...preferences.kinds,
        [key]: enabled,
      },
    })
  }

  return (
    <div className="relative w-[92%] max-w-[430px] overflow-hidden rounded-[24px] bg-[#fdfaf8] px-6 py-6 shadow-[0_12px_40px_rgba(42,29,24,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pr-1">
          <p className="text-[13px] font-medium leading-[1.4] text-[#8a7568]">
            {content.title[props.locale]}
          </p>
          <h2 className="mt-1 text-[21px] font-semibold leading-[1.35] text-[#2a1d18]">
            {content.settings[props.locale]}
          </h2>
        </div>

        <button
          type="button"
          onClick={props.on_close}
          aria-label="close"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
        >
          <X className="h-[24px] w-[24px] stroke-[2.1] text-[#2a1d18]" />
        </button>
      </div>

      <div className="mt-5 space-y-2.5">
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
          on_change={set_line_enabled}
        />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[13px] font-semibold leading-[1.4] text-[#6d5c52]">
          {content.kinds[props.locale]}
        </p>
        <div className="space-y-2.5">
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
            on_change={(enabled) => set_kind_enabled('announcement', enabled)}
          />
        </div>
      </div>

      {message || is_saving ? (
        <p className="mt-4 text-[13px] leading-[1.6] text-[#8a7568]">
          {is_saving ? content.saving[props.locale] : message}
        </p>
      ) : null}
    </div>
  )
}
