import AdminAssistant from './assistant'

type AdminFooterProps = {
  display_name: string | null
}

export default function AdminFooter({
  display_name,
}: AdminFooterProps) {
  return <AdminAssistant display_name={display_name} />
}
