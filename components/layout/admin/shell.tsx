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
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col overflow-hidden bg-white text-black">
      <AdminHeader display_name={display_name} />
      <main className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4">
        <div className="mx-auto min-h-full max-w-[1120px] rounded-lg border border-gray-200 bg-white" />
        {children}
      </main>
      <AdminFooter display_name={display_name} />
    </div>
  )
}
