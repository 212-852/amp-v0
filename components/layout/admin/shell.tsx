type AdminShellProps = {
  children: React.ReactNode
}

/**
 * Outer frame for admin (backdrop + mobile column). Header, main, and assistant are composed in `app/admin/layout.tsx`.
 */
export default function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] justify-center bg-neutral-200/40 text-black">
      <div className="mobile-shell flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-neutral-100 shadow-[0_0_80px_rgba(0,0,0,0.08)]">
        {children}
      </div>
    </div>
  )
}
