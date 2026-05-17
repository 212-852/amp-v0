import 'server-only'

import { debug_event } from '@/lib/debug'
import { deliver_line_text_reply } from '@/lib/output/line'

export type line_webhook_phase =
  | 'raw_body_read'
  | 'signature_verify'
  | 'event_parse'
  | 'line_user_resolve'
  | 'room_resolve'
  | 'intent_check'
  | 'recruitment_bundle_build'
  | 'output_line_send'

export type line_webhook_context = {
  line_user_id?: string | null
  reply_token?: string | null
  message_text?: string | null
  room_uuid?: string | null
  participant_uuid?: string | null
  user_uuid?: string | null
  visitor_uuid?: string | null
  message_id?: string | null
  event_type?: string | null
}

function serialize_error(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack_exists: Boolean(error.stack),
      stack: error.stack,
    }
  }

  return {
    name: null,
    message: String(error),
    stack_exists: false,
    stack: null,
  }
}

export function read_line_webhook_env_snapshot() {
  return {
    line_messaging_channel_secret_exists: Boolean(
      process.env.LINE_MESSAGING_CHANNEL_SECRET?.trim(),
    ),
    line_messaging_channel_access_token_exists: Boolean(
      process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim(),
    ),
    line_login_channel_secret_exists: Boolean(
      process.env.LINE_LOGIN_CHANNEL_SECRET?.trim(),
    ),
    line_reply_test_mode: process.env.LINE_REPLY_TEST_MODE === 'true',
  }
}

export async function line_webhook_debug(
  event: string,
  payload: Record<string, unknown> = {},
) {
  try {
    await debug_event({
      category: 'line_webhook',
      event,
      payload: {
        timestamp: new Date().toISOString(),
        ...read_line_webhook_env_snapshot(),
        ...payload,
      },
    })
  } catch {
    /* observability only */
  }
}

export async function line_webhook_phase_started(
  phase: line_webhook_phase,
  context: line_webhook_context = {},
) {
  await line_webhook_debug('line_webhook_phase_started', {
    phase,
    ...context,
  })
}

export async function line_webhook_phase_succeeded(
  phase: line_webhook_phase,
  context: line_webhook_context = {},
  extra: Record<string, unknown> = {},
) {
  await line_webhook_debug('line_webhook_phase_succeeded', {
    phase,
    ...context,
    ...extra,
  })
}

export async function line_webhook_phase_failed(
  phase: line_webhook_phase,
  input: {
    reason: string
    error?: unknown
    context?: line_webhook_context
    extra?: Record<string, unknown>
  },
) {
  const err = input.error ? serialize_error(input.error) : null

  await line_webhook_debug('line_webhook_phase_failed', {
    phase,
    reason: input.reason,
    error_code: err?.name ?? null,
    error_message: err?.message ?? input.reason,
    stack_exists: err?.stack_exists ?? false,
    ...(input.context ?? {}),
    ...(input.extra ?? {}),
  })
}

export async function line_webhook_fallback_returned(input: {
  phase: string
  reason: string
  error?: unknown
  context?: line_webhook_context
  extra?: Record<string, unknown>
}) {
  const err = input.error ? serialize_error(input.error) : null

  await line_webhook_debug('line_webhook_fallback_returned', {
    phase: input.phase,
    reason: input.reason,
    error_code: err?.name ?? null,
    error_message: err?.message ?? input.reason,
    stack_exists: err?.stack_exists ?? false,
    line_user_id_exists: Boolean(input.context?.line_user_id),
    reply_token_exists: Boolean(input.context?.reply_token),
    message_text: input.context?.message_text ?? null,
    room_uuid: input.context?.room_uuid ?? null,
    participant_uuid: input.context?.participant_uuid ?? null,
    user_uuid: input.context?.user_uuid ?? null,
    ...(input.extra ?? {}),
  })

  if (!input.context?.reply_token) {
    return
  }

  try {
    await deliver_line_text_reply({
      reply_token: input.context.reply_token,
      text: 'LINE chat is temporarily unavailable. Please try again later.',
    })
  } catch (reply_error) {
    const reply_err = serialize_error(reply_error)

    await line_webhook_debug('line_webhook_phase_failed', {
      phase: 'output_line_send',
      reason: 'fallback_reply_failed',
      error_code: reply_err.name,
      error_message: reply_err.message,
      stack_exists: reply_err.stack_exists,
      reply_token_exists: Boolean(input.context?.reply_token),
    })
  }
}
