'use client'

import { build_session_restore_headers } from '@/lib/visitor/client'

export const pending_line_link_session_storage_key =
  'amp_pending_line_link_session'

export type poll_auth_link_outcome =
  | { status: 'completed'; completed_user_uuid: string | null }
  | { status: 'expired' | 'failed' | 'timeout' }

export async function poll_auth_link_session_client(input: {
  link_session_uuid: string
  max_ms?: number
}): Promise<poll_auth_link_outcome> {
  const max_ms = input.max_ms ?? 120_000
  const started = Date.now()

  while (Date.now() - started < max_ms) {
    const response = await fetch('/api/auth/link/status', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...build_session_restore_headers(),
      },
      body: JSON.stringify({ link_session_uuid: input.link_session_uuid }),
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

    if (status === 'expired' || status === 'failed' || !response.ok) {
      return { status: status === 'expired' ? 'expired' : 'failed' }
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 2_000)
    })
  }

  return { status: 'timeout' }
}
