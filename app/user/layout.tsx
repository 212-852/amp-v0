import UserShell from '@/components/user/shell'

export default function UserRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <UserShell>{children}</UserShell>
}
