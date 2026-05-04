import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { notify } from '@/lib/notify'
import {
  emit_visitor_access_debug,
  type session_source_channel,
} from '@/lib/visitor/context'

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

type guest_access_input = {
  visitor_uuid: string
  locale?: string | null
  source_channel?: session_source_channel
}

type session_access_input = {
  visitor_uuid: string
  session_uuid: string
  access_channel: 'web'
  access_platform: 'ios' | 'android' | 'mac' | 'windows' | 'unknown'
  locale?: string | null
  user_agent?: string | null
  source_channel?: session_source_channel
}

export type access_result = {
  user_uuid: string
  visitor_uuid: string
  locale: string | null
  is_new_user: boolean
  is_new_visitor: boolean
}

export type guest_access_result = {
  visitor_uuid: string
  is_new_visitor: boolean
}

export type session_access_result = {
  session_uuid: string
  is_new_session: boolean
}

async function find_visitor_row(visitor_uuid: string) {
  return supabase
    .from('visitors')
    .select('visitor_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()
}

async function find_visitor_by_user(user_uuid: string) {
  return supabase
    .from('visitors')
    .select('visitor_uuid')
    .eq('user_uuid', user_uuid)
    .maybeSingle()
}

export async function resolve_guest_access(
  input: guest_access_input,
): Promise<guest_access_result> {
  const source_channel = input.source_channel ?? 'web'
  const existing_visitor = await find_visitor_row(input.visitor_uuid)

  if (existing_visitor.error) {
    throw existing_visitor.error
  }

  if (existing_visitor.data?.visitor_uuid) {
    const updated_visitor = await supabase
      .from('visitors')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('visitor_uuid', input.visitor_uuid)

    if (updated_visitor.error) {
      throw updated_visitor.error
    }

    return {
      visitor_uuid: input.visitor_uuid,
      is_new_visitor: false,
    }
  }

  const created_visitor = await supabase
    .from('visitors')
    .insert({
      visitor_uuid: input.visitor_uuid,
      user_uuid: null,
    })
    .select('visitor_uuid')
    .single()

  if (!created_visitor.error) {
    return {
      visitor_uuid: created_visitor.data.visitor_uuid,
      is_new_visitor: true,
    }
  }

  if (!is_unique_violation(created_visitor.error)) {
    throw created_visitor.error
  }

  await emit_visitor_access_debug({
    event: 'visitor_create_conflict',
    visitor_uuid: input.visitor_uuid,
    session_uuid: null,
    user_uuid: null,
    source_channel,
  })

  const after_conflict = await find_visitor_row(input.visitor_uuid)

  if (after_conflict.error) {
    throw after_conflict.error
  }

  if (!after_conflict.data?.visitor_uuid) {
    throw created_visitor.error
  }

  await emit_visitor_access_debug({
    event: 'visitor_reused_after_conflict',
    visitor_uuid: after_conflict.data.visitor_uuid,
    session_uuid: null,
    user_uuid: null,
    source_channel,
  })

  const touch = await supabase
    .from('visitors')
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq('visitor_uuid', after_conflict.data.visitor_uuid)

  if (touch.error) {
    throw touch.error
  }

  return {
    visitor_uuid: after_conflict.data.visitor_uuid,
    is_new_visitor: false,
  }
}

async function find_session_row(session_uuid: string) {
  return supabase
    .from('sessions')
    .select('session_uuid')
    .eq('session_uuid', session_uuid)
    .maybeSingle()
}

export async function resolve_session_access(
  input: session_access_input,
): Promise<session_access_result> {
  const source_channel = input.source_channel ?? 'web'
  const existing_session = await find_session_row(input.session_uuid)

  if (existing_session.error) {
    throw existing_session.error
  }

  const current_time = new Date().toISOString()

  if (existing_session.data?.session_uuid) {
    const updated_session = await supabase
      .from('sessions')
      .update({
        visitor_uuid: input.visitor_uuid,
        access_channel: input.access_channel,
        access_platform: input.access_platform,
        locale: input.locale ?? null,
        user_agent: input.user_agent ?? null,
        last_seen_at: current_time,
        updated_at: current_time,
      })
      .eq('session_uuid', input.session_uuid)

    if (updated_session.error) {
      throw updated_session.error
    }

    return {
      session_uuid: input.session_uuid,
      is_new_session: false,
    }
  }

  const created_session = await supabase
    .from('sessions')
    .insert({
      session_uuid: input.session_uuid,
      visitor_uuid: input.visitor_uuid,
      user_uuid: null,
      access_channel: input.access_channel,
      access_platform: input.access_platform,
      locale: input.locale ?? null,
      user_agent: input.user_agent ?? null,
      last_seen_at: current_time,
    })
    .select('session_uuid')
    .single()

  if (!created_session.error) {
    return {
      session_uuid: created_session.data.session_uuid,
      is_new_session: true,
    }
  }

  if (!is_unique_violation(created_session.error)) {
    throw created_session.error
  }

  await emit_visitor_access_debug({
    event: 'session_create_conflict',
    visitor_uuid: input.visitor_uuid,
    session_uuid: input.session_uuid,
    user_uuid: null,
    source_channel,
  })

  const after_conflict = await find_session_row(input.session_uuid)

  if (after_conflict.error) {
    throw after_conflict.error
  }

  if (!after_conflict.data?.session_uuid) {
    throw created_session.error
  }

  await emit_visitor_access_debug({
    event: 'session_reused_after_conflict',
    visitor_uuid: input.visitor_uuid,
    session_uuid: input.session_uuid,
    user_uuid: null,
    source_channel,
  })

  const updated_session = await supabase
    .from('sessions')
    .update({
      visitor_uuid: input.visitor_uuid,
      access_channel: input.access_channel,
      access_platform: input.access_platform,
      locale: input.locale ?? null,
      user_agent: input.user_agent ?? null,
      last_seen_at: current_time,
      updated_at: current_time,
    })
    .eq('session_uuid', input.session_uuid)

  if (updated_session.error) {
    throw updated_session.error
  }

  return {
    session_uuid: input.session_uuid,
    is_new_session: false,
  }
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
    const user_result = await supabase
      .from('users')
      .select('locale')
      .eq('user_uuid', user_uuid)
      .maybeSingle()

    if (user_result.error) {
      throw user_result.error
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
        locale: user_result.data?.locale ?? null,
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
        locale: user_result.data?.locale ?? null,
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
      locale: user_result.data?.locale ?? null,
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
      locale: input.locale ?? null,
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
