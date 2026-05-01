import 'server-only'

import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

export const visitor_cookie_name = 'amp_visitor_uuid'
export const session_cookie_name = 'amp_session_uuid'

export type visitor_context = {
  visitor_uuid: string
  session_uuid: string
  is_new_visitor: boolean
  is_new_session: boolean
}

export async function resolve_visitor_context(): Promise<visitor_context> {
  const cookie_store = await cookies()
  const current_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value
  const current_session_uuid =
    cookie_store.get(session_cookie_name)?.value

  const visitor_uuid = current_visitor_uuid ?? randomUUID()
  const session_uuid = current_session_uuid ?? randomUUID()
  const is_new_visitor = !current_visitor_uuid
  const is_new_session = !current_session_uuid

  if (is_new_visitor) {
    cookie_store.set(visitor_cookie_name, visitor_uuid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  if (is_new_session) {
    cookie_store.set(session_cookie_name, session_uuid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24,
    })
  }

  return {
    visitor_uuid,
    session_uuid,
    is_new_visitor,
    is_new_session,
  }
}
