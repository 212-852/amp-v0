import 'server-only'

import { cookies } from 'next/headers'
import { headers } from 'next/headers'

import { supabase } from '@/lib/db/supabase'
import { normalize_locale } from '@/lib/locale/action'
import { locale_cookie_name } from '@/lib/locale/cookie'
import { visitor_cookie_name } from '@/lib/visitor/cookie'
import {
  resolve_visitor_context,
  type session_source_channel,
} from '@/lib/visitor/context'
import type { chat_locale } from './message'
import type { chat_channel } from './room'

type chat_context_input = {
  channel: chat_channel
  explicit_locale?: string | null
  profile_locale?: string | null
  browser_locale?: string | null
}

export type chat_request_context = {
  visitor_uuid: string | null
  user_uuid: string | null
  channel: chat_channel
  locale: chat_locale
}

async function resolve_user_state(visitor_uuid: string) {
  const result = await supabase
    .from('visitors')
    .select('user_uuid, users(locale)')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const user_data = result.data?.users as
    | { locale?: string | null }
    | null
    | undefined

  return {
    user_uuid: result.data?.user_uuid ?? null,
    locale: user_data?.locale ?? null,
  }
}

function normalize_optional_locale(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const locale = normalize_locale(value)

  return locale
}

function session_source_from_channel(
  channel: chat_channel,
): session_source_channel {
  if (channel === 'liff' || channel === 'pwa') {
    return channel
  }

  if (channel === 'line') {
    return 'liff'
  }

  return 'web'
}

function first_locale(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const locale = normalize_optional_locale(value)

    if (locale) {
      return locale
    }
  }

  return 'ja'
}

export async function resolve_chat_context(
  input: chat_context_input,
): Promise<chat_request_context> {
  const cookie_store = await cookies()
  const header_store = await headers()
  const session_src = session_source_from_channel(input.channel)
  const accept_language =
    input.browser_locale ??
    header_store.get('accept-language')?.split(',')[0] ??
    null
  const browser_locale = normalize_optional_locale(accept_language)
  const visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null
  const cookie_created =
    header_store.get('x-amp-visitor-cookie-created') === '1'
  const browser_session = await resolve_visitor_context(
    session_src,
    'chat_room',
    {
      locale: browser_locale,
      user_agent: header_store.get('user-agent'),
      create_if_missing: true,
      cookie_created,
      visitor_uuid,
    },
  )

  const user_state = browser_session.visitor_uuid
    ? await resolve_user_state(browser_session.visitor_uuid)
    : { user_uuid: null, locale: null }
  const selected_locale =
    input.explicit_locale ??
    cookie_store.get(locale_cookie_name)?.value ??
    user_state.locale

  return {
    visitor_uuid: browser_session.visitor_uuid,
    user_uuid: user_state.user_uuid,
    channel: input.channel,
    locale: first_locale(
      selected_locale,
      input.profile_locale,
      accept_language,
    ),
  }
}
