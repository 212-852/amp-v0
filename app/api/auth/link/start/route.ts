import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { create_auth_link_session } from '@/lib/auth/link/action'
import { build_start_link_context } from '@/lib/auth/link/context'
import { debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import {
  client_visitor_header_name,
  visitor_cookie_name,
} from '@/lib/visitor/cookie'

async function resolve_user_uuid(visitor_uuid: string | null) {
  if (!visitor_uuid) {
    return null
  }

  const result = await supabase
    .from('visitors')
    .select('user_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data?.user_uuid ?? null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    const cookie_store = await cookies()
    const header_store = await headers()
    const visitor_uuid =
      clean_uuid(cookie_store.get(visitor_cookie_name)?.value) ??
      clean_uuid(header_store.get(client_visitor_header_name))
    const user_uuid = await resolve_user_uuid(visitor_uuid)
    const context = build_start_link_context({
      body,
      visitor_uuid,
      user_uuid,
    })

    await debug_event({
      category: 'pwa',
      event: 'pwa_line_link_started',
      payload: {
        visitor_uuid: context.visitor_uuid,
        user_uuid: context.user_uuid,
        source_channel: context.source_channel,
        provider: context.provider,
        return_path: context.return_path,
        is_standalone: context.is_standalone,
        phase: 'link_start_requested',
      },
    })

    const output = await create_auth_link_session(context)

    return NextResponse.json({ ok: true, ...output })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'link_start_failed',
      },
      { status: 500 },
    )
  }
}
