import 'server-only'

import { supabase } from '@/lib/db/supabase'

export type auth_provider = 'line' | 'google' | 'email'

type access_input = {
  provider: auth_provider
  provider_id: string
  display_name?: string | null
  image_url?: string | null
  locale?: string | null
}

export type access_result = {
  user_uuid: string
  visitor_uuid: string
  is_new_user: boolean
  is_new_visitor: boolean
}

export async function resolve_auth_access(
  input: access_input,
): Promise<access_result> {
  const existing_identity = await supabase
    .from('identities')
    .select('user_uuid')
    .eq('provider', input.provider)
    .eq('provider_id', input.provider_id)
    .maybeSingle()

  if (existing_identity.error) {
    throw existing_identity.error
  }

  if (existing_identity.data?.user_uuid) {
    const user_uuid = existing_identity.data.user_uuid

    const existing_visitor = await supabase
      .from('visitors')
      .select('visitor_uuid')
      .eq('user_uuid', user_uuid)
      .maybeSingle()

    if (existing_visitor.error) {
      throw existing_visitor.error
    }

    if (existing_visitor.data?.visitor_uuid) {
      return {
        user_uuid,
        visitor_uuid: existing_visitor.data.visitor_uuid,
        is_new_user: false,
        is_new_visitor: false,
      }
    }

    const created_visitor = await supabase
      .from('visitors')
      .insert({
        user_uuid,
      })
      .select('visitor_uuid')
      .single()

    if (created_visitor.error) {
      throw created_visitor.error
    }

    return {
      user_uuid,
      visitor_uuid: created_visitor.data.visitor_uuid,
      is_new_user: false,
      is_new_visitor: true,
    }
  }

  const created_user = await supabase
    .from('users')
    .insert({
      role: 'user',
      tier: input.provider === 'line' ? 'member' : 'guest',
      display_name: input.display_name ?? null,
      image_url: input.image_url ?? null,
      locale: input.locale ?? null,
    })
    .select('user_uuid')
    .single()

  if (created_user.error) {
    throw created_user.error
  }

  const user_uuid = created_user.data.user_uuid

  const created_visitor = await supabase
    .from('visitors')
    .insert({
      user_uuid,
    })
    .select('visitor_uuid')
    .single()

  if (created_visitor.error) {
    throw created_visitor.error
  }

  const created_identity = await supabase
    .from('identities')
    .insert({
      user_uuid,
      provider: input.provider,
      provider_id: input.provider_id,
    })

  if (created_identity.error) {
    throw created_identity.error
  }

  return {
    user_uuid,
    visitor_uuid: created_visitor.data.visitor_uuid,
    is_new_user: true,
    is_new_visitor: true,
  }
}
