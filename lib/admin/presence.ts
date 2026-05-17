import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

export async function load_admin_app_presence_participant_uuid(input: {
  admin_user_uuid: string
}): Promise<string | null> {
  const admin_user_uuid = clean_uuid(input.admin_user_uuid)

  if (!admin_user_uuid) {
    return null
  }

  const result = await supabase
    .from('participants')
    .select('participant_uuid')
    .eq('user_uuid', admin_user_uuid)
    .in('role', ['admin', 'concierge'])
    .limit(1)
    .maybeSingle()

  if (result.error || !result.data) {
    return null
  }

  return clean_uuid(
    (result.data as { participant_uuid?: string | null }).participant_uuid ??
      null,
  )
}
