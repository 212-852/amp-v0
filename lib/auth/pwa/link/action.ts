import 'server-only'

import { randomBytes } from 'crypto'

import type { access_result } from '@/lib/auth/access'
import { resolve_auth_access } from '@/lib/auth/access'
import { build_start_link_context, type start_link_context } from '@/lib/auth/link/context'
import {
  normalize_link_status,
  validate_link_start_context,
  type auth_link_status,
} from '@/lib/auth/link/rules'
import { build_line_auth_url } from '@/lib/auth/line/oauth'
import { line_login_channel_id } from '@/lib/config/line/env'
import { debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

import { normalize_pwa_line_link_status_body } from './context'
import { normalize_pass_code, pwa_line_link_purpose } from './rules'

const pass_ttl_ms = 10 * 60 * 1000

type one_time_pass_row = {
  pass_uuid: string
  code: string
  purpose: string
  status: string
  visitor_uuid: string
  completed_user_uuid: string | null
  is_open: boolean
  opened_at: string | null
  closed_at: string | null
  expires_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
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

function random_pass_code() {
  return randomBytes(24).toString('base64url')
}

async function expire_open_pass_row(pass_uuid: string): Promise<void> {
  const now = new Date().toISOString()

  const updated = await supabase
    .from('one_time_passes')
    .update({
      status: 'expired',
      is_open: false,
      closed_at: now,
      updated_at: now,
    })
    .eq('pass_uuid', pass_uuid)
    .eq('status', 'open')
    .eq('is_open', true)
    .select('visitor_uuid, purpose')
    .maybeSingle()

  if (!updated.error && updated.data) {
    await debug_event({
      category: 'pwa',
      event: 'one_time_pass_expired',
      payload: {
        pass_uuid,
        visitor_uuid: updated.data.visitor_uuid,
        purpose: updated.data.purpose,
        phase: 'one_time_pass_lazy_expire',
      },
    })
  }
}

async function maybe_expire_open_pass_row(
  row: one_time_pass_row,
): Promise<one_time_pass_row> {
  if (row.status !== 'open' || !row.is_open) {
    return row
  }

  if (new Date(row.expires_at).getTime() > Date.now()) {
    return row
  }

  await expire_open_pass_row(row.pass_uuid)

  return {
    ...row,
    status: 'expired',
    is_open: false,
    closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

async function code_is_free_for_row(
  code: string,
  pass_uuid: string | null,
): Promise<boolean> {
  const owner = await supabase
    .from('one_time_passes')
    .select('pass_uuid')
    .eq('code', code)
    .maybeSingle()

  if (owner.error) {
    throw owner.error
  }

  if (!owner.data) {
    return true
  }

  return pass_uuid !== null && owner.data.pass_uuid === pass_uuid
}

export type pwa_line_link_start_success = {
  ok: true
  auth_url: string
  pass_uuid: string
  code: string
  status: auth_link_status
  visitor_uuid: string | null
  user_uuid: string | null
  source_channel: string
}

export type pwa_line_link_start_failure = {
  ok: false
  http_status: number
  error_code: string
  error_message: string
  cause: Record<string, unknown> | null
  visitor_uuid?: string | null
  user_uuid?: string | null
  source_channel?: string | null
}

export async function run_pwa_line_link_start(input: {
  body: Record<string, unknown> | null
  visitor_uuid: string | null
}): Promise<pwa_line_link_start_success | pwa_line_link_start_failure> {
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
    return {
      ok: false,
      http_status: 500,
      error_code: 'visitor_lookup_failed',
      error_message:
        error instanceof Error ? error.message : 'visitor_lookup_failed',
      cause: serialize_unknown_error(error),
    }
  }

  await debug_event({
    category: 'pwa',
    event: 'auth_link_start_context_resolved',
    payload: {
      ...link_start_base_payload(context),
      phase: 'pwa_line_link_start',
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
      phase: 'pwa_line_link_start',
    },
  })

  await debug_event({
    category: 'pwa',
    event: 'pwa_line_link_started',
    payload: {
      ...link_start_base_payload(context),
      phase: 'pwa_line_link_start_requested',
    },
  })

  const visitor = clean_uuid(context.visitor_uuid)

  if (!visitor) {
    return {
      ok: false,
      http_status: 400,
      error_code: 'visitor_required',
      error_message: 'visitor_uuid is required',
      cause: null,
      visitor_uuid: context.visitor_uuid,
      user_uuid: context.user_uuid,
      source_channel: context.source_channel,
    }
  }

  const purpose = pwa_line_link_purpose
  const expires_at = new Date(Date.now() + pass_ttl_ms).toISOString()
  const now = new Date().toISOString()
  let last_error: unknown = null

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = random_pass_code()

    const existing_result = await supabase
      .from('one_time_passes')
      .select('*')
      .eq('visitor_uuid', visitor)
      .eq('purpose', purpose)
      .maybeSingle()

    if (existing_result.error) {
      last_error = existing_result.error

      break
    }

    const existing = existing_result.data as one_time_pass_row | null

    if (!(await code_is_free_for_row(code, existing?.pass_uuid ?? null))) {
      continue
    }

    const patch = {
      code,
      status: 'open' as const,
      is_open: true,
      opened_at: now,
      closed_at: null as string | null,
      expires_at,
      completed_user_uuid: null as string | null,
      completed_at: null as string | null,
      updated_at: now,
    }

    let row: one_time_pass_row | null = null

    if (existing) {
      const updated = await supabase
        .from('one_time_passes')
        .update(patch)
        .eq('pass_uuid', existing.pass_uuid)
        .select('*')
        .single()

      if (updated.error) {
        last_error = updated.error

        const dup =
          typeof updated.error === 'object' &&
          updated.error !== null &&
          'code' in updated.error &&
          (updated.error as { code?: string }).code === '23505'

        if (dup) {
          continue
        }

        break
      }

      row = updated.data as unknown as one_time_pass_row

      await debug_event({
        category: 'pwa',
        event: 'one_time_pass_reused',
        payload: {
          ...link_start_base_payload(context),
          pass_uuid: row.pass_uuid,
          purpose,
          phase: 'pwa_line_link_start',
        },
      })
    } else {
      const inserted = await supabase
        .from('one_time_passes')
        .insert({
          visitor_uuid: visitor,
          purpose,
          created_at: now,
          ...patch,
        })
        .select('*')
        .single()

      if (inserted.error) {
        last_error = inserted.error

        const dup =
          typeof inserted.error === 'object' &&
          inserted.error !== null &&
          'code' in inserted.error &&
          (inserted.error as { code?: string }).code === '23505'

        if (dup) {
          continue
        }

        break
      }

      row = inserted.data as unknown as one_time_pass_row

      await debug_event({
        category: 'pwa',
        event: 'one_time_pass_opened',
        payload: {
          ...link_start_base_payload(context),
          pass_uuid: row.pass_uuid,
          purpose,
          phase: 'pwa_line_link_start',
        },
      })
    }

    if (!row) {
      break
    }

    const client_id = line_login_channel_id()
    const callback_url = process.env.LINE_LOGIN_CALLBACK_URL?.trim()

    await debug_event({
      category: 'pwa',
      event: 'line_auth_url_build_started',
      payload: {
        ...link_start_base_payload(context),
        pass_uuid: row.pass_uuid,
        phase: 'line_oauth_url',
        line_client_id_configured: Boolean(client_id),
        line_callback_url_configured: Boolean(callback_url),
      },
    })

    if (!client_id || !callback_url) {
      await supabase
        .from('one_time_passes')
        .update({
          status: 'failed',
          is_open: false,
          closed_at: now,
          updated_at: now,
        })
        .eq('pass_uuid', row.pass_uuid)

      await debug_event({
        category: 'pwa',
        event: 'line_auth_url_build_failed',
        payload: {
          ...link_start_base_payload(context),
          pass_uuid: row.pass_uuid,
          error_code: 'line_login_not_configured',
        },
      })

      return {
        ok: false,
        http_status: 500,
        error_code: 'line_login_not_configured',
        error_message: 'LINE Login is not configured',
        cause: null,
        visitor_uuid: context.visitor_uuid,
        user_uuid: context.user_uuid,
        source_channel: context.source_channel,
      }
    }

    let auth_url: string

    try {
      auth_url = build_line_auth_url({
        client_id,
        redirect_uri: callback_url,
        state: row.code,
      }).toString()
    } catch (url_error) {
      await supabase
        .from('one_time_passes')
        .update({
          status: 'failed',
          is_open: false,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('pass_uuid', row.pass_uuid)

      await debug_event({
        category: 'pwa',
        event: 'line_auth_url_build_failed',
        payload: {
          ...link_start_base_payload(context),
          pass_uuid: row.pass_uuid,
          error_message:
            url_error instanceof Error
              ? url_error.message
              : String(url_error),
        },
      })

      return {
        ok: false,
        http_status: 500,
        error_code: 'line_auth_url_build_failed',
        error_message:
          url_error instanceof Error
            ? url_error.message
            : 'line_auth_url_build_failed',
        cause: serialize_unknown_error(url_error),
        visitor_uuid: context.visitor_uuid,
        user_uuid: context.user_uuid,
        source_channel: context.source_channel,
      }
    }

    await debug_event({
      category: 'pwa',
      event: 'line_auth_url_build_succeeded',
      payload: {
        ...link_start_base_payload(context),
        pass_uuid: row.pass_uuid,
        phase: 'line_oauth_url',
      },
    })

    const status = normalize_link_status(row.status, row.expires_at)

    return {
      ok: true,
      auth_url,
      pass_uuid: row.pass_uuid,
      code: row.code,
      status,
      visitor_uuid: visitor,
      user_uuid: context.user_uuid,
      source_channel: context.source_channel,
    }
  }

  return {
    ok: false,
    http_status: 500,
    error_code: 'one_time_pass_upsert_failed',
    error_message:
      last_error instanceof Error
        ? last_error.message
        : 'one_time_pass_upsert_failed',
    cause: serialize_unknown_error(last_error),
    visitor_uuid: context.visitor_uuid,
    user_uuid: context.user_uuid,
    source_channel: context.source_channel,
  }
}

export async function get_pwa_line_link_poll_status(input: {
  body: Record<string, unknown> | null
}): Promise<{
  status: auth_link_status
  completed_user_uuid: string | null
  return_path: string | null
  pass_uuid: string | null
  visitor_uuid: string | null
  purpose: string | null
}> {
  const parsed = normalize_pwa_line_link_status_body(input.body)

  let query = supabase
    .from('one_time_passes')
    .select('*')
    .eq('purpose', parsed.purpose)

  if (parsed.visitor_uuid) {
    query = query.eq('visitor_uuid', parsed.visitor_uuid)
  } else if (parsed.pass_uuid) {
    query = query.eq('pass_uuid', parsed.pass_uuid)
  } else if (parsed.code) {
    query = query.eq('code', parsed.code)
  } else {
    return {
      status: 'failed',
      completed_user_uuid: null,
      return_path: null,
      pass_uuid: null,
      visitor_uuid: null,
      purpose: parsed.purpose,
    }
  }

  const result = await query.maybeSingle()

  if (result.error) {
    throw result.error
  }

  const raw = result.data as one_time_pass_row | null

  if (!raw) {
    return {
      status: 'failed',
      completed_user_uuid: null,
      return_path: null,
      pass_uuid: null,
      visitor_uuid: parsed.visitor_uuid,
      purpose: parsed.purpose,
    }
  }

  const row = await maybe_expire_open_pass_row(raw)
  const status = normalize_link_status(row.status, row.expires_at)

  return {
    status,
    completed_user_uuid: row.completed_user_uuid,
    return_path: null,
    pass_uuid: row.pass_uuid,
    visitor_uuid: row.visitor_uuid,
    purpose: row.purpose,
  }
}

export async function find_pending_pwa_line_pass_by_line_oauth_state(
  state: string | null,
): Promise<{
  row: one_time_pass_row
  status: auth_link_status
} | null> {
  const code = normalize_pass_code(state)

  if (!code) {
    return null
  }

  const result = await supabase
    .from('one_time_passes')
    .select('*')
    .eq('code', code)
    .eq('purpose', pwa_line_link_purpose)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const raw = result.data as one_time_pass_row | null

  if (!raw) {
    return null
  }

  if (raw.status !== 'open' || !raw.is_open) {
    return null
  }

  if (new Date(raw.expires_at).getTime() <= Date.now()) {
    await expire_open_pass_row(raw.pass_uuid)

    return null
  }

  const status = normalize_link_status(raw.status, raw.expires_at)

  if (status !== 'open') {
    return null
  }

  return { row: raw, status: 'open' }
}

export async function fail_pwa_line_pass(input: {
  pass_uuid: string
  error_code: string
  error_message?: string | null
}) {
  const pass_uuid = clean_uuid(input.pass_uuid)

  if (!pass_uuid) {
    return
  }

  const now = new Date().toISOString()

  await supabase
    .from('one_time_passes')
    .update({
      status: 'failed',
      is_open: false,
      closed_at: now,
      updated_at: now,
    })
    .eq('pass_uuid', pass_uuid)
    .eq('status', 'open')
    .eq('is_open', true)
}

export async function complete_pwa_line_pass_after_line_access(input: {
  pass_uuid: string
  completed_user_uuid: string
}) {
  const pass_uuid = clean_uuid(input.pass_uuid)
  const user_uuid = clean_uuid(input.completed_user_uuid)

  if (!pass_uuid || !user_uuid) {
    throw new Error('invalid_pass_or_user')
  }

  const now = new Date().toISOString()
  const updated = await supabase
    .from('one_time_passes')
    .update({
      status: 'completed',
      is_open: false,
      completed_user_uuid: user_uuid,
      completed_at: now,
      closed_at: now,
      updated_at: now,
    })
    .eq('pass_uuid', pass_uuid)
    .eq('status', 'open')
    .eq('is_open', true)
    .select('*')
    .maybeSingle()

  if (updated.error) {
    throw updated.error
  }

  const row = updated.data as unknown as one_time_pass_row | null

  if (!row) {
    throw new Error('pass_already_completed_or_missing')
  }

  const visitor_uuid = clean_uuid(row.visitor_uuid)

  if (visitor_uuid) {
    const visitor_update = await supabase
      .from('visitors')
      .update({
        user_uuid,
        updated_at: now,
      })
      .eq('visitor_uuid', visitor_uuid)
      .is('user_uuid', null)
      .select('visitor_uuid, user_uuid')
      .maybeSingle()

    if (visitor_update.error) {
      await debug_event({
        category: 'pwa',
        event: 'pwa_user_restore_failed',
        payload: {
          visitor_uuid,
          user_uuid,
          phase: 'one_time_pass_completed',
          reason: 'visitor_user_uuid_persist_failed',
          restore_source: 'one_time_pass_completed',
          error_code: visitor_update.error.code ?? null,
          error_message: visitor_update.error.message,
        },
      })

      throw visitor_update.error
    }

    await debug_event({
      category: 'pwa',
      event: 'pwa_user_restore_succeeded',
      payload: {
        visitor_uuid,
        user_uuid,
        phase: 'one_time_pass_completed',
        reason: 'visitor_user_uuid_persisted',
        restore_source: 'one_time_pass_completed',
      },
    })
  }

  await debug_event({
    category: 'pwa',
    event: 'one_time_pass_completed',
    payload: {
      pass_uuid: row.pass_uuid,
      visitor_uuid: row.visitor_uuid,
      completed_user_uuid: user_uuid,
      phase: 'line_callback_one_time_pass',
    },
  })

  return row
}

export async function run_line_callback_for_pwa_one_time_pass(input: {
  code: string
  line_user_id: string
  display_name: string | null
  image_url: string | null
}): Promise<{
  visitor_uuid: string
  user_uuid: string
  return_path: string | null
  is_new_user: boolean
  is_new_visitor: boolean
  display_name: string | null
  locale: string | null
}> {
  const found = await find_pending_pwa_line_pass_by_line_oauth_state(input.code)

  if (!found || found.status !== 'open') {
    throw new Error('pass_not_pending')
  }

  const { row } = found
  const visitor_uuid = clean_uuid(row.visitor_uuid)

  if (!visitor_uuid) {
    await fail_pwa_line_pass({
      pass_uuid: row.pass_uuid,
      error_code: 'missing_visitor_on_pass',
    })

    throw new Error('missing_visitor_on_pass')
  }

  const access: access_result = await resolve_auth_access({
    provider: 'line',
    provider_id: input.line_user_id,
    visitor_uuid,
    display_name: input.display_name,
    image_url: input.image_url,
    locale: null,
  })

  await complete_pwa_line_pass_after_line_access({
    pass_uuid: row.pass_uuid,
    completed_user_uuid: access.user_uuid,
  })

  return {
    visitor_uuid: access.visitor_uuid,
    user_uuid: access.user_uuid,
    return_path: '/',
    is_new_user: access.is_new_user,
    is_new_visitor: access.is_new_visitor,
    display_name: input.display_name,
    locale: access.locale,
  }
}
