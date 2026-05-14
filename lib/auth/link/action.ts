import 'server-only'

import { randomBytes } from 'crypto'

import { build_line_auth_url } from '@/lib/auth/line/oauth'
import { line_login_channel_id } from '@/lib/config/line/env'
import { debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import {
  normalize_identity_link_status,
  validate_link_start_context,
  type auth_link_status,
} from './rules'
import { build_start_link_context, type start_link_context } from './context'

const line_oauth_pending_provider = 'line_oauth_pending'

type pending_line_oauth_identity_row = {
  link_state: string
  link_status: string
  link_expires_at: string
  link_return_path: string | null
  link_source_channel: string | null
  linked_visitor_uuid: string | null
  visitor_uuid: string | null
  user_uuid: string | null
  link_completed_user_uuid: string | null
}

function random_state() {
  return randomBytes(32).toString('base64url')
}

function link_expires_at_iso() {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString()
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

function debug_payload_from_identity_row(
  row: pending_line_oauth_identity_row,
  status: auth_link_status,
) {
  return {
    link_state: row.link_state,
    state_exists: Boolean(row.link_state),
    visitor_uuid: row.linked_visitor_uuid ?? row.visitor_uuid,
    user_uuid: row.user_uuid,
    completed_user_uuid: row.link_completed_user_uuid,
    source_channel: row.link_source_channel,
    provider: line_oauth_pending_provider,
    status,
    return_path: row.link_return_path,
  }
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

async function delete_stale_pending_line_oauth_identities(
  visitor_uuid: string | null,
) {
  const v = clean_uuid(visitor_uuid)

  if (!v) {
    return
  }

  await supabase
    .from('identities')
    .delete()
    .eq('provider', line_oauth_pending_provider)
    .eq('linked_visitor_uuid', v)
    .eq('link_status', 'pending')
}

export type auth_link_start_success = {
  ok: true
  auth_url: string
  link_state: string
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
    const output = await create_pending_line_oauth_identity(context)

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

export async function create_pending_line_oauth_identity(
  context: start_link_context,
): Promise<{ auth_url: string; link_state: string; status: auth_link_status }> {
  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_insert_started',
    payload: {
      ...link_start_base_payload(context),
      phase: 'identity_link_pending_insert',
      state_exists: false,
      auth_url_exists: false,
      insert_success: null,
      redirect_url: null,
    },
  })

  const state = random_state()
  const expires = link_expires_at_iso()
  const visitor = clean_uuid(context.visitor_uuid)
  const placeholder_provider_id = `pending_${randomBytes(16).toString('hex')}`

  await delete_stale_pending_line_oauth_identities(visitor)

  const created = await supabase
    .from('identities')
    .insert({
      user_uuid: null,
      provider: line_oauth_pending_provider,
      provider_id: placeholder_provider_id,
      visitor_uuid: visitor,
      linked_visitor_uuid: visitor,
      link_state: state,
      link_status: 'pending',
      link_source_channel: context.source_channel,
      link_return_path: context.return_path,
      link_expires_at: expires,
    })
    .select(
      'link_state, link_status, link_expires_at, link_return_path, link_source_channel, linked_visitor_uuid, visitor_uuid, user_uuid, link_completed_user_uuid',
    )
    .single()

  if (created.error) {
    await debug_event({
      category: 'pwa',
      event: 'auth_link_session_insert_failed',
      payload: {
        ...link_start_base_payload(context),
        phase: 'identity_link_pending_insert',
        state_exists: false,
        auth_url_exists: false,
        insert_success: false,
        redirect_url: null,
        error_code: created.error.code ?? 'identity_link_insert_failed',
        error_message: created.error.message,
      },
    })

    throw created.error
  }

  const row = created.data as unknown as pending_line_oauth_identity_row
  const status = normalize_identity_link_status(
    row.link_status,
    row.link_expires_at,
  )

  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_insert_succeeded',
    payload: {
      ...link_start_base_payload(context),
      link_state: row.link_state,
      phase: 'identity_link_pending_insert',
      state_exists: true,
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
      link_state: row.link_state,
      phase: 'line_oauth_url',
      state_exists: true,
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
        link_state: row.link_state,
        phase: 'line_oauth_url',
        state_exists: true,
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
      state: row.link_state,
    }).toString()
  } catch (url_error) {
    await debug_event({
      category: 'pwa',
      event: 'line_auth_url_build_failed',
      payload: {
        ...link_start_base_payload(context),
        link_state: row.link_state,
        phase: 'line_oauth_url',
        state_exists: true,
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
      link_state: row.link_state,
      phase: 'line_oauth_url',
      state_exists: true,
      auth_url_exists: true,
      insert_success: true,
      redirect_url: auth_url,
    },
  })

  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_created',
    payload: {
      ...debug_payload_from_identity_row(row, status),
      is_standalone: context.is_standalone,
      phase: 'identity_link_pending_created',
      auth_url_exists: true,
      insert_success: true,
      redirect_url: auth_url,
    },
  })

  return {
    auth_url,
    link_state: row.link_state,
    status,
  }
}

export async function find_pending_line_oauth_identity_by_state(
  state: string,
) {
  const trimmed = state?.trim()

  if (!trimmed) {
    return null
  }

  const result = await supabase
    .from('identities')
    .select(
      'link_state, link_status, link_expires_at, link_return_path, link_source_channel, linked_visitor_uuid, visitor_uuid, user_uuid, link_completed_user_uuid',
    )
    .eq('link_state', trimmed)
    .eq('provider', line_oauth_pending_provider)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const row = result.data as pending_line_oauth_identity_row | null

  if (!row) {
    return null
  }

  const status = normalize_identity_link_status(
    row.link_status,
    row.link_expires_at,
  )

  if (status === 'expired' && row.link_status === 'pending') {
    await supabase
      .from('identities')
      .update({ link_status: 'expired', updated_at: new Date().toISOString() })
      .eq('link_state', trimmed)
      .eq('provider', line_oauth_pending_provider)
  }

  return { row, status }
}

export async function complete_line_oauth_identity_link(input: {
  link_state: string
  completed_user_uuid: string
}) {
  const updated = await supabase
    .from('identities')
    .update({
      link_status: 'completed',
      link_completed_user_uuid: input.completed_user_uuid,
      updated_at: new Date().toISOString(),
    })
    .eq('link_state', input.link_state)
    .eq('provider', line_oauth_pending_provider)
    .eq('link_status', 'pending')
    .select(
      'link_state, link_status, link_expires_at, link_return_path, link_source_channel, linked_visitor_uuid, visitor_uuid, user_uuid, link_completed_user_uuid',
    )
    .single()

  if (updated.error) {
    throw updated.error
  }

  const row = updated.data as unknown as pending_line_oauth_identity_row

  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_completed',
    payload: {
      ...debug_payload_from_identity_row(
        row,
        normalize_identity_link_status(row.link_status, row.link_expires_at),
      ),
      phase: 'identity_link_completed',
    },
  })

  return row
}

export async function fail_line_oauth_identity_link(input: {
  link_state: string
  error_code: string
  error_message?: string | null
}) {
  const updated = await supabase
    .from('identities')
    .update({
      link_status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('link_state', input.link_state)
    .eq('provider', line_oauth_pending_provider)
    .eq('link_status', 'pending')
    .select(
      'link_state, link_status, link_expires_at, link_return_path, link_source_channel, linked_visitor_uuid, visitor_uuid, user_uuid, link_completed_user_uuid',
    )
    .maybeSingle()

  const row = updated.data as pending_line_oauth_identity_row | null

  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_failed',
    payload: {
      ...(row
        ? debug_payload_from_identity_row(
            row,
            normalize_identity_link_status(row.link_status, row.link_expires_at),
          )
        : { link_state: input.link_state }),
      error_code: input.error_code,
      error_message: input.error_message ?? null,
      phase: 'identity_link_failed',
    },
  })
}

export async function get_line_oauth_link_status(link_state: string) {
  const trimmed = link_state?.trim()

  if (!trimmed) {
    return {
      status: 'failed' as auth_link_status,
      completed_user_uuid: null,
      return_path: null,
    }
  }

  const result = await supabase
    .from('identities')
    .select(
      'link_state, link_status, link_expires_at, link_return_path, link_source_channel, linked_visitor_uuid, visitor_uuid, user_uuid, link_completed_user_uuid',
    )
    .eq('link_state', trimmed)
    .eq('provider', line_oauth_pending_provider)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const row = result.data as pending_line_oauth_identity_row | null

  if (!row) {
    return {
      status: 'failed' as auth_link_status,
      completed_user_uuid: null,
      return_path: null,
    }
  }

  const status = normalize_identity_link_status(
    row.link_status,
    row.link_expires_at,
  )

  if (status === 'expired' && row.link_status === 'pending') {
    await supabase
      .from('identities')
      .update({ link_status: 'expired', updated_at: new Date().toISOString() })
      .eq('link_state', trimmed)
      .eq('provider', line_oauth_pending_provider)
  }

  return {
    status: normalize_identity_link_status(
      row.link_status,
      row.link_expires_at,
    ),
    completed_user_uuid: row.link_completed_user_uuid,
    return_path: row.link_return_path,
  }
}

/** @deprecated use create_pending_line_oauth_identity */
export async function create_auth_link_session(context: start_link_context) {
  const out = await create_pending_line_oauth_identity(context)

  return {
    auth_url: out.auth_url,
    link_session_uuid: out.link_state,
    status: out.status,
  }
}

/** @deprecated */
export async function find_pending_auth_link_session_by_state(
  state: string,
) {
  const found = await find_pending_line_oauth_identity_by_state(state)

  if (!found) {
    return null
  }

  const { row, status } = found

  return {
    row: {
      link_session_uuid: row.link_state,
      visitor_uuid: row.linked_visitor_uuid ?? row.visitor_uuid,
      user_uuid: row.user_uuid,
      source_channel: row.link_source_channel ?? 'web',
      provider: 'line',
      status: row.link_status,
      state: row.link_state,
      return_path: row.link_return_path,
      completed_user_uuid: row.link_completed_user_uuid,
      completed_at: null,
      expires_at: row.link_expires_at,
    },
    status,
  }
}

/** @deprecated */
export async function complete_auth_link_session(input: {
  link_session_uuid: string
  completed_user_uuid: string
}) {
  return complete_line_oauth_identity_link({
    link_state: input.link_session_uuid,
    completed_user_uuid: input.completed_user_uuid,
  })
}

/** @deprecated */
export async function fail_auth_link_session(input: {
  link_session_uuid: string
  error_code: string
  error_message?: string | null
}) {
  return fail_line_oauth_identity_link({
    link_state: input.link_session_uuid,
    error_code: input.error_code,
    error_message: input.error_message,
  })
}

/** @deprecated */
export async function get_auth_link_session_status(
  link_session_uuid: string,
) {
  return get_line_oauth_link_status(link_session_uuid)
}
