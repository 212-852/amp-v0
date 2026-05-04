import 'server-only'

import { cookies } from 'next/headers'

import { resolve_guest_access } from '@/lib/auth/access'
import { supabase } from '@/lib/db/supabase'
import { visitor_cookie_name } from '@/lib/visitor/cookie'
import type { chat_channel } from './room'

type chat_context_input = {
  channel: chat_channel
}

export type chat_request_context = {
  visitor_uuid: string
  user_uuid: string | null
  channel: chat_channel
}

async function resolve_user_uuid(visitor_uuid: string) {
  const result = await supabase
    .from('visitors')
    .select('user_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data?.user_uuid ?? null
}

export async function resolve_chat_context(
  input: chat_context_input,
): Promise<chat_request_context> {
  const cookie_store = await cookies()
  const visitor_uuid = cookie_store.get(visitor_cookie_name)?.value

  if (!visitor_uuid) {
    throw new Error('Missing visitor context')
  }

  const guest_access = await resolve_guest_access({
    visitor_uuid,
  })
  const user_uuid = await resolve_user_uuid(guest_access.visitor_uuid)

  return {
    visitor_uuid: guest_access.visitor_uuid,
    user_uuid,
    channel: input.channel,
  }
}
