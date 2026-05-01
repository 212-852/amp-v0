import 'server-only'

import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

export const visitor_cookie_name = 'amp_visitor_uuid'

export type visitor_context = {
  visitor_uuid: string
  is_new_visitor: boolean
}

export async function resolve_visitor_context(): Promise<visitor_context> {
  const cookie_store = await cookies()
  const current_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value

  if (current_visitor_uuid) {
    return {
      visitor_uuid: current_visitor_uuid,
      is_new_visitor: false,
    }
  }

  const visitor_uuid = randomUUID()

  cookie_store.set(visitor_cookie_name, visitor_uuid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  return {
    visitor_uuid,
    is_new_visitor: true,
  }
}