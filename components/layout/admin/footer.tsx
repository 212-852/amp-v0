import AdminAssistant from './assistant'

type AdminFooterProps = {
  display_name: string | null
}

export default function AdminFooter({
  display_name,
}: AdminFooterProps) {
  return (
    <footer className="border-t border-gray-300 bg-white pb-[env(safe-area-inset-bottom)]">
      <AdminAssistant display_name={display_name} />
    </footer>
  )
}
