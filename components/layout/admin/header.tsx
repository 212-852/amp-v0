import Image from 'next/image'
import {
  Bell,
  ChevronDown,
  Settings,
  UserRound,
} from 'lucide-react'

import AdminReceptionButton from './reception_button'

type AdminHeaderProps = {
  display_name: string | null
  image_url?: string | null
  role?: string | null
  tier?: string | null
}

const icon_button_class =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-black shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 active:scale-[0.98] sm:h-11 sm:w-11'

export default function AdminHeader({
  display_name,
  image_url,
  role,
  tier,
}: AdminHeaderProps) {
  const profile_name = display_name?.trim() || 'Admin'
  const subtitle = [role, tier]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ') || 'admin'

  return (
    <header className="border-b border-black/[0.06] bg-white px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] shadow-[0_1px_0_rgba(0,0,0,0.03)]">
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
            className={icon_button_class}
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" strokeWidth={2} />
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
              aria-hidden
            />
          </button>
          <button
            type="button"
            className={icon_button_class}
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" strokeWidth={2} />
          </button>
          <button
            type="button"
            className={icon_button_class}
            aria-label="Menu"
          >
            <ChevronDown className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </header>
  )
}
