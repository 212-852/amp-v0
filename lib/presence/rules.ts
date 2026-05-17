export type presence_source_channel = 'web' | 'pwa' | 'liff'

export type presence_active_area =
  | 'admin_app'
  | 'admin_reception_list'
  | 'admin_reception_room'

export type presence_visibility_state = 'visible' | 'hidden'

export type presence_context_ok = {
  user_uuid: string
  role: string | null
  source_channel: presence_source_channel | null
  active_area: presence_active_area | null
  active_room_uuid: string | null
  visibility_state: presence_visibility_state
}

export type presence_write_decision =
  | {
      ok: true
      user_uuid: string
      role: 'admin'
      source_channel: presence_source_channel
      active_area: presence_active_area
      active_room_uuid: string | null
      visibility_state: presence_visibility_state
      is_active: boolean
    }
  | {
      ok: false
      skipped_reason: string
    }

export function normalize_presence_source_channel(
  value: unknown,
): presence_source_channel | null {
  return value === 'web' || value === 'pwa' || value === 'liff' ? value : null
}

export function normalize_presence_active_area(
  value: unknown,
): presence_active_area | null {
  return value === 'admin_app' ||
    value === 'admin_reception_list' ||
    value === 'admin_reception_room'
    ? value
    : null
}

export function normalize_presence_visibility_state(
  value: unknown,
): presence_visibility_state {
  return value === 'visible' ? 'visible' : 'hidden'
}

export function decide_presence_write(
  context: presence_context_ok,
): presence_write_decision {
  if (context.role !== 'admin') {
    return {
      ok: false,
      skipped_reason: 'admin_role_required',
    }
  }

  if (!context.source_channel) {
    return {
      ok: false,
      skipped_reason: 'source_channel_invalid',
    }
  }

  if (!context.active_area) {
    return {
      ok: false,
      skipped_reason: 'active_area_invalid',
    }
  }

  return {
    ok: true,
    user_uuid: context.user_uuid,
    role: 'admin',
    source_channel: context.source_channel,
    active_area: context.active_area,
    active_room_uuid:
      context.active_area === 'admin_reception_room'
        ? context.active_room_uuid
        : null,
    visibility_state: context.visibility_state,
    is_active: context.visibility_state === 'visible',
  }
}
