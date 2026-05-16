export const support_stale_session_ms = 2 * 60 * 1000

export type support_enter_skip_reason =
  | 'same_support_session_active'
  | 'active_other_session'

export type support_enter_decision =
  | { decision: 'create_new' }
  | {
      decision: 'skip'
      skipped_reason: support_enter_skip_reason
      latest_action_uuid: string | null
      latest_created_at: string | null
      latest_session_key: string | null
      current_session_key: string
    }
  | {
      decision: 'close_stale_and_create'
      latest_action_uuid: string | null
      latest_created_at: string | null
      latest_session_key: string | null
      current_session_key: string
      stale_session_key: string | null
    }

export function build_support_session_key(input: {
  room_uuid: string
  admin_participant_uuid: string
  client_session_id: string
}): string {
  const room_uuid = input.room_uuid.trim()
  const admin_participant_uuid = input.admin_participant_uuid.trim()
  const client_session_id = input.client_session_id.trim()

  return `${room_uuid}|${admin_participant_uuid}|${client_session_id}`
}

export function read_support_session_key_from_meta(
  meta_json: unknown,
): string | null {
  if (!meta_json || typeof meta_json !== 'object' || Array.isArray(meta_json)) {
    return null
  }

  const value = (meta_json as Record<string, unknown>).support_session_key

  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function support_started_age_ms(
  created_at: string | null,
  now_ms: number = Date.now(),
): number | null {
  if (!created_at) {
    return null
  }

  const created_ms = new Date(created_at).getTime()

  if (Number.isNaN(created_ms)) {
    return null
  }

  return Math.max(0, now_ms - created_ms)
}

export function decide_admin_support_enter(input: {
  latest_action_type: string | null
  latest_action_uuid: string | null
  latest_created_at: string | null
  latest_session_key: string | null
  current_session_key: string
  now_ms?: number
}): support_enter_decision {
  const current_session_key = input.current_session_key.trim()
  const latest_session_key = input.latest_session_key?.trim() || null

  if (input.latest_action_type !== 'support_started') {
    return { decision: 'create_new' }
  }

  const base = {
    latest_action_uuid: input.latest_action_uuid,
    latest_created_at: input.latest_created_at,
    latest_session_key,
    current_session_key,
  }

  if (latest_session_key && latest_session_key === current_session_key) {
    return {
      decision: 'skip',
      skipped_reason: 'same_support_session_active',
      ...base,
    }
  }

  const age_ms = support_started_age_ms(
    input.latest_created_at,
    input.now_ms ?? Date.now(),
  )

  if (age_ms === null || age_ms >= support_stale_session_ms) {
    return {
      decision: 'close_stale_and_create',
      stale_session_key: latest_session_key,
      ...base,
    }
  }

  return {
    decision: 'skip',
    skipped_reason: 'active_other_session',
    ...base,
  }
}
