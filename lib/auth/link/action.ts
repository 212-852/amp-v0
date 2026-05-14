import 'server-only'

import { randomBytes } from 'crypto'

import { build_line_auth_url } from '@/lib/auth/line/oauth'
import { line_login_channel_id } from '@/lib/config/line/env'
import { debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import {
  normalize_link_status,
  validate_link_start_context,
  type auth_link_status,
} from './rules'
import { build_start_link_context, type start_link_context } from './context'

type link_session_row = {
  link_session_uuid: string
  visitor_uuid: string | null
  user_uuid: string | null
  source_channel: string
  provider: string
  status: string
  state: string
  return_path: string | null
  completed_user_uuid: string | null
  completed_at: string | null
  expires_at: string
}

function random_state() {
  return randomBytes(32).toString('base64url')
}

function expires_at() {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString()
}

function payload_from_row(row: link_session_row, status?: auth_link_status) {
  return {
    link_session_uuid: row.link_session_uuid,
    state_exists: Boolean(row.state),
    visitor_uuid: row.visitor_uuid,
    user_uuid: row.user_uuid,
    completed_user_uuid: row.completed_user_uuid,
    source_channel: row.source_channel,
    provider: row.provider,
    status: status ?? normalize_link_status(row.status, row.expires_at),
    return_path: row.return_path,
  }
}

function link_start_base_payload(context: start_link_context) {
  return {
    visitor_uuid: context.visitor_uuid,
    user_uuid: context.user_uuid,
    source_channel: context.source_channel,
    provider: context.provider,
    return_path: context.return_path,
    is_standalone: context.is_standalone,
  }
}

function serialize_unknown_error(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack ?? null,
    }
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const record = error as Record<string, unknown>

    return {
      error_message: record.message,
      error_code: record.code ?? null,
      error_details: record.details ?? null,
      error_hint: record.hint ?? null,
    }
  }

  return { error_message: String(error) }
}

async function resolve_visitor_user_uuid_for_link_start(
  visitor_uuid: string | null,
): Promise<string | null> {
  const trimmed = clean_uuid(visitor_uuid)

  if (!trimmed) {
    return null
  }

  const result = await supabase
    .from('visitors')
    .select('user_uuid')
    .eq('visitor_uuid', trimmed)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return clean_uuid(result.data?.user_uuid as string | undefined)
}

export type auth_link_start_success = {
  ok: true
  auth_url: string
  link_session_uuid: string
  status: auth_link_status
  visitor_uuid: string | null
  user_uuid: string | null
  source_channel: string
}

export type auth_link_start_failure = {
  ok: false
  http_status: number
  error_code: string
  error_message: string
  cause: Record<string, unknown> | null
  visitor_uuid?: string | null
  user_uuid?: string | null
  source_channel?: string | null
}

/**
 * Single entry for POST /api/auth/link/start (guest and PWA allowed; user_uuid optional).
 */
export async function run_auth_link_start(input: {
  body: Record<string, unknown> | null
  visitor_uuid: string | null
}): Promise<auth_link_start_success | auth_link_start_failure> {
  let context: start_link_context

  try {
    const user_uuid = await resolve_visitor_user_uuid_for_link_start(
      input.visitor_uuid,
    )

    context = build_start_link_context({
      body: input.body,
      visitor_uuid: input.visitor_uuid,
      user_uuid,
    })
  } catch (error) {
    const cause = serialize_unknown_error(error)

    return {
      ok: false,
      http_status: 500,
      error_code: 'visitor_lookup_failed',
      error_message:
        error instanceof Error
          ? error.message
          : typeof error === 'object' &&
              error &&
              'message' in error &&
              typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message: string }).message
            : 'visitor_lookup_failed',
      cause,
    }
  }

  await debug_event({
    category: 'pwa',
    event: 'auth_link_start_context_resolved',
    payload: {
      ...link_start_base_payload(context),
      phase: 'link_start',
      state_exists: null,
      auth_url_exists: null,
      insert_success: null,
      redirect_url: null,
    },
  })

  const validation = validate_link_start_context({
    visitor_uuid: context.visitor_uuid,
    user_uuid: context.user_uuid,
    provider: context.provider,
  })

  if (!validation.ok) {
    return {
      ok: false,
      http_status: 400,
      error_code: validation.error_code,
      error_message: validation.error_message,
      cause: null,
      visitor_uuid: context.visitor_uuid,
      user_uuid: context.user_uuid,
      source_channel: context.source_channel,
    }
  }

  await debug_event({
    category: 'pwa',
    event: 'auth_link_start_rules_passed',
    payload: {
      ...link_start_base_payload(context),
      phase: 'link_start',
      state_exists: null,
      auth_url_exists: null,
      insert_success: null,
      redirect_url: null,
    },
  })

  await debug_event({
    category: 'pwa',
    event: 'pwa_line_link_started',
    payload: {
      ...link_start_base_payload(context),
      phase: 'link_start_requested',
    },
  })

  try {
    const output = await create_auth_link_session(context)

    return {
      ok: true,
      ...output,
      visitor_uuid: context.visitor_uuid,
      user_uuid: context.user_uuid,
      source_channel: context.source_channel,
    }
  } catch (error) {
    const cause = serialize_unknown_error(error)

    return {
      ok: false,
      http_status: 500,
      error_code: 'link_start_failed',
      error_message:
        error instanceof Error
          ? error.message
          : typeof error === 'object' &&
              error &&
              'message' in error &&
              typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message: string }).message
            : 'link_start_failed',
      cause,
      visitor_uuid: context.visitor_uuid,
      user_uuid: context.user_uuid,
      source_channel: context.source_channel,
    }
  }
}

export async function create_auth_link_session(context: start_link_context) {
  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_insert_started',
    payload: {
      ...link_start_base_payload(context),
      phase: 'link_session_insert',
      state_exists: false,
      auth_url_exists: false,
      insert_success: null,
      redirect_url: null,
    },
  })

  const created = await supabase
    .from('auth_link_sessions')
    .insert({
      visitor_uuid: context.visitor_uuid,
      user_uuid: context.user_uuid,
      source_channel: context.source_channel,
      provider: context.provider,
      state: random_state(),
      return_path: context.return_path,
      expires_at: expires_at(),
    })
    .select(
      'link_session_uuid, visitor_uuid, user_uuid, source_channel, provider, status, state, return_path, completed_user_uuid, completed_at, expires_at',
    )
    .single()

  if (created.error) {
    await debug_event({
      category: 'pwa',
      event: 'auth_link_session_insert_failed',
      payload: {
        ...link_start_base_payload(context),
        phase: 'link_session_insert',
        state_exists: false,
        auth_url_exists: false,
        insert_success: false,
        redirect_url: null,
        error_code: created.error.code ?? 'auth_link_insert_failed',
        error_message: created.error.message,
      },
    })

    throw created.error
  }

  const row = created.data as link_session_row

  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_insert_succeeded',
    payload: {
      ...link_start_base_payload(context),
      link_session_uuid: row.link_session_uuid,
      phase: 'link_session_insert',
      state_exists: Boolean(row.state),
      auth_url_exists: false,
      insert_success: true,
      redirect_url: null,
    },
  })

  const client_id = line_login_channel_id()
  const callback_url = process.env.LINE_LOGIN_CALLBACK_URL?.trim()

  await debug_event({
    category: 'pwa',
    event: 'line_auth_url_build_started',
    payload: {
      ...link_start_base_payload(context),
      link_session_uuid: row.link_session_uuid,
      phase: 'line_oauth_url',
      state_exists: Boolean(row.state),
      auth_url_exists: false,
      insert_success: true,
      redirect_url: null,
      line_client_id_configured: Boolean(client_id),
      line_callback_url_configured: Boolean(callback_url),
    },
  })

  if (!client_id || !callback_url) {
    await debug_event({
      category: 'pwa',
      event: 'line_auth_url_build_failed',
      payload: {
        ...link_start_base_payload(context),
        link_session_uuid: row.link_session_uuid,
        phase: 'line_oauth_url',
        state_exists: Boolean(row.state),
        auth_url_exists: false,
        insert_success: true,
        redirect_url: null,
        error_code: 'line_login_not_configured',
        error_message:
          'LINE_LOGIN_CHANNEL_ID or LINE_LOGIN_CALLBACK_URL is missing',
      },
    })

    throw new Error('LINE Login is not configured')
  }

  let auth_url: string

  try {
    auth_url = build_line_auth_url({
      client_id,
      redirect_uri: callback_url,
      state: row.state,
    }).toString()
  } catch (url_error) {
    await debug_event({
      category: 'pwa',
      event: 'line_auth_url_build_failed',
      payload: {
        ...link_start_base_payload(context),
        link_session_uuid: row.link_session_uuid,
        phase: 'line_oauth_url',
        state_exists: Boolean(row.state),
        auth_url_exists: false,
        insert_success: true,
        redirect_url: null,
        error_code: 'line_auth_url_build_threw',
        error_message:
          url_error instanceof Error ? url_error.message : String(url_error),
      },
    })

    throw url_error
  }

  await debug_event({
    category: 'pwa',
    event: 'line_auth_url_build_succeeded',
    payload: {
      ...link_start_base_payload(context),
      link_session_uuid: row.link_session_uuid,
      phase: 'line_oauth_url',
      state_exists: Boolean(row.state),
      auth_url_exists: true,
      insert_success: true,
      redirect_url: auth_url,
    },
  })

  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_created',
    payload: {
      ...payload_from_row(row),
      is_standalone: context.is_standalone,
      phase: 'link_session_created',
      auth_url_exists: true,
      insert_success: true,
      redirect_url: auth_url,
    },
  })

  return {
    auth_url,
    link_session_uuid: row.link_session_uuid,
    status: normalize_link_status(row.status, row.expires_at),
  }
}

export async function find_pending_auth_link_session_by_state(state: string) {
  const result = await supabase
    .from('auth_link_sessions')
    .select(
      'link_session_uuid, visitor_uuid, user_uuid, source_channel, provider, status, state, return_path, completed_user_uuid, completed_at, expires_at',
    )
    .eq('state', state)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const row = result.data as link_session_row | null

  if (!row) {
    return null
  }

  const status = normalize_link_status(row.status, row.expires_at)

  if (status === 'expired' && row.status === 'pending') {
    await supabase
      .from('auth_link_sessions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('link_session_uuid', row.link_session_uuid)
  }

  return { row, status }
}

export async function complete_auth_link_session(input: {
  link_session_uuid: string
  completed_user_uuid: string
}) {
  const updated = await supabase
    .from('auth_link_sessions')
    .update({
      status: 'completed',
      completed_user_uuid: input.completed_user_uuid,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('link_session_uuid', input.link_session_uuid)
    .eq('status', 'pending')
    .select(
      'link_session_uuid, visitor_uuid, user_uuid, source_channel, provider, status, state, return_path, completed_user_uuid, completed_at, expires_at',
    )
    .single()

  if (updated.error) {
    throw updated.error
  }

  const row = updated.data as link_session_row

  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_completed',
    payload: {
      ...payload_from_row(row, 'completed'),
      phase: 'link_session_completed',
    },
  })

  return row
}

export async function fail_auth_link_session(input: {
  link_session_uuid: string
  error_code: string
  error_message?: string | null
}) {
  const updated = await supabase
    .from('auth_link_sessions')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('link_session_uuid', input.link_session_uuid)
    .eq('status', 'pending')
    .select(
      'link_session_uuid, visitor_uuid, user_uuid, source_channel, provider, status, state, return_path, completed_user_uuid, completed_at, expires_at',
    )
    .maybeSingle()

  const row = updated.data as link_session_row | null

  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_failed',
    payload: {
      ...(row
        ? payload_from_row(row, 'failed')
        : { link_session_uuid: input.link_session_uuid }),
      error_code: input.error_code,
      error_message: input.error_message ?? null,
      phase: 'link_session_failed',
    },
  })
}

export async function get_auth_link_session_status(
  link_session_uuid: string,
) {
  const result = await supabase
    .from('auth_link_sessions')
    .select(
      'link_session_uuid, visitor_uuid, user_uuid, source_channel, provider, status, state, return_path, completed_user_uuid, completed_at, expires_at',
    )
    .eq('link_session_uuid', link_session_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const row = result.data as link_session_row | null

  if (!row) {
    return {
      status: 'failed' as auth_link_status,
      completed_user_uuid: null,
      return_path: null,
    }
  }

  const status = normalize_link_status(row.status, row.expires_at)

  if (status === 'expired' && row.status === 'pending') {
    await supabase
      .from('auth_link_sessions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('link_session_uuid', row.link_session_uuid)
  }

  return {
    status,
    completed_user_uuid: row.completed_user_uuid,
    return_path: row.return_path,
  }
}

