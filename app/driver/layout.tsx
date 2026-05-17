import PresenceClient from '@/components/presence/client'

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <PresenceClient />
      {children}
    </>
  )
}
