import DriverEntryContent from '@/components/driver/entry_content'
import { parse_entry_redirect_reason } from '@/lib/driver/rules'

export const dynamic = 'force-dynamic'

type EntryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function EntryPage({ searchParams }: EntryPageProps) {
  const params = await searchParams
  const reason = parse_entry_redirect_reason(params?.reason)

  return <DriverEntryContent reason={reason} />
}
