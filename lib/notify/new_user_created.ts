import 'server-only'

import { notify } from '@/lib/notify'

export type notify_new_user_created_input = {
  provider: string
  user_uuid: string
  visitor_uuid: string
  display_name?: string | null
  locale?: string | null
  is_new_user: boolean
  is_new_visitor: boolean
}

/**
 * Single entry for [NEW USER] Discord notify (see `lib/notify/discord.ts`).
 * Call from auth routes after `resolve_auth_access` / LIFF resolver succeeds.
 */
export async function notify_new_user_created(
  input: notify_new_user_created_input,
) {
  if (!input.is_new_user) {
    return
  }

  await notify({
    event: 'new_user_created',
    provider: input.provider,
    user_uuid: input.user_uuid,
    visitor_uuid: input.visitor_uuid,
    display_name: input.display_name ?? null,
    locale: input.locale ?? null,
    is_new_user: true,
    is_new_visitor: input.is_new_visitor,
  })
}
