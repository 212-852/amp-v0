import AdminFooter from './footer'
import AdminHeader from './header'

type AdminShellProps = {
  children: React.ReactNode
  display_name: string | null
}

export default function AdminShell({
  children,
  display_name,
}: AdminShellProps) {
  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] justify-center bg-neutral-200/40 text-black">
      <div className="mobile-shell flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-neutral-100 shadow-[0_0_80px_rgba(0,0,0,0.08)]">
        <AdminHeader display_name={display_name} />
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6 pb-[calc(200px+env(safe-area-inset-bottom,0px))]">
          {children}
        </main>
        <AdminFooter display_name={display_name} />
      </div>
    </div>
  )
}
