'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Bell, UserRound } from 'lucide-react'

import AdminHeaderMenu from '@/components/admin/menu'
import { AdminReceptionButton } from '@/components/admin/reception_button'
import NotificationSettings from '@/components/notification/settings'
import OverlayRoot from '@/components/overlay/root'
import type { locale_key } from '@/lib/locale/action'
import { get_locale, subscribe_locale } from '@/lib/locale/state'
import { post_pwa_debug } from '@/lib/pwa/client'

type AdminHeaderProps = {
  display_name: string | null
  image_url?: string | null
  role?: string | null
  tier?: string | null
  user_uuid?: string | null
}

/**
 * Admin header is a presentational shell. It composes the reception
 * ON/OFF pill via `<AdminReceptionButton />` but never owns reception
 * state, never knows the API shape, never imports server-only modules.
 */
export default function AdminHeader({
  display_name,
  image_url,
  role,
  tier,
  user_uuid,
}: AdminHeaderProps) {
  const [notification_open, set_notification_open] = useState(false)
  const [locale, set_locale] = useState<locale_key>('ja')
  const profile_name = display_name?.trim() || 'Admin'
  const subtitle =
    [role, tier]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(' ') || 'admin'
  const can_access_management =
    role === 'admin' && (tier === 'owner' || tier === 'core')

  useEffect(() => {
    set_locale(get_locale())
    return subscribe_locale(set_locale)
  }, [])

  function open_notification_modal() {
    post_pwa_debug({
      event: 'notification_modal_opened',
      user_uuid: user_uuid ?? null,
      participant_uuid: null,
      room_uuid: null,
      role: role ?? null,
      tier: tier ?? null,
      source_channel: 'admin',
      is_standalone:
        typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true),
      phase: 'admin_header',
    })
    set_notification_open(true)
  }

  return (
    <>
      <header
        className="border-b border-black/[0.06] bg-white px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] shadow-[0_1px_0_rgba(0,0,0,0.03)]"
      >
        <div className="flex min-h-[64px] items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
              {image_url ? (
                <Image
                  src={image_url}
                  alt=""
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound
                  className="h-6 w-6 text-neutral-600"
                  strokeWidth={2}
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-tight text-black">
                {profile_name}
              </div>
              <div className="mt-0.5 text-xs font-medium leading-tight text-neutral-500">
                {subtitle}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <AdminReceptionButton />
            <button
              type="button"
              onClick={open_notification_modal}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-black shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 active:scale-[0.98] sm:h-11 sm:w-11"
              aria-label="Notification settings"
            >
              <Bell className="h-5 w-5" strokeWidth={2} />
            </button>
            <AdminHeaderMenu
              can_access_management={can_access_management}
              role={role ?? null}
              tier={tier ?? null}
            />
          </div>
        </div>
      </header>

      <OverlayRoot
        open={notification_open}
        on_close={() => set_notification_open(false)}
        variant="center"
      >
        <NotificationSettings
          locale={locale}
          user_uuid={user_uuid ?? null}
          participant_uuid={null}
          room_uuid={null}
          role={role ?? null}
          tier={tier ?? null}
          source_channel="admin"
          on_close={() => set_notification_open(false)}
        />
      </OverlayRoot>
    </>
  )
}
