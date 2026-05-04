import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { normalize_locale } from '@/lib/locale/action'
import { notify } from '@/lib/notify'
import { emit_visitor_access_debug } from '@/lib/visitor/context'

function is_unique_violation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  return (error as { code?: string }).code === '23505'
}

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
  locale: string | null
  is_new_user: boolean
  is_new_visitor: boolean
}

async function find_visitor_by_user(user_uuid: string) {
  return supabase
    .from('visitors')
    .select('visitor_uuid')
    .eq('user_uuid', user_uuid)
    .maybeSingle()
}

export async function resolve_auth_access(
  input: access_input,
): Promise<access_result> {
  const input_locale = normalize_locale(input.locale)
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
    const user_result = await supabase
      .from('users')
      .select('locale')
      .eq('user_uuid', user_uuid)
      .maybeSingle()

    if (user_result.error) {
      throw user_result.error
    }

    const stored_locale = user_result.data?.locale ?? null
    const resolved_locale = stored_locale
      ? normalize_locale(stored_locale)
      : input_locale

    if (stored_locale !== resolved_locale) {
      const locale_update = await supabase
        .from('users')
        .update({
          locale: resolved_locale,
        })
        .eq('user_uuid', user_uuid)

      if (locale_update.error) {
        throw locale_update.error
      }
    }

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
        locale: resolved_locale,
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

    if (!created_visitor.error) {
      return {
        user_uuid,
        visitor_uuid: created_visitor.data.visitor_uuid,
        locale: resolved_locale,
        is_new_user: false,
        is_new_visitor: true,
      }
    }

    if (!is_unique_violation(created_visitor.error)) {
      throw created_visitor.error
    }

    await emit_visitor_access_debug({
      event: 'visitor_create_conflict',
      visitor_uuid: null,
      session_uuid: null,
      user_uuid,
      source_channel: 'web',
    })

    const reused_visitor = await find_visitor_by_user(user_uuid)

    if (reused_visitor.error) {
      throw reused_visitor.error
    }

    if (!reused_visitor.data?.visitor_uuid) {
      throw created_visitor.error
    }

    await emit_visitor_access_debug({
      event: 'visitor_reused_after_conflict',
      visitor_uuid: reused_visitor.data.visitor_uuid,
      session_uuid: null,
      user_uuid,
      source_channel: 'web',
    })

    return {
      user_uuid,
      visitor_uuid: reused_visitor.data.visitor_uuid,
      locale: resolved_locale,
      is_new_user: false,
      is_new_visitor: false,
    }
  }

  const created_user = await supabase
    .from('users')
    .insert({
      role: 'user',
      tier: 'member',
      display_name: input.display_name ?? null,
      image_url: input.image_url ?? null,
      locale: input_locale,
    })
    .select('user_uuid, locale')
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

  let visitor_uuid_for_identity: string
  let is_fresh_visitor_row = true

  if (!created_visitor.error) {
    visitor_uuid_for_identity = created_visitor.data.visitor_uuid
  } else if (is_unique_violation(created_visitor.error)) {
    is_fresh_visitor_row = false

    await emit_visitor_access_debug({
      event: 'visitor_create_conflict',
      visitor_uuid: null,
      session_uuid: null,
      user_uuid,
      source_channel: 'web',
    })

    const reused_visitor = await find_visitor_by_user(user_uuid)

    if (reused_visitor.error) {
      throw reused_visitor.error
    }

    if (!reused_visitor.data?.visitor_uuid) {
      throw created_visitor.error
    }

    visitor_uuid_for_identity = reused_visitor.data.visitor_uuid

    await emit_visitor_access_debug({
      event: 'visitor_reused_after_conflict',
      visitor_uuid: visitor_uuid_for_identity,
      session_uuid: null,
      user_uuid,
      source_channel: 'web',
    })
  } else {
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

  await notify({
    event: 'new_user_created',
    provider: input.provider,
    user_uuid,
    visitor_uuid: visitor_uuid_for_identity,
    display_name: input.display_name ?? null,
    locale: created_user.data.locale ?? null,
    is_new_user: true,
    is_new_visitor: is_fresh_visitor_row,
  })

  return {
    user_uuid,
    visitor_uuid: visitor_uuid_for_identity,
    locale: created_user.data.locale ?? null,
    is_new_user: true,
    is_new_visitor: is_fresh_visitor_row,
  }
}
