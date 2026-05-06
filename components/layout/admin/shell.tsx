type AdminShellProps = {
  children: React.ReactNode
  display_name?: string | null
  image_url?: string | null
  role?: string | null
  tier?: string | null
}

/**
 * Outer frame for admin (backdrop + mobile column). Header, main, and assistant are composed in `app/admin/layout.tsx`.
 */
export default function AdminShell({
  children,
  display_name,
  image_url,
  role,
  tier,
}: AdminShellProps) {
  void display_name
  void image_url
  void role
  void tier

  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] justify-center bg-neutral-200/40 text-black">
      <div className="mobile-shell flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-neutral-100 shadow-[0_0_80px_rgba(0,0,0,0.08)]">
        {children}
      </div>
    </div>
  )
}
