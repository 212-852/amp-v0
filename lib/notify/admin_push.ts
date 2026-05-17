import 'server-only'

import { is_reception_state } from '@/lib/admin/reception/rules'
import { env } from '@/lib/config/env'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { supabase } from '@/lib/db/supabase'
import { debug_event } from '@/lib/debug'
import {
  normalize_notification_preferences,
  type notification_preferences,
} from '@/lib/notification/rules'
import { normalize_locale, type locale_key } from '@/lib/locale/action'
import {
  resolve_admin_line_notification_copy,
} from '@/lib/notify/admin_line_card'
import { load_presence_by_user_uuids } from '@/lib/presence/action'
import {
  decide_external_notification_skip,
  resolve_external_notification_allow_reason,
  type external_notification_presence_decision,
} from '@/lib/presence/rules'
import { read_requester_display_name } from '@/lib/notify/recipients'
import { resolve_push_subscription_enabled_for_notify } from '@/lib/notify/push_gate'

import { send_push_notify } from './push'
import { send_line_push_notify } from './line'
import {
  discord_action_webhook_configured,
  post_discord_action_webhook_message,
} from './discord'

const admin_notification_phase = 'lib/notify/admin_push.ts'

type receiver_presence_state = external_notification_presence_decision

type admin_notification_candidate = {
  user_uuid: string
  role: string | null
  header_status: 'on' | 'off'
  chat_reception_enabled: boolean
  preferences: notification_preferences
  has_push_subscription: boolean
  has_line_identity: boolean
  line_user_id: string | null
  presence_state: receiver_presence_state
}

type admin_push_route_input = {
  room_uuid: string | null
  message_uuid: string | null
  title: string
  message: string
  actor_user_uuid: string | null
  source_channel: string
  admin_event: string
  support_mode?: string | null
  should_auto_reply?: boolean | null
  auto_reply_skipped_reason?: string | null
}

type admin_push_route_result = {
  outcome: 'delivered' | 'skipped' | 'failed'
  transport: 'push' | 'line' | 'discord_action_webhook' | 'none'
  deliveries: Array<{ channel: 'push' | 'line' | 'discord' }>
  http_status?: number | null
  error_code?: string | null
  error_message?: string | null
}

type admin_debug_payload = {
  admin_user_uuid?: string | null
  room_uuid?: string | null
  message_uuid?: string | null
  header_status?: string | null
  chat_reception_enabled?: boolean | null
  pwa_enabled?: boolean | null
  line_enabled?: boolean | null
  has_push_subscription?: boolean | null
  has_line_identity?: boolean | null
  selected_method?: string | null
  skipped_reason?: string | null
  notification_skipped_reason?: string | null
  role?: string | null
  admin_event?: string | null
  support_mode?: string | null
  should_auto_reply?: boolean | null
  auto_reply_skipped_reason?: string | null
  external_notification_skipped_reason?: string | null
  presence_found?: boolean | null
  presence_visible?: boolean | null
  presence_seen_at?: string | null
  presence_age_seconds?: number | null
  presence_area?: string | null
  display_name?: string | null
  latest_message_preview?: string | null
  error_code?: string | null
  error_message?: string | null
}

type admin_notification_debug_event =
  | 'admin_notification_rule_checked'
  | 'admin_line_notification_rule_checked'
  | 'admin_notification_candidate_checked'
  | 'admin_notification_active_state_checked'
  | 'admin_notification_skipped_receiver_active_in_app'
  | 'admin_line_notification_skipped_receiver_active_in_app'
  | 'admin_notification_skipped_offline'
  | 'admin_notification_skipped_header_off'
  | 'admin_line_notification_skipped_header_off'
  | 'admin_line_notification_skipped_chat_off'
  | 'admin_line_notification_skipped_line_off'
  | 'admin_notification_method_resolved'
  | 'admin_push_send_started'
  | 'admin_push_send_succeeded'
  | 'admin_push_send_failed'
  | 'admin_line_notification_send_started'
  | 'admin_line_notification_send_succeeded'
  | 'admin_line_notification_send_failed'
  | 'admin_line_send_started'
  | 'admin_line_send_succeeded'
  | 'admin_line_send_failed'
  | 'admin_discord_fallback_started'

async function emit_admin_notification_debug(
  event: admin_notification_debug_event,
  payload: admin_debug_payload,
) {
  await debug_event({
    category: 'chat_realtime',
    event,
    payload: {
      phase: admin_notification_phase,
      ...payload,
    },
  })
}

function resolve_admin_notification_open_url(room_uuid: string | null): string {
  const base = env.app_url.trim().replace(/\/+$/, '') || 'https://app.da-nya.com'
  const path = room_uuid
    ? `/admin/reception/${encodeURIComponent(room_uuid)}`
    : '/admin/reception'

  return `${base}${path}`
}

function format_selected_method(methods: Array<'push' | 'line'>): string {
  if (methods.length === 2 && methods[0] === 'push' && methods[1] === 'line') {
    return 'push_then_line'
  }

  return methods.join('->') || 'none'
}

function empty_receiver_presence_state(): receiver_presence_state {
  return decide_external_notification_skip({ presence: null })
}

async function load_admin_locale_by_user_uuid(
  user_uuids: string[],
): Promise<Map<string, locale_key>> {
  if (user_uuids.length === 0) {
    return new Map()
  }

  const result = await supabase
    .from('users')
    .select('user_uuid, locale')
    .in('user_uuid', user_uuids)

  if (result.error) {
    return new Map()
  }

  const locale_by_user_uuid = new Map<string, locale_key>()

  for (const row of result.data ?? []) {
    if (typeof row.user_uuid !== 'string' || row.user_uuid.length === 0) {
      continue
    }

    locale_by_user_uuid.set(
      row.user_uuid,
      normalize_locale(typeof row.locale === 'string' ? row.locale : null),
    )
  }

  return locale_by_user_uuid
}

async function load_receiver_presence_state_by_user_uuid(
  user_uuids: string[],
): Promise<Map<string, receiver_presence_state>> {
  const presence_by_user_uuid = await load_presence_by_user_uuids(user_uuids)
  const state_by_user_uuid = new Map<string, receiver_presence_state>()

  for (const user_uuid of user_uuids) {
    state_by_user_uuid.set(
      user_uuid,
      decide_external_notification_skip({
        presence: presence_by_user_uuid.get(user_uuid) ?? null,
      }),
    )
  }

  return state_by_user_uuid
}

function admin_notification_discord_content(input: admin_push_route_input) {
  return [
    `[${input.title.toUpperCase()}]`,
    '',
    input.message,
    '',
    `admin_event: ${input.admin_event}`,
    `room_uuid: ${input.room_uuid ?? 'none'}`,
    `message_uuid: ${input.message_uuid ?? 'none'}`,
  ].join('\n')
}

function resolve_header_status(input: {
  role: string | null
  reception_state: string | null
}): 'on' | 'off' {
  if (input.role !== 'admin') {
    return 'on'
  }

  const state = is_reception_state(input.reception_state)
    ? input.reception_state
    : 'open'

  return state === 'open' ? 'on' : 'off'
}

function resolve_delivery_methods(input: {
  pwa_enabled: boolean
  line_enabled: boolean
  has_push_subscription: boolean
  has_line_identity: boolean
  both_methods_enabled: boolean
}): Array<'push' | 'line'> {
  if (!input.pwa_enabled && !input.line_enabled) {
    return []
  }

  if (input.pwa_enabled && !input.line_enabled) {
    return input.has_push_subscription ? ['push'] : []
  }

  if (!input.pwa_enabled && input.line_enabled) {
    return input.has_line_identity ? ['line'] : []
  }

  const methods: Array<'push' | 'line'> = []

  if (input.has_push_subscription) {
    methods.push('push')
  }

  if (input.both_methods_enabled && input.has_line_identity) {
    methods.push('line')
  }

  return methods
}

async function load_admin_notification_candidates(input: {
  room_uuid: string | null
  exclude_user_uuid?: string | null
}): Promise<admin_notification_candidate[]> {
  const exclude_user_uuid = clean_uuid(input.exclude_user_uuid ?? null)
  const room_uuid = clean_uuid(input.room_uuid)

  const users_result = await supabase
    .from('users')
    .select('user_uuid, role')
    .in('role', ['admin', 'owner', 'core'])

  if (users_result.error) {
    throw users_result.error
  }

  const user_rows = ((users_result.data ?? []) as Array<{
    user_uuid: string | null
    role: string | null
  }>).filter(
    (row): row is { user_uuid: string; role: string | null } =>
      typeof row.user_uuid === 'string' &&
      row.user_uuid.length > 0 &&
      row.user_uuid !== exclude_user_uuid,
  )

  if (user_rows.length === 0) {
    return []
  }

  const user_uuids = user_rows.map((row) => row.user_uuid)
  const admin_user_uuids = user_rows
    .filter((row) => row.role === 'admin')
    .map((row) => row.user_uuid)

  const [receptions_result, settings_result, identities_result, push_result] =
    await Promise.all([
      admin_user_uuids.length > 0
        ? supabase
            .from('receptions')
            .select('user_uuid, state')
            .in('user_uuid', admin_user_uuids)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('settings')
        .select('user_uuid, notification_preferences')
        .in('user_uuid', user_uuids),
      supabase
        .from('identities')
        .select('user_uuid, provider_id')
        .eq('provider', 'line')
        .in('user_uuid', user_uuids),
      supabase
        .from('push_subscriptions')
        .select('user_uuid, endpoint, enabled, updated_at')
        .in('user_uuid', user_uuids)
        .eq('enabled', true)
        .eq('is_pwa', true)
        .not('endpoint', 'is', null)
        .order('updated_at', { ascending: false }),
    ])

  if (receptions_result.error) {
    throw receptions_result.error
  }

  if (settings_result.error) {
    throw settings_result.error
  }

  if (identities_result.error) {
    throw identities_result.error
  }

  if (push_result.error) {
    throw push_result.error
  }

  const reception_state_by_uuid = new Map<string, string>()

  for (const row of receptions_result.data ?? []) {
    if (typeof row.user_uuid === 'string' && row.user_uuid.length > 0) {
      reception_state_by_uuid.set(row.user_uuid, row.state ?? '')
    }
  }

  const preferences_by_uuid = new Map<string, notification_preferences>()

  for (const row of settings_result.data ?? []) {
    if (typeof row.user_uuid !== 'string' || row.user_uuid.length === 0) {
      continue
    }

    preferences_by_uuid.set(
      row.user_uuid,
      normalize_notification_preferences(row.notification_preferences ?? null),
    )
  }

  const line_user_id_by_uuid = new Map<string, string>()

  for (const row of identities_result.data ?? []) {
    if (
      typeof row.user_uuid === 'string' &&
      row.user_uuid.length > 0 &&
      typeof row.provider_id === 'string' &&
      row.provider_id.length > 0 &&
      !line_user_id_by_uuid.has(row.user_uuid)
    ) {
      line_user_id_by_uuid.set(row.user_uuid, row.provider_id)
    }
  }

  const push_subscription_by_uuid = new Map<
    string,
    { endpoint?: string | null; enabled?: boolean | null }
  >()

  for (const row of push_result.data ?? []) {
    if (
      typeof row.user_uuid === 'string' &&
      row.user_uuid.length > 0 &&
      !push_subscription_by_uuid.has(row.user_uuid)
    ) {
      push_subscription_by_uuid.set(row.user_uuid, row)
    }
  }

  const presence_state_by_user_uuid =
    await load_receiver_presence_state_by_user_uuid(user_uuids)

  return user_rows.map((row) => {
    const line_user_id = line_user_id_by_uuid.get(row.user_uuid) ?? null
    const push_row = push_subscription_by_uuid.get(row.user_uuid) ?? null

    return {
      user_uuid: row.user_uuid,
      role: row.role,
      header_status: resolve_header_status({
        role: row.role,
        reception_state: reception_state_by_uuid.get(row.user_uuid) ?? null,
      }),
      chat_reception_enabled:
        resolve_header_status({
          role: row.role,
          reception_state: reception_state_by_uuid.get(row.user_uuid) ?? null,
        }) === 'on',
      preferences:
        preferences_by_uuid.get(row.user_uuid) ??
        normalize_notification_preferences(null),
      has_push_subscription: resolve_push_subscription_enabled_for_notify(
        push_row,
      ),
      has_line_identity: Boolean(line_user_id),
      line_user_id,
      presence_state:
        presence_state_by_user_uuid.get(row.user_uuid) ??
        empty_receiver_presence_state(),
    }
  })
}

export async function route_admin_push_notification(
  input: admin_push_route_input,
): Promise<admin_push_route_result> {
  const push_url = resolve_admin_notification_open_url(input.room_uuid)
  const raw_sender_display_name = await read_requester_display_name(
    input.actor_user_uuid,
  )
  const sender_display_name =
    raw_sender_display_name.trim() &&
    raw_sender_display_name !== '\u30e6\u30fc\u30b6\u30fc'
      ? raw_sender_display_name
      : null

  await emit_admin_notification_debug('admin_notification_rule_checked', {
    room_uuid: input.room_uuid,
    message_uuid: input.message_uuid,
    support_mode: input.support_mode ?? null,
    should_auto_reply: input.should_auto_reply ?? null,
    auto_reply_skipped_reason: input.auto_reply_skipped_reason ?? null,
    admin_event: input.admin_event,
    selected_method: null,
    notification_skipped_reason: null,
  })

  let candidates: admin_notification_candidate[] = []
  let admin_locale_by_user_uuid = new Map<string, locale_key>()

  try {
    candidates = await load_admin_notification_candidates({
      room_uuid: input.room_uuid,
      exclude_user_uuid: input.actor_user_uuid,
    })
    admin_locale_by_user_uuid = await load_admin_locale_by_user_uuid(
      candidates.map((candidate) => candidate.user_uuid),
    )
  } catch (error) {
    return {
      outcome: 'failed',
      transport: 'none',
      deliveries: [],
      error_code: 'admin_targets_load_failed',
      error_message: error instanceof Error ? error.message : String(error),
    }
  }

  let any_delivered = false
  let last_transport: 'push' | 'line' | null = null
  let discord_fallback_eligible = false

  for (const candidate of candidates) {
    const pwa_enabled = candidate.preferences.pwa_push_enabled === true
    const line_enabled = candidate.preferences.line_enabled === true
    const both_methods_enabled = pwa_enabled && line_enabled
    const presence_state = candidate.presence_state
    const presence_allow_reason =
      resolve_external_notification_allow_reason(presence_state)
    const admin_locale = admin_locale_by_user_uuid.get(candidate.user_uuid) ?? 'ja'
    const line_copy = resolve_admin_line_notification_copy({
      locale: admin_locale,
      sender_display_name,
      message_text: input.message,
    })

    const base_debug: admin_debug_payload = {
      admin_user_uuid: candidate.user_uuid,
      room_uuid: input.room_uuid,
      message_uuid: input.message_uuid,
      support_mode: input.support_mode ?? null,
      should_auto_reply: input.should_auto_reply ?? null,
      auto_reply_skipped_reason: input.auto_reply_skipped_reason ?? null,
      external_notification_skipped_reason:
        presence_state.external_notification_skipped_reason,
      presence_found: presence_state.presence_found,
      presence_visible: presence_state.presence_visible,
      presence_seen_at: presence_state.presence_seen_at,
      presence_age_seconds: presence_state.presence_age_seconds,
      presence_area: presence_state.presence_area,
      display_name: line_copy.display_name,
      latest_message_preview: line_copy.latest_message_preview,
      header_status: candidate.header_status,
      chat_reception_enabled: candidate.chat_reception_enabled,
      pwa_enabled,
      line_enabled,
      has_push_subscription: candidate.has_push_subscription,
      has_line_identity: candidate.has_line_identity,
      role: candidate.role,
      admin_event: input.admin_event,
    }

    await emit_admin_notification_debug(
      'admin_notification_rule_checked',
      base_debug,
    )
    await emit_admin_notification_debug(
      'admin_notification_candidate_checked',
      base_debug,
    )
    await emit_admin_notification_debug(
      'admin_line_notification_rule_checked',
      base_debug,
    )

    await emit_admin_notification_debug(
      'admin_notification_active_state_checked',
      {
        ...base_debug,
        skipped_reason: presence_allow_reason,
      },
    )

    if (candidate.header_status === 'off') {
      await emit_admin_notification_debug(
        'admin_notification_skipped_header_off',
        {
          ...base_debug,
          skipped_reason: 'notification_settings_off',
          notification_skipped_reason: 'notification_settings_off',
        },
      )
      await emit_admin_notification_debug(
        'admin_line_notification_skipped_header_off',
        {
          ...base_debug,
          skipped_reason: 'notification_settings_off',
          notification_skipped_reason: 'notification_settings_off',
        },
      )
      await emit_admin_notification_debug(
        'admin_line_notification_skipped_chat_off',
        {
          ...base_debug,
          skipped_reason: 'chat_reception_off',
          notification_skipped_reason: 'chat_reception_off',
        },
      )

      continue
    }

    if (!candidate.chat_reception_enabled) {
      await emit_admin_notification_debug(
        'admin_line_notification_skipped_chat_off',
        {
          ...base_debug,
          skipped_reason: 'chat_reception_off',
          notification_skipped_reason: 'chat_reception_off',
        },
      )

      continue
    }

    if (presence_state.skip_external) {
      await emit_admin_notification_debug(
        'admin_notification_skipped_receiver_active_in_app',
        {
          ...base_debug,
          skipped_reason: 'receiver_active_in_app',
          notification_skipped_reason: 'receiver_active_in_app',
          selected_method: null,
        },
      )
      await emit_admin_notification_debug(
        'admin_line_notification_skipped_receiver_active_in_app',
        {
          ...base_debug,
          skipped_reason: 'receiver_active_in_app',
          notification_skipped_reason: 'receiver_active_in_app',
          selected_method: null,
        },
      )

      continue
    }

    if (!line_enabled) {
      await emit_admin_notification_debug(
        'admin_line_notification_skipped_line_off',
        {
          ...base_debug,
          skipped_reason: 'line_off',
          notification_skipped_reason: 'line_off',
        },
      )
    }

    if (!pwa_enabled && !line_enabled) {
      await emit_admin_notification_debug(
        'admin_notification_skipped_offline',
        {
          ...base_debug,
          skipped_reason: 'no_method_enabled',
          notification_skipped_reason: 'no_method_enabled',
        },
      )

      continue
    }

    const methods = resolve_delivery_methods({
      pwa_enabled,
      line_enabled,
      has_push_subscription: candidate.has_push_subscription,
      has_line_identity: candidate.has_line_identity,
      both_methods_enabled,
    })

    if (methods.length === 0) {
      await emit_admin_notification_debug(
        'admin_notification_skipped_offline',
        {
          ...base_debug,
          skipped_reason: pwa_enabled
            ? 'push_unavailable'
            : line_enabled
              ? 'line_unavailable'
              : 'method_unavailable',
          notification_skipped_reason: pwa_enabled
            ? 'push_unavailable'
            : line_enabled
              ? 'line_unavailable'
              : 'method_unavailable',
        },
      )

      if (both_methods_enabled) {
        discord_fallback_eligible = true
      }

      continue
    }

    const selected_method = format_selected_method(methods)

    await emit_admin_notification_debug('admin_notification_method_resolved', {
      ...base_debug,
      selected_method,
      skipped_reason: null,
      notification_skipped_reason: null,
    })

    let candidate_delivered = false

    for (const method of methods) {
      if (method === 'push') {
        await emit_admin_notification_debug('admin_push_send_started', {
          ...base_debug,
          selected_method: 'push',
          notification_skipped_reason: null,
        })

        const push = await send_push_notify({
          user_uuid: candidate.user_uuid,
          title: line_copy.title,
          message: line_copy.latest_message_preview,
          room_uuid: input.room_uuid,
          message_uuid: input.message_uuid,
          kind: 'chat',
          url: push_url,
        }).catch((error) => ({
          ok: false,
          available: false,
          reason: error instanceof Error ? error.message : 'push_threw',
        }))

        if (push.ok && push.available) {
          await emit_admin_notification_debug('admin_push_send_succeeded', {
            ...base_debug,
            selected_method: 'push',
            notification_skipped_reason: null,
          })

          candidate_delivered = true
          last_transport = 'push'
          break
        }

        await emit_admin_notification_debug('admin_push_send_failed', {
          ...base_debug,
          selected_method: 'push',
          skipped_reason: push.reason ?? 'push_unavailable',
          notification_skipped_reason: push.reason ?? 'push_unavailable',
          error_code: 'push_failed',
          error_message: push.reason ?? 'push_unavailable',
        })

        continue
      }

      if (method === 'line' && candidate.line_user_id) {
        await emit_admin_notification_debug('admin_line_send_started', {
          ...base_debug,
          selected_method: 'line',
          notification_skipped_reason: null,
        })
        await emit_admin_notification_debug(
          'admin_line_notification_send_started',
          {
            ...base_debug,
            selected_method: 'line',
            notification_skipped_reason: null,
          },
        )

        try {
          const line_result = await send_line_push_notify({
            line_user_id: candidate.line_user_id,
            message: line_copy.latest_message_preview,
            title: line_copy.title,
            body: line_copy.body,
            cta_label: line_copy.cta_label,
            open_url: push_url,
            user_uuid: candidate.user_uuid,
            room_uuid: input.room_uuid,
            message_uuid: input.message_uuid,
            selected_route: 'line',
          })

          if (!line_result.ok) {
            throw new Error(line_result.error_message ?? 'line_push_failed')
          }
        } catch (error) {
          await emit_admin_notification_debug('admin_line_send_failed', {
            ...base_debug,
            selected_method: 'line',
            skipped_reason: 'line_push_failed',
            notification_skipped_reason: 'line_push_failed',
            error_code: 'line_push_failed',
            error_message:
              error instanceof Error ? error.message : String(error),
          })
          await emit_admin_notification_debug(
            'admin_line_notification_send_failed',
            {
              ...base_debug,
              selected_method: 'line',
              skipped_reason: 'line_push_failed',
              notification_skipped_reason: 'line_push_failed',
              error_code: 'line_push_failed',
              error_message:
                error instanceof Error ? error.message : String(error),
            },
          )

          continue
        }

        await emit_admin_notification_debug('admin_line_send_succeeded', {
          ...base_debug,
          selected_method: 'line',
          notification_skipped_reason: null,
        })
        await emit_admin_notification_debug('admin_line_notification_send_succeeded', {
          ...base_debug,
          selected_method: 'line',
          notification_skipped_reason: null,
        })

        candidate_delivered = true
        last_transport = 'line'
        break
      }
    }

    if (candidate_delivered) {
      any_delivered = true
      continue
    }

    if (both_methods_enabled) {
      discord_fallback_eligible = true
    }
  }

  if (any_delivered) {
    const channel = last_transport ?? 'push'

    return {
      outcome: 'delivered',
      transport: channel,
      deliveries: [{ channel }],
    }
  }

  if (!discord_fallback_eligible || !discord_action_webhook_configured()) {
    return {
      outcome: 'skipped',
      transport: 'none',
      deliveries: [],
      error_code: 'no_delivery',
      error_message: 'no_delivery',
    }
  }

  await emit_admin_notification_debug('admin_discord_fallback_started', {
    room_uuid: input.room_uuid,
    message_uuid: input.message_uuid,
    admin_event: input.admin_event,
    selected_method: 'discord',
    skipped_reason: null,
  })

  const webhook_result = await post_discord_action_webhook_message({
    content: admin_notification_discord_content(input),
  })

  if (webhook_result.ok) {
    return {
      outcome: 'delivered',
      transport: 'discord_action_webhook',
      deliveries: [{ channel: 'discord' }],
    }
  }

  return {
    outcome: 'failed',
    transport: 'discord_action_webhook',
    deliveries: [],
    http_status: webhook_result.http_status ?? null,
    error_code: 'discord_action_webhook_non_ok',
    error_message: webhook_result.error_text ?? 'webhook_post_failed',
  }
}
