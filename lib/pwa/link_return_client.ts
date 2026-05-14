'use client'

import { pwa_line_link_purpose } from '@/lib/auth/pwa/link/rules'
import { build_session_restore_headers } from '@/lib/visitor/client'

export const pending_pwa_line_pass_storage_key =
  'amp_pending_pwa_line_link_visitor_uuid'

/** @deprecated use pending_pwa_line_pass_storage_key */
export const pending_line_link_session_storage_key =
  pending_pwa_line_pass_storage_key

export type poll_pwa_line_link_outcome =
  | { status: 'completed'; completed_user_uuid: string | null }
  | { status: 'expired' | 'failed' | 'timeout' }

export async function poll_pwa_line_link_status_client(input: {
  visitor_uuid: string
  max_ms?: number
}): Promise<poll_pwa_line_link_outcome> {
  const max_ms = input.max_ms ?? 60_000
  const started = Date.now()

  while (Date.now() - started < max_ms) {
    const response = await fetch('/api/auth/pwa/link/status', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...build_session_restore_headers(),
      },
      body: JSON.stringify({
        visitor_uuid: input.visitor_uuid,
        purpose: pwa_line_link_purpose,
      }),
    })

    const payload = (await response.json().catch(() => null)) as {
      status?: string
      completed_user_uuid?: string | null
    } | null

    const status = payload?.status ?? 'failed'

    if (status === 'completed') {
      return {
        status: 'completed',
        completed_user_uuid: payload?.completed_user_uuid ?? null,
      }
    }

    if (
      status === 'expired' ||
      status === 'failed' ||
      status === 'closed' ||
      !response.ok
    ) {
      return { status: status === 'expired' ? 'expired' : 'failed' }
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 2_000)
    })
  }

  return { status: 'timeout' }
}

/** @deprecated use poll_pwa_line_link_status_client */
export async function poll_auth_link_session_client(input: {
  link_session_uuid: string
  max_ms?: number
}): Promise<poll_pwa_line_link_outcome> {
  return poll_pwa_line_link_status_client({
    visitor_uuid: input.link_session_uuid,
    max_ms: input.max_ms,
  })
}
