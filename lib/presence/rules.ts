export type presence_channel = 'web' | 'pwa' | 'liff'

export type presence_area = 'admin' | 'driver' | 'user' | 'app'

export const presence_fresh_threshold_ms = 30_000

export type presence_context_ok = {
  user_uuid: string
  role: string
  channel: presence_channel
  area: presence_area
  visible: boolean
}

export type presence_write_decision =
  | {
      ok: true
      user_uuid: string
      role: string
      channel: presence_channel
      area: presence_area
      visible: boolean
    }
  | {
      ok: false
      skipped_reason: string
    }

export type receiver_presence_row = {
  user_uuid: string
  role: string | null
  channel: string | null
  area: string | null
  visible: boolean
  seen_at: string | null
}

export type external_notification_presence_decision = {
  skip_external: boolean
  external_notification_skipped_reason: string | null
  presence_found: boolean
  presence_visible: boolean | null
  presence_seen_at: string | null
  presence_age_seconds: number | null
  presence_area: string | null
  receiver_channel: string | null
}

export function normalize_presence_channel(
  value: unknown,
): presence_channel | null {
  return value === 'web' || value === 'pwa' || value === 'liff' ? value : null
}

export function normalize_presence_area(value: unknown): presence_area | null {
  if (
    value === 'admin' ||
    value === 'driver' ||
    value === 'user' ||
    value === 'app'
  ) {
    return value
  }

  if (typeof value === 'string') {
    if (value.startsWith('admin')) {
      return 'admin'
    }

    if (value.startsWith('driver')) {
      return 'driver'
    }

    if (value.startsWith('user')) {
      return 'user'
    }
  }

  return null
}

export function normalize_presence_visible(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === 'visible') {
    return true
  }

  if (value === 'hidden') {
    return false
  }

  return null
}

export function presence_seen_at_age_seconds(input: {
  seen_at: string | null
  now?: Date
}): number | null {
  if (!input.seen_at) {
    return null
  }

  const seen_ms = Date.parse(input.seen_at)

  if (!Number.isFinite(seen_ms)) {
    return null
  }

  const now_ms = (input.now ?? new Date()).getTime()

  return Math.max(0, Math.floor((now_ms - seen_ms) / 1000))
}

export function presence_seen_at_is_fresh(input: {
  seen_at: string | null
  threshold_ms?: number
  now?: Date
}): boolean {
  if (!input.seen_at) {
    return false
  }

  const seen_ms = Date.parse(input.seen_at)

  if (!Number.isFinite(seen_ms)) {
    return false
  }

  const threshold_ms = input.threshold_ms ?? presence_fresh_threshold_ms
  const now_ms = (input.now ?? new Date()).getTime()

  return now_ms - seen_ms <= threshold_ms
}

export function decide_presence_write(
  context: presence_context_ok,
): presence_write_decision {
  if (!context.user_uuid.trim()) {
    return {
      ok: false,
      skipped_reason: 'user_uuid_missing',
    }
  }

  if (!context.role.trim()) {
    return {
      ok: false,
      skipped_reason: 'role_missing',
    }
  }

  return {
    ok: true,
    user_uuid: context.user_uuid,
    role: context.role,
    channel: context.channel,
    area: context.area,
    visible: context.visible,
  }
}

export function decide_external_notification_skip(input: {
  presence: receiver_presence_row | null
  now?: Date
}): external_notification_presence_decision {
  const presence = input.presence

  if (!presence) {
    return {
      skip_external: false,
      external_notification_skipped_reason: null,
      presence_found: false,
      presence_visible: null,
      presence_seen_at: null,
      presence_age_seconds: null,
      presence_area: null,
      receiver_channel: null,
    }
  }

  const presence_age_seconds = presence_seen_at_age_seconds({
    seen_at: presence.seen_at,
    now: input.now,
  })

  const base = {
    presence_found: true,
    presence_visible: presence.visible,
    presence_seen_at: presence.seen_at,
    presence_age_seconds,
    presence_area: presence.area,
    receiver_channel: presence.channel,
  }

  if (presence.visible !== true) {
    return {
      ...base,
      skip_external: false,
      external_notification_skipped_reason: 'presence_hidden',
    }
  }

  if (
    !presence_seen_at_is_fresh({
      seen_at: presence.seen_at,
      now: input.now,
    })
  ) {
    return {
      ...base,
      skip_external: false,
      external_notification_skipped_reason: 'presence_stale',
    }
  }

  const channel = normalize_presence_channel(presence.channel)

  return {
    ...base,
    skip_external: true,
    external_notification_skipped_reason:
      channel === 'liff'
        ? 'receiver_active_in_liff'
        : channel === 'pwa'
          ? 'receiver_active_in_pwa'
          : 'receiver_active_in_web',
  }
}

export function resolve_external_notification_allow_reason(
  decision: external_notification_presence_decision,
): string {
  if (decision.skip_external) {
    return decision.external_notification_skipped_reason ?? 'receiver_active_in_app'
  }

  if (!decision.presence_found) {
    return 'presence_missing'
  }

  if (decision.presence_visible !== true) {
    return 'presence_hidden'
  }

  return 'presence_stale'
}
