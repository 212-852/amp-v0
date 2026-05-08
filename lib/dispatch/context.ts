import 'server-only'

import { control } from '@/lib/config/control'
import { resolve_chat_room } from '@/lib/chat/room'
import { debug_event, forced_debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'
import { fetch_line_messaging_profile } from '@/lib/line/messaging_profile'
import { normalize_locale, type locale_key } from '@/lib/locale/action'

export {
  resolve_chat_context,
  type chat_request_context,
} from '@/lib/chat/context'

export type dispatch_source_channel = 'web' | 'line' | 'liff' | 'pwa'

type locale_source =
  | 'stored_user'
  | 'line_profile'
  | 'browser_selected'
  | 'webhook_source'
  | 'fallback'

export function normalize_dispatch_text(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ') ?? ''
}

async function debug_line(
  event: string,
  payload: Record<string, unknown>,
) {
  await forced_debug_event({
    category: 'line_webhook',
    event,
    payload,
  })
}

export async function resolve_line_dispatch_identity(input: {
  line_user_id: string
  text?: string | null
}) {
  try {
    await debug_line('line_identity_resolve_started', {
      line_user_id: input.line_user_id,
    })

    const { data: identity, error: identity_error } = await supabase
      .from('identities')
      .select('*')
      .eq('provider', 'line')
      .eq('provider_id', input.line_user_id)
      .maybeSingle()

    await debug_line('line_identity_resolve_completed', {
      line_user_id: input.line_user_id,
      identity_found: Boolean(identity),
      identity_error_code: identity_error?.code ?? null,
      identity_error_message: identity_error?.message ?? null,
      user_uuid:
        identity &&
        typeof identity === 'object' &&
        'user_uuid' in identity
          ? identity.user_uuid ?? null
          : null,
      visitor_uuid:
        identity &&
        typeof identity === 'object' &&
        'visitor_uuid' in identity
          ? identity.visitor_uuid ?? null
          : null,
    })

    if (identity_error) {
      throw identity_error
    }

    const user_uuid =
      identity &&
      typeof identity === 'object' &&
      'user_uuid' in identity &&
      typeof identity.user_uuid === 'string'
        ? identity.user_uuid
        : null
    const visitor_uuid =
      identity &&
      typeof identity === 'object' &&
      'visitor_uuid' in identity &&
      typeof identity.visitor_uuid === 'string'
        ? identity.visitor_uuid
        : null

    await debug_line('line_room_resolve_started', {
      user_uuid,
      visitor_uuid,
      source_channel: 'line',
    })

    let resolved_room: Awaited<ReturnType<typeof resolve_chat_room>> | null =
      null

    if (user_uuid || visitor_uuid) {
      try {
        const room_result = await resolve_chat_room({
          visitor_uuid,
          user_uuid,
          channel: 'line',
        })
        resolved_room = room_result

        await debug_line('line_room_resolve_completed', {
          room_uuid: room_result.room.room_uuid || null,
          participant_uuid: room_result.room.participant_uuid || null,
          room_ok: room_result.ok && Boolean(room_result.room.room_uuid),
          participant_ok:
            room_result.ok && Boolean(room_result.room.participant_uuid),
        })

        await debug_line('line_chat_action_started', {
          room_uuid: room_result.room.room_uuid || null,
          participant_uuid: room_result.room.participant_uuid || null,
          text: input.text ?? null,
        })

        if (!room_result.ok) {
          await debug_line('line_room_resolve_failed', {
            user_uuid,
            visitor_uuid,
            error_message: 'resolve_chat_room returned ok false',
            error_code: 'room_resolve_not_ok',
          })
        }
      } catch (room_error) {
        await debug_line('line_room_resolve_failed', {
          user_uuid,
          visitor_uuid,
          error_message:
            room_error instanceof Error
              ? room_error.message
              : String(room_error),
          error_code:
            room_error &&
            typeof room_error === 'object' &&
            'code' in room_error
              ? room_error.code ?? null
              : null,
        })

        throw room_error
      }
    } else {
      await debug_line('line_room_resolve_failed', {
        user_uuid,
        visitor_uuid,
        error_message: 'line identity has no user_uuid or visitor_uuid',
        error_code: 'identity_missing_room_key',
      })
    }

    if (!identity) {
      await debug_line('line_identity_missing', {
        line_user_id: input.line_user_id,
      })
    }

    return {
      identity,
      user_uuid,
      visitor_uuid,
      room_result: resolved_room,
      error: null,
    }
  } catch (error) {
    await debug_line('line_dispatch_context_failed', {
      line_user_id: input.line_user_id,
      error_message:
        error instanceof Error ? error.message : String(error),
    })

    throw error
  }
}

function locale_source_for_debug(source: locale_source): string {
  if (source === 'browser_selected') {
    return 'browser'
  }

  if (source === 'webhook_source') {
    return 'webhook'
  }

  return source
}

function raw_locale_is_supported(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()

  return Boolean(
    normalized &&
      (normalized.startsWith('ja') ||
        normalized.startsWith('en') ||
        normalized.startsWith('es')),
  )
}

async function fetch_line_profile_locale(
  line_user_id: string | null | undefined,
) {
  const profile = await fetch_line_messaging_profile(line_user_id)

  return profile?.language ?? null
}

export async function resolve_dispatch_locale(input: {
  source_channel: dispatch_source_channel
  stored_user_locale?: string | null
  line_profile_locale?: string | null
  browser_selected_locale?: string | null
  webhook_source_locale?: string | null
  line_user_id?: string | null
  debug?: boolean
}): Promise<{
  locale: locale_key
  raw_locale: string | null
  source: locale_source
}> {
  const profile_locale =
    input.line_profile_locale ??
    (input.source_channel === 'line'
      ? await fetch_line_profile_locale(input.line_user_id)
      : null)
  const candidates: Array<{
    source: locale_source
    raw_locale: string | null | undefined
  }> = [
    {
      source: 'stored_user',
      raw_locale: input.stored_user_locale,
    },
    {
      source: 'line_profile',
      raw_locale: profile_locale,
    },
    {
      source: 'browser_selected',
      raw_locale: input.browser_selected_locale,
    },
    {
      source: 'webhook_source',
      raw_locale: input.webhook_source_locale,
    },
  ]

  const resolved =
    candidates.find((candidate) =>
      raw_locale_is_supported(candidate.raw_locale),
    ) ?? {
      source: 'fallback' as const,
      raw_locale: null,
    }
  const locale = normalize_locale(resolved.raw_locale)

  if (control.debug.locale && input.debug !== false) {
    await debug_event({
      category: 'locale',
      event: 'locale_resolved',
      payload: {
        raw_locale: resolved.raw_locale ?? null,
        normalized_locale: locale,
        source: locale_source_for_debug(resolved.source),
      },
    })
  }

  return {
    locale,
    raw_locale: resolved.raw_locale ?? null,
    source: resolved.source,
  }
}
