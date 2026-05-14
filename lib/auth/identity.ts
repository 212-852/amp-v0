import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { normalize_locale, type locale_key } from '@/lib/locale/action'

export type connected_provider = 'line' | 'google' | 'email'
export type normalized_role = 'user' | 'driver' | 'admin' | 'guest'
export type normalized_tier = 'guest' | 'member' | 'vip'

export type browser_identity_snapshot = {
  role: normalized_role
  tier: normalized_tier
  user_uuid: string | null
  locale: locale_key | null
  display_name: string | null
  image_url: string | null
  line_connected: boolean
  connected_providers: connected_provider[]
}

function normalize_role(role: string | null | undefined): normalized_role {
  if (role === 'user' || role === 'driver' || role === 'admin') {
    return role
  }

  return 'guest'
}

function normalize_tier(tier: string | null | undefined): normalized_tier {
  if (tier === 'member' || tier === 'vip') {
    return tier
  }

  return 'guest'
}

function normalize_connected_providers(
  providers: Array<{ provider: string | null }>,
) {
  const connected_providers: connected_provider[] = []

  providers.forEach((identity) => {
    const provider = identity.provider?.toLowerCase()

    if (
      provider === 'line' ||
      provider === 'google' ||
      provider === 'email'
    ) {
      connected_providers.push(provider)
    }
  })

  return Array.from(new Set(connected_providers))
}

/**
 * Identity-only lookup for a visitor (auth layer). No chat or room logic.
 */
export async function resolve_browser_identity_from_visitor(
  visitor_uuid: string,
): Promise<browser_identity_snapshot> {
  const visitor_result = await supabase
    .from('visitors')
    .select('user_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()

  if (visitor_result.error) {
    throw visitor_result.error
  }

  const user_uuid = visitor_result.data?.user_uuid

  if (!user_uuid) {
    return {
      role: 'guest',
      tier: 'guest',
      user_uuid: null,
      locale: null,
      display_name: null,
      image_url: null,
      line_connected: false,
      connected_providers: [],
    }
  }

  const user_result = await supabase
    .from('users')
    .select('role, tier, locale, display_name, image_url')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (user_result.error) {
    throw user_result.error
  }

  const identity_result = await supabase
    .from('identities')
    .select('provider')
    .eq('user_uuid', user_uuid)

  if (identity_result.error) {
    throw identity_result.error
  }

  const connected_providers = normalize_connected_providers(
    identity_result.data ?? [],
  )

  return {
    role: normalize_role(user_result.data?.role),
    tier: normalize_tier(user_result.data?.tier),
    user_uuid,
    locale: normalize_locale(user_result.data?.locale ?? null),
    display_name: user_result.data?.display_name ?? null,
    image_url: user_result.data?.image_url ?? null,
    line_connected: connected_providers.includes('line'),
    connected_providers,
  }
}
