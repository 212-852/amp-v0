import {
  Bell,
  ChevronDown,
  MessageCircle,
  Settings,
  UserRound,
} from 'lucide-react'

type AdminHeaderProps = {
  display_name: string | null
}

const icon_button_class =
  'flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-black transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black sm:h-10 sm:w-10'

export default function AdminHeader({
  display_name,
}: AdminHeaderProps) {
  const profile_name = display_name?.trim() || 'Admin'

  return (
    <header className="border-b border-gray-300 bg-white px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-3">
      <div className="mx-auto grid max-w-[1120px] grid-cols-[minmax(0,86px)_minmax(64px,1fr)_minmax(140px,auto)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-gray-100">
            <UserRound className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight text-black">
              {profile_name}
            </div>
            <div className="mt-0.5 text-xs font-medium leading-tight text-gray-500">
              LINE admin
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="text-[15px] font-semibold leading-tight text-black">
            Admin
          </div>
          <div className="mt-0.5 text-xs font-medium leading-tight text-gray-500">
            PET TAXI
          </div>
        </div>

        <div className="flex min-w-0 justify-end gap-1 sm:gap-2">
          <button
            type="button"
            className={icon_button_class}
            aria-label="Chat"
          >
            <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.1} />
          </button>
          <button
            type="button"
            className={icon_button_class}
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.1} />
          </button>
          <button
            type="button"
            className={icon_button_class}
            aria-label="Settings"
          >
            <Settings className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.1} />
          </button>
          <button
            type="button"
            className={icon_button_class}
            aria-label="Menu"
          >
            <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.1} />
          </button>
        </div>
      </div>
    </header>
  )
}
