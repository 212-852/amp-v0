'use client'

import type { MutableRefObject } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

import { get_browser_supabase_client_instance_id } from '@/lib/db/browser'

import {
  archived_message_from_message_row,
  type message_insert_row,
  type realtime_archived_message,
} from './row'
import { is_self_typing_broadcast } from './typing_identity'

export type chat_realtime_role = 'user' | 'admin' | 'concierge' | 'bot'

export type chat_typing_payload = {
  room_uuid: string
  participant_uuid: string
  user_uuid?: string | null
  role: chat_realtime_role
  display_name?: string | null
  is_typing: boolean
  sent_at: string
  typed_at?: string
}

export type chat_presence_payload = {
  room_uuid: string
  participant_uuid: string
  user_uuid: string | null
  role: string | null
  is_active: boolean
  is_typing: boolean
  last_seen_at: string | null
  typing_at: string | null
  source_channel: string | null
}

/** User and admin must use the same topic string for broadcast typing. */
export function chat_room_realtime_channel_name(room_uuid: string) {
  return `room:${room_uuid}`
}

export type chat_realtime_listener_scope = 'default' | 'admin_list' | 'admin_active'

/** Postgres listener channel per surface (avoids Supabase channel name collisions). */
export function chat_realtime_postgres_channel_name(
  room_uuid: string,
  scope: chat_realtime_listener_scope = 'default',
) {
  if (scope === 'admin_list') {
    return `admin_room_list:${room_uuid}`
  }

  if (scope === 'admin_active') {
    return `admin_active_chat:${room_uuid}`
  }

  return chat_room_realtime_channel_name(room_uuid)
}

export type {
  chat_action_realtime_payload,
  chat_support_action_payload,
} from './chat_actions'

const typing_companion_channels = new WeakMap<RealtimeChannel, RealtimeChannel>()

export const chat_typing_expire_ms = 5_000

export function chat_typing_is_fresh(input: {
  is_typing: boolean
  sent_at: string
  now?: Date
}) {
  if (!input.is_typing) {
    return false
  }

  const sent_at = new Date(input.sent_at).getTime()

  if (Number.isNaN(sent_at)) {
    return false
  }

  return (input.now ?? new Date()).getTime() - sent_at <= chat_typing_expire_ms
}

type chat_room_realtime_channel_meta_type = {
  typing_listener_bound: boolean
  subscribe_callback_status: string | null
  room_uuid: string
}

const chat_room_realtime_channel_meta = new WeakMap<
  RealtimeChannel,
  chat_room_realtime_channel_meta_type
>()

const chat_room_channel_client_ids = new WeakMap<RealtimeChannel, string>()

function read_realtime_channel_state(channel: RealtimeChannel): string | null {
  const state = (channel as { state?: string }).state

  return typeof state === 'string' && state.length ? state : null
}

function broadcast_inner_payload_preview(value: unknown): string {
  if (value === null || value === undefined) {
    return 'empty'
  }

  if (typeof value !== 'object') {
    return typeof value
  }

  const keys = Object.keys(value as Record<string, unknown>).sort().join(',')

  return `keys:${keys}`
}

function extract_admin_realtime_insert_fields(raw: Record<string, unknown>) {
  const payload_room_uuid =
    typeof raw.room_uuid === 'string' ? raw.room_uuid : null
  const message_uuid =
    typeof raw.message_uuid === 'string' ? raw.message_uuid : null
  const message_channel =
    typeof raw.channel === 'string' ? raw.channel : null

  let message_source_channel: string | null = null
  let message_direction: string | null = null

  const body = raw.body

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const b = body as Record<string, unknown>
    message_source_channel =
      typeof b.source_channel === 'string' ? b.source_channel : null
    message_direction =
      typeof b.direction === 'string' ? b.direction : null
  } else if (typeof body === 'string' && body.trim()) {
    try {
      const b = JSON.parse(body) as Record<string, unknown>
      message_source_channel =
        typeof b.source_channel === 'string' ? b.source_channel : null
      message_direction =
        typeof b.direction === 'string' ? b.direction : null
    } catch {
      /* keep null */
    }
  }

  return {
    payload_room_uuid,
    message_uuid,
    message_channel,
    message_source_channel,
    message_direction,
  }
}

function admin_realtime_message_field_payload(input: {
  message_channel: string | null
  message_source_channel: string | null
  message_direction: string | null
}) {
  return {
    message_channel: input.message_channel,
    message_source_channel: input.message_source_channel,
    message_direction: input.message_direction,
    payload_channel: input.message_channel,
    payload_source_channel: input.message_source_channel,
    payload_direction: input.message_direction,
  }
}

export type chat_realtime_debug_payload = {
  event: string
  room_uuid: string | null
  active_room_uuid?: string | null
  participant_uuid?: string | null
  admin_participant_uuid?: string | null
  admin_user_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: string | null
  subscribe_status?: string | null
  channel_name?: string | null
  event_name?: string | null
  schema?: string | null
  postgres_event?: string | null
  table?: string | null
  filter?: string | null
  message_uuid?: string | null
  created_at?: string | null
  card_exists?: boolean | null
  payload_message_uuid?: string | null
  payload_action_uuid?: string | null
  payload_room_uuid?: string | null
  sender_user_uuid?: string | null
  sender_participant_uuid?: string | null
  active_participant_uuid?: string | null
  active_user_uuid?: string | null
  active_role?: string | null
  sender_role?: string | null
  display_name?: string | null
  is_typing?: boolean | null
  is_active?: boolean | null
  last_seen_at?: string | null
  typing_at?: string | null
  ignored_reason?: string | null
  error_code?: string | null
  error_message?: string | null
  error_details?: string | null
  error_hint?: string | null
  prev_message_count?: number | null
  next_message_count?: number | null
  prev_room_count?: number | null
  next_room_count?: number | null
  dedupe_hit?: boolean | null
  phase: string
  cleanup_reason?: string | null
  is_self_sender?: boolean | null
  comparison_strategy?: string | null
  guest_strategy_used?: boolean | null
  channel_topic?: string | null
  listener_registered?: boolean | null
  client_instance_id?: string | null
  payload_preview?: string | null
  visibility_state?: string | null
  is_scrolled_to_bottom?: boolean | null
  skip_reason?: string | null
  message_channel?: string | null
  message_source_channel?: string | null
  message_direction?: string | null
  channel?: string | null
  direction?: string | null
  last_message_at?: string | null
  selected_room_uuid?: string | null
  support_mode?: string | null
  skipped_reason?: string | null
  dependency_values?: string | null
  mounted_at?: string | null
  /** `messages.channel` (e.g. line); distinct from listener `source_channel`. */
  payload_channel?: string | null
  /** Body `source_channel` (e.g. line). */
  payload_source_channel?: string | null
  /** Body `direction` (e.g. incoming). */
  payload_direction?: string | null
  message_count_before?: number | null
  message_count_after?: number | null
  oldest_created_at?: string | null
  newest_created_at?: string | null
  realtime_message_uuid?: string | null
  realtime_created_at?: string | null
  unread_admin_count?: number | null
  admin_last_read_at?: string | null
  actor_admin_user_uuid?: string | null
  summary_type?: string | null
  summary_text?: string | null
  active_admin_count?: number | null
  typing_exists?: boolean | null
  unread_count?: number | null
  action_uuid?: string | null
  event_type?: string | null
  actor_name?: string | null
  inserted_index?: number | null
  prev_count?: number | null
  next_count?: number | null
  latest_activity_at?: string | null
  previous_preview?: string | null
  next_preview?: string | null
  previous_room_uuid?: string | null
  next_room_uuid?: string | null
  leave_reason?: string | null
  reason?: string | null
  pathname?: string | null
  action_type?: string | null
}

export function send_chat_realtime_debug(input: chat_realtime_debug_payload) {
  void fetch('/api/debug/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => {})
}

function console_chat_realtime(message: string, data: Record<string, unknown>) {
  if (typeof console === 'undefined' || !console.log) {
    return
  }

  console.log(`[chat_realtime] ${message}`, data)
}

function is_chat_typing_payload(value: unknown): value is chat_typing_payload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const row = value as Record<string, unknown>

  return (
    typeof row.room_uuid === 'string' &&
    typeof row.participant_uuid === 'string' &&
    typeof row.role === 'string' &&
    typeof row.is_typing === 'boolean' &&
    (typeof row.sent_at === 'string' || typeof row.typed_at === 'string')
  )
}

function normalize_chat_typing_payload(
  value: chat_typing_payload,
): chat_typing_payload {
  return {
    ...value,
    sent_at: value.sent_at ?? value.typed_at ?? new Date().toISOString(),
  }
}

function presence_payload_from_participant_row(
  value: unknown,
): chat_presence_payload | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const row = value as Record<string, unknown>

  if (
    typeof row.room_uuid !== 'string' ||
    typeof row.participant_uuid !== 'string'
  ) {
    return null
  }

  const user_uuid_raw = row.user_uuid
  const user_uuid =
    typeof user_uuid_raw === 'string' && user_uuid_raw.trim()
      ? user_uuid_raw.trim()
      : null

  return {
    room_uuid: row.room_uuid,
    participant_uuid: row.participant_uuid,
    user_uuid,
    role: typeof row.role === 'string' ? row.role : null,
    is_active: row.is_active === true,
    is_typing: row.is_typing === true,
    last_seen_at:
      typeof row.last_seen_at === 'string' ? row.last_seen_at : null,
    typing_at: typeof row.typing_at === 'string' ? row.typing_at : null,
    source_channel:
      typeof row.last_channel === 'string' ? row.last_channel : null,
  }
}

function admin_subscribe_started_event(scope: chat_realtime_listener_scope) {
  if (scope === 'admin_list') {
    return 'admin_room_list_realtime_subscribe_started'
  }

  if (scope === 'admin_active') {
    return 'admin_active_chat_realtime_subscribe_started'
  }

  return 'chat_realtime_subscribe_started'
}

function admin_message_received_event(scope: chat_realtime_listener_scope) {
  if (scope === 'admin_list') {
    return 'admin_room_list_message_received'
  }

  if (scope === 'admin_active') {
    return 'admin_active_chat_realtime_payload_received'
  }

  return 'admin_realtime_payload_received'
}

function admin_message_accepted_event(scope: chat_realtime_listener_scope) {
  if (scope === 'admin_list') {
    return 'admin_room_list_message_accepted'
  }

  if (scope === 'admin_active') {
    return 'admin_active_chat_realtime_payload_accepted'
  }

  return 'admin_realtime_payload_accepted'
}

function admin_message_ignored_event(scope: chat_realtime_listener_scope) {
  if (scope === 'admin_list') {
    return 'admin_room_list_message_ignored'
  }

  if (scope === 'admin_active') {
    return 'admin_active_chat_realtime_payload_ignored'
  }

  return 'admin_realtime_payload_ignored'
}

export function subscribe_chat_room_realtime(input: {
  supabase: SupabaseClient
  room_uuid: string
  active_room_uuid?: string | null
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: string | null
  listener_scope?: chat_realtime_listener_scope
  /** When set, broadcast self filter reads latest identity each callback (avoids stale subscribe closure). */
  active_typing_identity_ref?: MutableRefObject<{
    user_uuid: string | null
    participant_uuid: string | null
    role: string | null
  }>
  on_message: (message: realtime_archived_message) => void
  on_typing: (payload: chat_typing_payload) => void
  on_presence?: (payload: chat_presence_payload) => void
}): RealtimeChannel {
  const listener_scope = input.listener_scope ?? 'default'
  const channel_name = chat_realtime_postgres_channel_name(
    input.room_uuid,
    listener_scope,
  )
  const postgres_filter = `room_uuid=eq.${input.room_uuid}`
  const is_admin_listener = input.source_channel === 'admin'
  const base_debug = {
    room_uuid: input.room_uuid,
    active_room_uuid: input.active_room_uuid ?? input.room_uuid,
    participant_uuid: input.participant_uuid,
    user_uuid: input.user_uuid,
    role: input.role,
    tier: input.tier,
    source_channel: input.source_channel ?? 'web',
    channel_name,
    event_name: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: postgres_filter,
  }

  send_chat_realtime_debug({
    event: admin_subscribe_started_event(listener_scope),
    ...base_debug,
    subscribe_status: 'SUBSCRIBE_REQUESTED',
    postgres_event: 'INSERT',
    phase: 'subscribe_chat_room_realtime',
  })

  send_chat_realtime_debug({
    event: 'chat_realtime_subscribe_started',
    ...base_debug,
    subscribe_status: 'SUBSCRIBE_REQUESTED',
    postgres_event: 'INSERT',
    phase: 'subscribe_chat_room_realtime',
  })

  console_chat_realtime('subscribe_started', {
    channel_name,
    room_uuid: input.room_uuid,
    active_room_uuid: input.active_room_uuid ?? input.room_uuid,
    filter: postgres_filter,
  })

  const channel = input.supabase
    .channel(channel_name, {
      config: {
        broadcast: { self: true },
      },
    })

  const client_instance_id =
    get_browser_supabase_client_instance_id(input.supabase) ?? 'unknown_client'

  chat_room_realtime_channel_meta.set(channel, {
    typing_listener_bound: false,
    subscribe_callback_status: null,
    room_uuid: input.room_uuid,
  })
  chat_room_channel_client_ids.set(channel, client_instance_id)

  send_chat_realtime_debug({
    event: 'chat_typing_channel_instance_created',
    ...base_debug,
    channel_topic: channel_name,
    subscribe_status: read_realtime_channel_state(channel),
    listener_registered: false,
    client_instance_id,
    phase: 'typing_channel_constructed',
  })

  send_chat_realtime_debug({
    event: 'chat_realtime_channel_created',
    ...base_debug,
    phase: 'channel_created',
  })

  console_chat_realtime('channel_created', {
    channel_name,
    room_uuid: input.room_uuid,
    filter: postgres_filter,
  })

  channel
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: postgres_filter,
      },
      (payload) => {
        const raw_new = payload.new as Record<string, unknown> | undefined
        const is_admin_listener = input.source_channel === 'admin'
        const admin_insert =
          is_admin_listener && raw_new
            ? extract_admin_realtime_insert_fields(raw_new)
            : null

        if (admin_insert) {
          send_chat_realtime_debug({
            event:
              listener_scope === 'default'
                ? 'admin_realtime_payload_received'
                : admin_message_received_event(listener_scope),
            ...base_debug,
            active_room_uuid: input.active_room_uuid ?? input.room_uuid,
            payload_room_uuid: admin_insert.payload_room_uuid,
            message_uuid: admin_insert.message_uuid,
            payload_message_uuid: admin_insert.message_uuid,
            ...admin_realtime_message_field_payload(admin_insert),
            prev_message_count: null,
            next_message_count: null,
            phase: 'postgres_changes_insert_admin',
          })
        }

        const entry_room_uuid =
          raw_new && typeof raw_new.room_uuid === 'string'
            ? raw_new.room_uuid
            : null
        const entry_message_uuid =
          raw_new && typeof raw_new.message_uuid === 'string'
            ? raw_new.message_uuid
            : null

        send_chat_realtime_debug({
          event: 'chat_realtime_postgres_changes_callback_fired',
          ...base_debug,
          postgres_event: 'INSERT',
          payload_message_uuid: entry_message_uuid,
          payload_room_uuid: entry_room_uuid,
          phase: 'postgres_changes_insert_entry',
        })

        console_chat_realtime('postgres_insert_callback_fired', {
          channel_name,
          table: 'messages',
          schema: 'public',
          payload_room_uuid: entry_room_uuid,
          message_uuid: entry_message_uuid,
        })

        const row = payload.new as message_insert_row & { room_uuid?: string }
        const payload_room_uuid =
          typeof row?.room_uuid === 'string' ? row.room_uuid : null
        const message_uuid =
          typeof row?.message_uuid === 'string' ? row.message_uuid : null

        if (payload_room_uuid && payload_room_uuid !== input.room_uuid) {
          if (admin_insert) {
            send_chat_realtime_debug({
              event:
                listener_scope === 'default'
                  ? 'admin_realtime_payload_ignored'
                  : admin_message_ignored_event(listener_scope),
              ...base_debug,
              active_room_uuid: input.active_room_uuid ?? input.room_uuid,
              payload_room_uuid,
              message_uuid,
              payload_message_uuid: message_uuid,
              ...admin_realtime_message_field_payload(admin_insert),
              sender_participant_uuid: null,
              ignored_reason: 'payload_room_uuid_mismatch',
              prev_message_count: null,
              next_message_count: null,
              phase: 'postgres_changes_insert_admin',
            })
          }

          send_chat_realtime_debug({
            event: 'chat_realtime_message_callback_ignored',
            ...base_debug,
            payload_message_uuid: message_uuid,
            payload_room_uuid,
            ignored_reason: 'payload_room_uuid_mismatch',
            phase: 'postgres_changes_insert',
          })

          console_chat_realtime('message_callback_ignored', {
            expected: input.room_uuid,
            payload_room_uuid,
            message_uuid,
            ignored_reason: 'payload_room_uuid_mismatch',
          })

          return
        }

        const message = archived_message_from_message_row(row as message_insert_row)

        if (!message) {
          if (admin_insert) {
            send_chat_realtime_debug({
              event:
                listener_scope === 'default'
                  ? 'admin_realtime_payload_ignored'
                  : admin_message_ignored_event(listener_scope),
              ...base_debug,
              active_room_uuid: input.active_room_uuid ?? input.room_uuid,
              payload_room_uuid,
              message_uuid,
              payload_message_uuid: message_uuid,
              ...admin_realtime_message_field_payload(admin_insert),
              sender_participant_uuid: null,
              ignored_reason: 'unparseable_message_row',
              prev_message_count: null,
              next_message_count: null,
              phase: 'postgres_changes_insert_admin',
            })
          }

          send_chat_realtime_debug({
            event: 'chat_realtime_message_callback_ignored',
            ...base_debug,
            payload_message_uuid: message_uuid,
            payload_room_uuid,
            ignored_reason: 'unparseable_message_row',
            phase: 'postgres_changes_insert',
          })

          console_chat_realtime('message_callback_ignored', {
            message_uuid,
            payload_room_uuid,
            ignored_reason: 'unparseable_message_row',
          })

          return
        }

        const sender_role =
          message.sender_role ??
          (typeof message.bundle.sender === 'string' ? message.bundle.sender : null)
        const sender_user_uuid =
          message.sender_user_uuid ??
          (message.bundle.bundle_type === 'room_action_log' &&
          typeof message.bundle.metadata?.admin_user_uuid === 'string'
            ? message.bundle.metadata.admin_user_uuid
            : null)
        const action_uuid =
          message.bundle.bundle_type === 'room_action_log'
            ? message.bundle.bundle_uuid
            : null

        if (admin_insert) {
          send_chat_realtime_debug({
            event:
              listener_scope === 'default'
                ? 'admin_realtime_payload_accepted'
                : admin_message_accepted_event(listener_scope),
            ...base_debug,
            active_room_uuid: input.active_room_uuid ?? input.room_uuid,
            payload_room_uuid,
            message_uuid: message.archive_uuid,
            payload_message_uuid: message.archive_uuid,
            ...admin_realtime_message_field_payload(admin_insert),
            sender_participant_uuid: message.sender_participant_uuid ?? null,
            ignored_reason: null,
            prev_message_count: null,
            next_message_count: null,
            phase: 'postgres_changes_insert_admin',
          })
        }

        send_chat_realtime_debug({
          event: 'chat_realtime_message_callback_received',
          ...base_debug,
          payload_message_uuid: message.archive_uuid,
          payload_action_uuid: action_uuid,
          payload_room_uuid,
          sender_user_uuid,
          sender_participant_uuid: message.sender_participant_uuid ?? null,
          sender_role,
          phase: 'postgres_changes_insert',
        })

        console_chat_realtime('message_callback_received', {
          message_uuid: message.archive_uuid,
          room_uuid: message.room_uuid,
          sender_role,
          action_uuid,
        })

        if (message.bundle.bundle_type === 'room_action_log') {
          const event =
            payload_room_uuid === input.room_uuid
              ? 'chat_realtime_action_callback_received'
              : 'chat_realtime_action_callback_ignored'

          send_chat_realtime_debug({
            event,
            ...base_debug,
            payload_message_uuid: message.archive_uuid,
            payload_action_uuid: action_uuid,
            payload_room_uuid,
            sender_user_uuid,
            sender_role,
            ignored_reason:
              event === 'chat_realtime_action_callback_ignored'
                ? 'action_room_uuid_mismatch'
                : null,
            phase: 'postgres_changes_action_log',
          })

          console_chat_realtime(
            event === 'chat_realtime_action_callback_received'
              ? 'action_callback_received'
              : 'action_callback_ignored',
            {
              message_uuid: message.archive_uuid,
              action_uuid,
              payload_room_uuid,
            },
          )
        }

        input.on_message(message)
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: postgres_filter,
      },
      (payload) => {
        const raw_new = payload.new as Record<string, unknown> | undefined
        const admin_row =
          is_admin_listener && raw_new
            ? extract_admin_realtime_insert_fields(raw_new)
            : null

        if (admin_row) {
          send_chat_realtime_debug({
            event:
              listener_scope === 'default'
                ? 'admin_realtime_payload_received'
                : admin_message_received_event(listener_scope),
            ...base_debug,
            postgres_event: 'UPDATE',
            event_name: 'UPDATE',
            active_room_uuid: input.active_room_uuid ?? input.room_uuid,
            payload_room_uuid: admin_row.payload_room_uuid,
            message_uuid: admin_row.message_uuid,
            payload_message_uuid: admin_row.message_uuid,
            ...admin_realtime_message_field_payload(admin_row),
            phase: 'postgres_changes_update_admin',
          })
        }

        const row = payload.new as message_insert_row & { room_uuid?: string }
        const payload_room_uuid =
          typeof row?.room_uuid === 'string' ? row.room_uuid : null

        if (!payload_room_uuid || payload_room_uuid !== input.room_uuid) {
          return
        }

        const message = archived_message_from_message_row(row as message_insert_row)

        if (!message) {
          return
        }

        if (admin_row) {
          send_chat_realtime_debug({
            event:
              listener_scope === 'default'
                ? 'admin_realtime_payload_accepted'
                : admin_message_accepted_event(listener_scope),
            ...base_debug,
            postgres_event: 'UPDATE',
            event_name: 'UPDATE',
            active_room_uuid: input.active_room_uuid ?? input.room_uuid,
            payload_room_uuid,
            message_uuid: message.archive_uuid,
            payload_message_uuid: message.archive_uuid,
            ...admin_realtime_message_field_payload(admin_row),
            ignored_reason: null,
            phase: 'postgres_changes_update_admin',
          })
        }

        input.on_message(message)
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'participants',
        filter: postgres_filter,
      },
      (payload) => {
        const is_admin_listener = input.source_channel === 'admin'
        const presence = presence_payload_from_participant_row(payload.new)

        if (!presence) {
          if (is_admin_listener) {
            send_chat_realtime_debug({
              event: 'admin_presence_realtime_received',
              ...base_debug,
              active_room_uuid: input.active_room_uuid ?? null,
              event_name: 'UPDATE',
              postgres_event: 'UPDATE',
              table: 'participants',
              participant_uuid: null,
              user_uuid: null,
              is_typing: null,
              ignored_reason: 'unparseable_participant_row',
              phase: 'participants_presence_update',
            })
          }
          return
        }

        if (is_admin_listener) {
          send_chat_realtime_debug({
            event: 'admin_presence_realtime_received',
            ...base_debug,
            active_room_uuid: input.active_room_uuid ?? null,
            event_name: 'UPDATE',
            postgres_event: 'UPDATE',
            table: 'participants',
            payload_room_uuid: presence.room_uuid,
            participant_uuid: presence.participant_uuid,
            admin_user_uuid:
              presence.role === 'admin' || presence.role === 'concierge'
                ? presence.user_uuid
                : null,
            user_uuid: presence.user_uuid,
            role: presence.role,
            source_channel:
              presence.source_channel ?? input.source_channel ?? 'web',
            is_active: presence.is_active,
            is_typing: presence.is_typing,
            last_seen_at: presence.last_seen_at,
            typing_at: presence.typing_at,
            ignored_reason:
              presence.room_uuid === input.room_uuid
                ? null
                : 'room_uuid_mismatch',
            phase: 'participants_presence_update',
          })
        }

        if (presence.room_uuid !== input.room_uuid) {
          if (is_admin_listener && input.on_presence) {
            send_chat_realtime_debug({
              event: 'admin_presence_payload_ignored',
              ...base_debug,
              active_room_uuid: input.active_room_uuid ?? null,
              participant_uuid: presence.participant_uuid,
              admin_user_uuid: null,
              user_uuid: presence.user_uuid,
              source_channel:
                presence.source_channel ?? input.source_channel ?? 'web',
              is_typing: presence.is_typing,
              ignored_reason: 'room_uuid_mismatch',
              phase: 'participants_presence_update',
            })
          }
          return
        }

        if (is_admin_listener && input.on_presence) {
          const role = presence.role?.trim().toLowerCase() ?? ''
          const end_user = role === 'user' || role === 'driver'
          const staff = role === 'admin' || role === 'concierge'

          if (end_user) {
            send_chat_realtime_debug({
              event: 'admin_presence_payload_accepted',
              ...base_debug,
              active_room_uuid: input.active_room_uuid ?? null,
              participant_uuid: presence.participant_uuid,
              admin_user_uuid: null,
              user_uuid: presence.user_uuid,
              source_channel:
                presence.source_channel ?? input.source_channel ?? 'web',
              is_typing: presence.is_typing,
              ignored_reason: null,
              phase: 'participants_presence_update',
            })
          } else if (staff) {
            send_chat_realtime_debug({
              event: 'admin_support_presence_realtime_received',
              ...base_debug,
              active_room_uuid: input.active_room_uuid ?? null,
              participant_uuid: presence.participant_uuid,
              admin_user_uuid: presence.user_uuid,
              user_uuid: presence.user_uuid,
              role: presence.role,
              source_channel:
                presence.source_channel ?? input.source_channel ?? 'web',
              is_active: presence.is_active,
              is_typing: presence.is_typing,
              last_seen_at: presence.last_seen_at,
              typing_at: presence.typing_at,
              ignored_reason: null,
              phase: 'participants_presence_update',
            })
          } else {
            send_chat_realtime_debug({
              event: 'admin_presence_payload_ignored',
              ...base_debug,
              active_room_uuid: input.active_room_uuid ?? null,
              participant_uuid: presence.participant_uuid,
              user_uuid: presence.user_uuid,
              source_channel:
                presence.source_channel ?? input.source_channel ?? 'web',
              is_typing: presence.is_typing,
              ignored_reason: 'presence_role_not_staff_or_end_user',
              phase: 'participants_presence_update',
            })
            return
          }
        }

        input.on_presence?.(presence)
      },
    )

  if (listener_scope !== 'admin_list') {
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const active_identity =
        input.active_typing_identity_ref?.current ?? {
          user_uuid: input.user_uuid ?? null,
          participant_uuid: input.participant_uuid ?? null,
          role: input.role ?? null,
        }

      const cid_listener = chat_room_channel_client_ids.get(channel) ?? 'unknown_channel_client'
      const meta_listener = chat_room_realtime_channel_meta.get(channel)

      send_chat_realtime_debug({
        event: 'chat_typing_listener_callback_received',
        ...base_debug,
        event_name: 'typing',
        table: null,
        filter: null,
        channel_topic: channel_name,
        subscribe_status:
          read_realtime_channel_state(channel) ??
          meta_listener?.subscribe_callback_status ??
          null,
        listener_registered: meta_listener?.typing_listener_bound ?? false,
        client_instance_id: cid_listener,
        active_user_uuid: active_identity.user_uuid,
        active_participant_uuid: active_identity.participant_uuid,
        active_role: active_identity.role,
        payload_preview: broadcast_inner_payload_preview(payload.payload),
        phase: 'broadcast_typing_listener_raw',
      })

      const raw = payload.payload

      if (!is_chat_typing_payload(raw)) {
        send_chat_realtime_debug({
          event: 'chat_typing_broadcast_ignored',
          ...base_debug,
          event_name: 'typing',
          table: null,
          filter: null,
          active_participant_uuid: active_identity.participant_uuid,
          active_user_uuid: active_identity.user_uuid,
          active_role: active_identity.role,
          ignored_reason: 'invalid_typing_payload_shape',
          phase: 'broadcast_typing',
        })

        console_chat_realtime('typing_ignored_invalid_payload', {})

        return
      }

      const typing = normalize_chat_typing_payload(raw)

      const self_result = is_self_typing_broadcast({
        active: {
          user_uuid: active_identity.user_uuid,
          participant_uuid: active_identity.participant_uuid,
          role: active_identity.role,
        },
        sender: {
          user_uuid: typing.user_uuid ?? null,
          participant_uuid: typing.participant_uuid,
          role: typing.role,
        },
      })

      send_chat_realtime_debug({
        event: 'chat_typing_identity_compare',
        ...base_debug,
        event_name: 'typing',
        table: null,
        filter: null,
        payload_room_uuid: typing.room_uuid,
        sender_user_uuid: typing.user_uuid ?? null,
        sender_participant_uuid: typing.participant_uuid,
        active_user_uuid: active_identity.user_uuid,
        active_participant_uuid: active_identity.participant_uuid,
        sender_role: typing.role,
        active_role: active_identity.role,
        is_self_sender: self_result.is_self,
        comparison_strategy: self_result.comparison_strategy,
        guest_strategy_used:
          self_result.comparison_strategy === 'guest_participant_only',
        phase: 'broadcast_typing_identity',
      })

      if (typing.room_uuid !== input.room_uuid) {
        send_chat_realtime_debug({
          event: 'chat_typing_broadcast_ignored',
          ...base_debug,
          event_name: 'typing',
          table: null,
          filter: null,
          payload_room_uuid: typing.room_uuid,
          sender_user_uuid: typing.user_uuid ?? null,
          sender_participant_uuid: typing.participant_uuid,
          active_participant_uuid: active_identity.participant_uuid,
          active_user_uuid: active_identity.user_uuid,
          active_role: active_identity.role,
          sender_role: typing.role,
          display_name: typing.display_name ?? null,
          is_typing: typing.is_typing,
          ignored_reason: 'typing_room_uuid_mismatch',
          phase: 'broadcast_typing',
        })

        console_chat_realtime('typing_ignored_room_mismatch', {
          expected: input.room_uuid,
          payload_room_uuid: typing.room_uuid,
        })

        return
      }

      if (self_result.is_self) {
        send_chat_realtime_debug({
          event: 'chat_typing_broadcast_ignored',
          ...base_debug,
          event_name: 'typing',
          table: null,
          filter: null,
          payload_room_uuid: typing.room_uuid,
          sender_user_uuid: typing.user_uuid ?? null,
          sender_participant_uuid: typing.participant_uuid,
          active_participant_uuid: active_identity.participant_uuid,
          active_user_uuid: active_identity.user_uuid,
          active_role: active_identity.role,
          sender_role: typing.role,
          display_name: typing.display_name ?? null,
          is_typing: typing.is_typing,
          ignored_reason: 'self_typing',
          is_self_sender: true,
          comparison_strategy: self_result.comparison_strategy,
          guest_strategy_used:
            self_result.comparison_strategy === 'guest_participant_only',
          phase: 'broadcast_typing',
        })

        console_chat_realtime('typing_ignored_self', {
          participant_uuid: typing.participant_uuid,
          role: typing.role,
          is_typing: typing.is_typing,
        })

        return
      }

      send_chat_realtime_debug({
        event: 'chat_typing_broadcast_received',
        ...base_debug,
        event_name: 'typing',
        table: null,
        filter: null,
        payload_room_uuid: typing.room_uuid,
        sender_user_uuid: typing.user_uuid ?? null,
        sender_participant_uuid: typing.participant_uuid,
        active_participant_uuid: active_identity.participant_uuid,
        active_user_uuid: active_identity.user_uuid,
        active_role: active_identity.role,
        sender_role: typing.role,
        display_name: typing.display_name ?? null,
        is_typing: typing.is_typing,
        is_self_sender: false,
        comparison_strategy: self_result.comparison_strategy,
        guest_strategy_used:
          self_result.comparison_strategy === 'guest_participant_only',
        phase: 'broadcast_typing',
      })

      console_chat_realtime('typing_callback_received', {
        from_participant_uuid: typing.participant_uuid,
        role: typing.role,
        is_typing: typing.is_typing,
      })

      input.on_typing(typing)
    })
  }

  if (input.source_channel === 'admin' && input.on_presence) {
    send_chat_realtime_debug({
      event: 'admin_presence_subscribe_started',
      ...base_debug,
      active_room_uuid: input.active_room_uuid ?? null,
      postgres_event: 'UPDATE',
      table: 'participants',
      event_name: 'UPDATE',
      filter: postgres_filter,
      participant_uuid: input.participant_uuid,
      user_uuid: input.user_uuid,
      is_typing: null,
      ignored_reason: null,
      phase: 'subscribe_chat_room_realtime_presence',
    })
  }

  const typing_bind_meta = chat_room_realtime_channel_meta.get(channel)

  if (typing_bind_meta) {
    typing_bind_meta.typing_listener_bound = true
  }

  const active_listener_identity =
    input.active_typing_identity_ref?.current ?? {
      user_uuid: input.user_uuid ?? null,
      participant_uuid: input.participant_uuid ?? null,
      role: input.role ?? null,
    }

  send_chat_realtime_debug({
    event: 'chat_typing_listener_registered',
    ...base_debug,
    event_name: 'typing',
    table: null,
    filter: null,
    channel_topic: channel_name,
    subscribe_status:
      read_realtime_channel_state(channel) ??
      typing_bind_meta?.subscribe_callback_status ??
      'bindings_attached',
    listener_registered: true,
    client_instance_id,
    active_user_uuid: active_listener_identity.user_uuid,
    active_participant_uuid: active_listener_identity.participant_uuid,
    active_role: active_listener_identity.role,
    phase: 'typing_listener_bound_before_subscribe',
  })

  channel.subscribe((status, err) => {
    const sub_meta = chat_room_realtime_channel_meta.get(channel)
    if (sub_meta) {
      sub_meta.subscribe_callback_status = status
    }

    console_chat_realtime('subscribe_status', {
      channel: channel_name,
      status,
      err: err ? String(err) : null,
    })

    send_chat_realtime_debug({
      event: 'chat_realtime_subscribe_status',
      ...base_debug,
      subscribe_status: status,
      postgres_event: 'INSERT',
      error_message: err ? String(err) : null,
      phase: 'subscribe_callback',
    })

    if (status === 'SUBSCRIBED') {
      send_chat_realtime_debug({
        event: 'chat_typing_listener_registered',
        ...base_debug,
        event_name: 'typing',
        table: null,
        filter: null,
        channel_topic: channel_name,
        subscribe_status: status,
        listener_registered: true,
        client_instance_id,
        active_user_uuid: input.user_uuid ?? null,
        active_participant_uuid: input.participant_uuid ?? null,
        active_role: input.role ?? null,
        phase: 'typing_channel_subscribed',
      })
    }

    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      send_chat_realtime_debug({
        event: 'chat_realtime_subscribe_failed',
        ...base_debug,
        subscribe_status: status,
        error_code: status,
        error_message: 'Realtime subscription failed',
        phase: 'subscribe_callback',
      })
    }
  })

  return channel
}

export function cleanup_chat_room_realtime(input: {
  supabase: SupabaseClient
  channel: RealtimeChannel
  room_uuid: string
  active_room_uuid?: string | null
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: string | null
  cleanup_reason: string
}) {
  const channel_name = chat_room_realtime_channel_name(input.room_uuid)

  send_chat_realtime_debug({
    event: 'chat_realtime_cleanup_started',
    room_uuid: input.room_uuid,
    active_room_uuid: input.active_room_uuid ?? input.room_uuid,
    participant_uuid: input.participant_uuid,
    user_uuid: input.user_uuid,
    role: input.role,
    tier: input.tier,
    source_channel: input.source_channel ?? 'web',
    channel_name,
    cleanup_reason: input.cleanup_reason,
    phase: 'cleanup_chat_room_realtime',
  })

  console_chat_realtime('cleanup_started', {
    channel_name,
    room_uuid: input.room_uuid,
    cleanup_reason: input.cleanup_reason,
  })

  void input.supabase.removeChannel(input.channel).then((status) => {
    send_chat_realtime_debug({
      event: 'chat_realtime_cleanup_completed',
      room_uuid: input.room_uuid,
      active_room_uuid: input.active_room_uuid ?? input.room_uuid,
      participant_uuid: input.participant_uuid,
      user_uuid: input.user_uuid,
      role: input.role,
      tier: input.tier,
      source_channel: input.source_channel ?? 'web',
      subscribe_status: status,
      channel_name,
      cleanup_reason: input.cleanup_reason,
      phase: 'cleanup_chat_room_realtime',
    })

    console_chat_realtime('cleanup_completed', {
      channel_name,
      room_uuid: input.room_uuid,
      cleanup_reason: input.cleanup_reason,
      status,
    })
  })
}

export function publish_chat_typing(input: {
  channel: RealtimeChannel
  room_uuid: string
  active_room_uuid?: string | null
  participant_uuid: string
  user_uuid?: string | null
  role: chat_realtime_role
  display_name?: string | null
  is_typing: boolean
  source_channel?: string | null
  tier?: string | null
}) {
  const source = input.source_channel ?? 'web'
  const channel_name = chat_room_realtime_channel_name(input.room_uuid)
  const body: chat_typing_payload = {
    room_uuid: input.room_uuid,
    participant_uuid: input.participant_uuid,
    user_uuid: input.user_uuid ?? null,
    role: input.role,
    display_name: input.display_name ?? null,
    is_typing: input.is_typing,
    sent_at: new Date().toISOString(),
  }

  console_chat_realtime('typing_publish_requested', {
    room_uuid: input.room_uuid,
    participant_uuid: input.participant_uuid,
    role: input.role,
  })

  void (async () => {
    const meta = chat_room_realtime_channel_meta.get(input.channel)
    const cid =
      chat_room_channel_client_ids.get(input.channel) ?? 'unknown_channel_client'

    if (!meta?.typing_listener_bound) {
      send_chat_realtime_debug({
        event: 'chat_typing_listener_not_registered',
        room_uuid: input.room_uuid,
        active_room_uuid: input.active_room_uuid ?? input.room_uuid,
        participant_uuid: input.participant_uuid,
        user_uuid: input.user_uuid ?? null,
        role: input.role,
        tier: input.tier ?? null,
        source_channel: source,
        channel_name,
        channel_topic: channel_name,
        subscribe_status:
          meta?.subscribe_callback_status ??
          read_realtime_channel_state(input.channel) ??
          'no_meta',
        listener_registered: false,
        client_instance_id: cid,
        sender_user_uuid: input.user_uuid ?? null,
        active_user_uuid: input.user_uuid ?? null,
        sender_participant_uuid: input.participant_uuid,
        active_participant_uuid: input.participant_uuid,
        sender_role: input.role,
        active_role: input.role,
        phase: 'typing_publish_guard',
      })
    }

    let last_result: string | null = null

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (
        attempt === 0 &&
        meta?.subscribe_callback_status !== 'SUBSCRIBED'
      ) {
        send_chat_realtime_debug({
          event: 'chat_typing_send_before_subscribed',
          room_uuid: input.room_uuid,
          active_room_uuid: input.active_room_uuid ?? input.room_uuid,
          participant_uuid: input.participant_uuid,
          user_uuid: input.user_uuid ?? null,
          role: input.role,
          tier: input.tier ?? null,
          source_channel: source,
          channel_name,
          channel_topic: channel_name,
          subscribe_status:
            meta?.subscribe_callback_status ??
            read_realtime_channel_state(input.channel) ??
            'unknown',
          listener_registered: meta?.typing_listener_bound ?? false,
          client_instance_id: cid,
          sender_user_uuid: input.user_uuid ?? null,
          active_user_uuid: input.user_uuid ?? null,
          sender_participant_uuid: input.participant_uuid,
          active_participant_uuid: input.participant_uuid,
          sender_role: input.role,
          active_role: input.role,
          phase: 'typing_publish_before_subscribed',
        })
      }

      const result = await input.channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: body,
      })

      last_result = result

      if (result === 'ok') {
        send_chat_realtime_debug({
          event: 'chat_typing_broadcast_send_succeeded',
          room_uuid: input.room_uuid,
          active_room_uuid: input.active_room_uuid ?? input.room_uuid,
          participant_uuid: input.participant_uuid,
          user_uuid: input.user_uuid,
          role: input.role,
          tier: input.tier,
          source_channel: source,
          subscribe_status: 'broadcast_ok',
          channel_name,
          channel_topic: channel_name,
          client_instance_id: cid,
          event_name: 'typing',
          payload_room_uuid: input.room_uuid,
          sender_user_uuid: input.user_uuid ?? null,
          sender_participant_uuid: input.participant_uuid,
          active_participant_uuid: input.participant_uuid,
          sender_role: input.role,
          display_name: input.display_name ?? null,
          is_typing: input.is_typing,
          listener_registered: meta?.typing_listener_bound ?? false,
          phase: 'typing_broadcast_send',
        })

        console_chat_realtime('typing_publish_ok', {
          attempt,
          participant_uuid: input.participant_uuid,
        })

        return
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 100)
      })
    }

    send_chat_realtime_debug({
      event: 'chat_typing_broadcast_failed',
      room_uuid: input.room_uuid,
      active_room_uuid: input.active_room_uuid ?? input.room_uuid,
      participant_uuid: input.participant_uuid,
      user_uuid: input.user_uuid,
      role: input.role,
      tier: input.tier,
      source_channel: source,
      channel_name,
      event_name: 'typing',
      payload_room_uuid: input.room_uuid,
      sender_user_uuid: input.user_uuid ?? null,
      sender_participant_uuid: input.participant_uuid,
      active_participant_uuid: input.participant_uuid,
      sender_role: input.role,
      display_name: input.display_name ?? null,
      is_typing: input.is_typing,
      ignored_reason: 'typing_broadcast_send_exhausted_retries',
      error_code: last_result,
      error_message: 'Typing broadcast did not reach ok before retries exhausted',
      phase: 'typing_broadcast_send',
    })

    console_chat_realtime('typing_publish_failed_retries', {
      last_result,
      participant_uuid: input.participant_uuid,
    })
  })().catch((error: unknown) => {
    send_chat_realtime_debug({
      event: 'chat_typing_broadcast_failed',
      room_uuid: input.room_uuid,
      active_room_uuid: input.active_room_uuid ?? input.room_uuid,
      participant_uuid: input.participant_uuid,
      user_uuid: input.user_uuid,
      role: input.role,
      tier: input.tier,
      source_channel: source,
      channel_name,
      event_name: 'typing',
      payload_room_uuid: input.room_uuid,
      sender_user_uuid: input.user_uuid ?? null,
      sender_participant_uuid: input.participant_uuid,
      active_participant_uuid: input.participant_uuid,
      sender_role: input.role,
      display_name: input.display_name ?? null,
      is_typing: input.is_typing,
      ignored_reason: 'typing_broadcast_send_exception',
      error_message: error instanceof Error ? error.message : String(error),
      phase: 'typing_broadcast_send',
    })

    console_chat_realtime('typing_publish_exception', {
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

export function sync_chat_typing_presence(input: {
  room_uuid: string
  participant_uuid: string
  is_typing: boolean
  source_channel?: string | null
  typing_phase?: 'start' | 'heartbeat'
}) {
  void fetch('/api/chat/presence', {
    method: 'POST',
    credentials: 'include',
    keepalive: !input.is_typing,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      room_uuid: input.room_uuid,
      participant_uuid: input.participant_uuid,
      action: input.is_typing ? 'typing_start' : 'typing_stop',
      last_channel: input.source_channel ?? undefined,
      ...(input.is_typing && input.typing_phase
        ? { typing_phase: input.typing_phase }
        : {}),
    }),
  }).catch(() => {})
}
