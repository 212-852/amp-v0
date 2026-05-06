import 'server-only'

import { control } from '@/lib/config/control'
import { resolve_user_visitor } from '@/lib/auth/session'
import { supabase } from '@/lib/db/supabase'
import { normalize_locale } from '@/lib/locale/action'
import { debug_event } from '@/lib/debug'

export type auth_provider = 'line' | 'google' | 'email'

type access_input = {
  provider: auth_provider
  provider_id: string
  visitor_uuid?: string | null
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

async function sync_line_messaging_profile_to_visitor(input: {
  visitor_uuid: string
  user_uuid: string
  display_name: string | null | undefined
}) {
  const trimmed = input.display_name?.trim()

  if (!trimmed) {
    return
  }

  const updated = await supabase
    .from('visitors')
    .update({ display_name: trimmed })
    .eq('visitor_uuid', input.visitor_uuid)
    .eq('user_uuid', input.user_uuid)

  if (updated.error) {
    throw updated.error
  }
}

export async function resolve_auth_access(
  input: access_input,
): Promise<access_result> {
  const input_locale = normalize_locale(input.locale)

  if (control.debug.identity && input.provider === 'line') {
    await debug_event({
      category: 'identity',
      event: 'line_identity_lookup_started',
      payload: {
        line_user_id: input.provider_id,
      },
    })
  }

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

    const visitor = await resolve_user_visitor({
      user_uuid,
      visitor_uuid: input.visitor_uuid,
    })

    if (input.provider === 'line') {
      const user_patch: { display_name?: string; image_url?: string | null } =
        {}

      if (input.display_name?.trim()) {
        user_patch.display_name = input.display_name.trim()
      }

      if (input.image_url?.trim()) {
        user_patch.image_url = input.image_url.trim()
      }

      if (Object.keys(user_patch).length > 0) {
        const user_update = await supabase
          .from('users')
          .update(user_patch)
          .eq('user_uuid', user_uuid)

        if (user_update.error) {
          throw user_update.error
        }
      }

      await sync_line_messaging_profile_to_visitor({
        visitor_uuid: visitor.visitor_uuid,
        user_uuid,
        display_name: input.display_name,
      })
    }

    if (control.debug.identity && input.provider === 'line') {
      await debug_event({
        category: 'identity',
        event: 'line_identity_found',
        payload: {
          line_user_id: input.provider_id,
          user_uuid,
          visitor_uuid: visitor.visitor_uuid,
        },
      })
    }

    return {
      user_uuid,
      visitor_uuid: visitor.visitor_uuid,
      locale: resolved_locale,
      is_new_user: false,
      is_new_visitor: visitor.is_new_visitor,
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

  const visitor = await resolve_user_visitor({
    user_uuid,
    visitor_uuid: input.visitor_uuid,
  })

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

  if (input.provider === 'line') {
    await sync_line_messaging_profile_to_visitor({
      visitor_uuid: visitor.visitor_uuid,
      user_uuid,
      display_name: input.display_name,
    })
  }

  if (control.debug.identity && input.provider === 'line') {
    await debug_event({
      category: 'identity',
      event: 'line_identity_created',
      payload: {
        line_user_id: input.provider_id,
        user_uuid,
        visitor_uuid: visitor.visitor_uuid,
      },
    })
  }

  return {
    user_uuid,
    visitor_uuid: visitor.visitor_uuid,
    locale: created_user.data.locale ?? null,
    is_new_user: true,
    is_new_visitor: visitor.is_new_visitor,
  }
}
