import { NextResponse } from 'next/server'

import { debug_event } from '@/lib/debug'

type chat_debug_body = {
  category?: unknown
  level?: unknown
  event?: unknown
  room_uuid?: unknown
  active_room_uuid?: unknown
  participant_uuid?: unknown
  admin_participant_uuid?: unknown
  admin_user_uuid?: unknown
  user_uuid?: unknown
  role?: unknown
  tier?: unknown
  source_channel?: unknown
  subscribe_status?: unknown
  subscription_status?: unknown
  channel_name?: unknown
  event_name?: unknown
  schema?: unknown
  postgres_event?: unknown
  table?: unknown
  filter?: unknown
  message_uuid?: unknown
  created_at?: unknown
  card_exists?: unknown
  payload_message_uuid?: unknown
  payload_action_uuid?: unknown
  payload_room_uuid?: unknown
  sender_user_uuid?: unknown
  sender_participant_uuid?: unknown
  active_participant_uuid?: unknown
  active_user_uuid?: unknown
  sender_role?: unknown
  active_role?: unknown
  display_name?: unknown
  is_typing?: unknown
  is_active?: unknown
  last_seen_at?: unknown
  typing_at?: unknown
  ignored_reason?: unknown
  phase?: unknown
  error_code?: unknown
  error_message?: unknown
  error_details?: unknown
  error_hint?: unknown
  error_json?: unknown
  admin_user_uuid_exists?: unknown
  admin_participant_uuid_exists?: unknown
  prev_message_count?: unknown
  next_message_count?: unknown
  prev_room_count?: unknown
  next_room_count?: unknown
  dedupe_hit?: unknown
  cleanup_reason?: unknown
  is_self_sender?: unknown
  comparison_strategy?: unknown
  guest_strategy_used?: unknown
  channel_topic?: unknown
  listener_registered?: unknown
  client_instance_id?: unknown
  payload_preview?: unknown
  visibility_state?: unknown
  is_scrolled_to_bottom?: unknown
  skip_reason?: unknown
  message_channel?: unknown
  message_source_channel?: unknown
  message_direction?: unknown
  channel?: unknown
  direction?: unknown
  last_message_at?: unknown
  selected_room_uuid?: unknown
  support_mode?: unknown
  skipped_reason?: unknown
  dependency_values?: unknown
  mounted_at?: unknown
  component_file?: unknown
  support_lifecycle_owner?: unknown
  payload_channel?: unknown
  payload_source_channel?: unknown
  payload_direction?: unknown
  message_count_before?: unknown
  message_count_after?: unknown
  oldest_created_at?: unknown
  newest_created_at?: unknown
  realtime_message_uuid?: unknown
  realtime_created_at?: unknown
  unread_admin_count?: unknown
  admin_last_read_at?: unknown
  actor_admin_user_uuid?: unknown
  summary_type?: unknown
  summary_text?: unknown
  active_admin_count?: unknown
  typing_exists?: unknown
  unread_count?: unknown
  action_uuid?: unknown
  support_session_key?: unknown
  existing_left_action_uuid?: unknown
  existing_action_uuid?: unknown
  existing_action_count?: unknown
  created_action_uuid?: unknown
  event_type?: unknown
  actor_name?: unknown
  inserted_index?: unknown
  prev_count?: unknown
  next_count?: unknown
  latest_activity_at?: unknown
  previous_preview?: unknown
  next_preview?: unknown
  previous_room_uuid?: unknown
  next_room_uuid?: unknown
  leave_reason?: unknown
  trigger_source?: unknown
  stack_hint?: unknown
  timestamp?: unknown
  reason?: unknown
  pathname?: unknown
  action_type?: unknown
  owner?: unknown
  reception_state?: unknown
  previous_state?: unknown
  next_state?: unknown
  room_count?: unknown
  should_render_rooms?: unknown
}

function string_or_null(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function number_or_null(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function boolean_or_null(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function json_string_or_null(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as chat_debug_body | null
  const event = string_or_null(body?.event)
  const category_raw = string_or_null(body?.category)
  const category =
    category_raw?.toLowerCase() === 'admin_chat'
      ? 'admin_chat'
      : category_raw?.toLowerCase() === 'chat_realtime'
        ? 'chat_realtime'
        : 'chat_realtime'

  if (!event) {
    return NextResponse.json(
      { ok: false, error: 'missing_debug_event' },
      { status: 400 },
    )
  }

  await debug_event({
    category,
    event,
    payload: {
      level: string_or_null(body?.level),
      room_uuid: string_or_null(body?.room_uuid),
      active_room_uuid: string_or_null(body?.active_room_uuid),
      participant_uuid: string_or_null(body?.participant_uuid),
      admin_participant_uuid: string_or_null(body?.admin_participant_uuid),
      admin_user_uuid: string_or_null(body?.admin_user_uuid),
      user_uuid: string_or_null(body?.user_uuid),
      role: string_or_null(body?.role),
      tier: string_or_null(body?.tier),
      source_channel: string_or_null(body?.source_channel) ?? 'web',
      subscribe_status: string_or_null(body?.subscribe_status),
      subscription_status: string_or_null(body?.subscription_status),
      channel_name: string_or_null(body?.channel_name),
      event_name: string_or_null(body?.event_name),
      schema: string_or_null(body?.schema),
      postgres_event: string_or_null(body?.postgres_event),
      table: string_or_null(body?.table),
      filter: string_or_null(body?.filter),
      message_uuid: string_or_null(body?.message_uuid),
      created_at: string_or_null(body?.created_at),
      card_exists:
        typeof body?.card_exists === 'boolean' ? body.card_exists : null,
      payload_message_uuid: string_or_null(body?.payload_message_uuid),
      payload_action_uuid: string_or_null(body?.payload_action_uuid),
      payload_room_uuid: string_or_null(body?.payload_room_uuid),
      sender_user_uuid: string_or_null(body?.sender_user_uuid),
      sender_participant_uuid: string_or_null(body?.sender_participant_uuid),
      active_participant_uuid: string_or_null(body?.active_participant_uuid),
      active_user_uuid: string_or_null(body?.active_user_uuid),
      sender_role: string_or_null(body?.sender_role),
      active_role: string_or_null(body?.active_role),
      display_name: string_or_null(body?.display_name),
      is_typing:
        typeof body?.is_typing === 'boolean' ? body.is_typing : null,
      is_active:
        typeof body?.is_active === 'boolean' ? body.is_active : null,
      last_seen_at: string_or_null(body?.last_seen_at),
      typing_at: string_or_null(body?.typing_at),
      ignored_reason: string_or_null(body?.ignored_reason),
      phase: string_or_null(body?.phase),
      error_code: string_or_null(body?.error_code),
      error_message: string_or_null(body?.error_message),
      error_details: string_or_null(body?.error_details),
      error_hint: string_or_null(body?.error_hint),
      error_json: json_string_or_null(body?.error_json),
      admin_user_uuid_exists: boolean_or_null(body?.admin_user_uuid_exists),
      admin_participant_uuid_exists: boolean_or_null(
        body?.admin_participant_uuid_exists,
      ),
      prev_message_count: number_or_null(body?.prev_message_count),
      next_message_count: number_or_null(body?.next_message_count),
      prev_room_count: number_or_null(body?.prev_room_count),
      next_room_count: number_or_null(body?.next_room_count),
      dedupe_hit:
        typeof body?.dedupe_hit === 'boolean' ? body.dedupe_hit : null,
      cleanup_reason: string_or_null(body?.cleanup_reason),
      is_self_sender:
        typeof body?.is_self_sender === 'boolean' ? body.is_self_sender : null,
      comparison_strategy: string_or_null(body?.comparison_strategy),
      guest_strategy_used:
        typeof body?.guest_strategy_used === 'boolean'
          ? body.guest_strategy_used
          : null,
      channel_topic: string_or_null(body?.channel_topic),
      listener_registered:
        typeof body?.listener_registered === 'boolean'
          ? body.listener_registered
          : null,
      client_instance_id: string_or_null(body?.client_instance_id),
      payload_preview: string_or_null(body?.payload_preview),
      visibility_state: string_or_null(body?.visibility_state),
      is_scrolled_to_bottom:
        typeof body?.is_scrolled_to_bottom === 'boolean'
          ? body.is_scrolled_to_bottom
          : null,
      skip_reason: string_or_null(body?.skip_reason),
      message_channel: string_or_null(body?.message_channel),
      message_source_channel: string_or_null(body?.message_source_channel),
      message_direction: string_or_null(body?.message_direction),
      channel: string_or_null(body?.channel),
      direction: string_or_null(body?.direction),
      last_message_at: string_or_null(body?.last_message_at),
      selected_room_uuid: string_or_null(body?.selected_room_uuid),
      support_mode: string_or_null(body?.support_mode),
      skipped_reason: string_or_null(body?.skipped_reason),
      dependency_values: string_or_null(body?.dependency_values),
      mounted_at: string_or_null(body?.mounted_at),
      component_file: string_or_null(body?.component_file),
      support_lifecycle_owner: string_or_null(body?.support_lifecycle_owner),
      payload_channel: string_or_null(body?.payload_channel),
      payload_source_channel: string_or_null(body?.payload_source_channel),
      payload_direction: string_or_null(body?.payload_direction),
      message_count_before: number_or_null(body?.message_count_before),
      message_count_after: number_or_null(body?.message_count_after),
      oldest_created_at: string_or_null(body?.oldest_created_at),
      newest_created_at: string_or_null(body?.newest_created_at),
      realtime_message_uuid: string_or_null(body?.realtime_message_uuid),
      realtime_created_at: string_or_null(body?.realtime_created_at),
      unread_admin_count: number_or_null(body?.unread_admin_count),
      admin_last_read_at: string_or_null(body?.admin_last_read_at),
      actor_admin_user_uuid: string_or_null(body?.actor_admin_user_uuid),
      summary_type: string_or_null(body?.summary_type),
      summary_text: string_or_null(body?.summary_text),
      active_admin_count: number_or_null(body?.active_admin_count),
      typing_exists:
        typeof body?.typing_exists === 'boolean' ? body.typing_exists : null,
      unread_count: number_or_null(body?.unread_count),
      latest_activity_at: string_or_null(body?.latest_activity_at),
      action_uuid: string_or_null(body?.action_uuid),
      support_session_key: string_or_null(body?.support_session_key),
      existing_left_action_uuid: string_or_null(body?.existing_left_action_uuid),
      existing_action_uuid: string_or_null(body?.existing_action_uuid),
      existing_action_count: number_or_null(body?.existing_action_count),
      created_action_uuid: string_or_null(body?.created_action_uuid),
      event_type: string_or_null(body?.event_type),
      actor_name: string_or_null(body?.actor_name),
      inserted_index: number_or_null(body?.inserted_index),
      prev_count: number_or_null(body?.prev_count),
      next_count: number_or_null(body?.next_count),
      previous_preview: string_or_null(body?.previous_preview),
      next_preview: string_or_null(body?.next_preview),
      previous_room_uuid: string_or_null(body?.previous_room_uuid),
      next_room_uuid: string_or_null(body?.next_room_uuid),
      leave_reason: string_or_null(body?.leave_reason),
      trigger_source: string_or_null(body?.trigger_source),
      stack_hint: string_or_null(body?.stack_hint),
      timestamp: string_or_null(body?.timestamp),
      reason: string_or_null(body?.reason),
      pathname: string_or_null(body?.pathname),
      action_type: string_or_null(body?.action_type),
      owner: string_or_null(body?.owner),
      reception_state: string_or_null(body?.reception_state),
      previous_state: string_or_null(body?.previous_state),
      next_state: string_or_null(body?.next_state),
      room_count: number_or_null(body?.room_count),
      should_render_rooms: boolean_or_null(body?.should_render_rooms),
    },
  })

  return NextResponse.json({ ok: true })
}
