import 'server-only'

import { randomBytes } from 'crypto'

import { build_line_auth_url } from '@/lib/auth/line/oauth'
import { line_login_channel_id } from '@/lib/config/line/env'
import { debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'
import {
  normalize_link_status,
  type auth_link_status,
} from './rules'
import type { start_link_context } from './context'

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

export async function create_auth_link_session(context: start_link_context) {
  const client_id = line_login_channel_id()
  const callback_url = process.env.LINE_LOGIN_CALLBACK_URL?.trim()

  if (!client_id || !callback_url) {
    throw new Error('LINE Login is not configured')
  }

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
    throw created.error
  }

  const row = created.data as link_session_row
  const auth_url = build_line_auth_url({
    client_id,
    redirect_uri: callback_url,
    state: row.state,
  }).toString()

  await debug_event({
    category: 'pwa',
    event: 'auth_link_session_created',
    payload: {
      ...payload_from_row(row),
      is_standalone: context.is_standalone,
      phase: 'link_session_created',
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

