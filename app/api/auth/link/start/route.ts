import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { run_auth_link_start } from '@/lib/auth/link/action'
import { debug_event } from '@/lib/debug'
import { clean_uuid } from '@/lib/db/uuid/payload'
import {
  client_visitor_header_name,
  resolved_visitor_request_header_name,
  visitor_cookie_name,
} from '@/lib/visitor/cookie'

export async function POST(request: Request) {
  const header_store = await headers()
  const cookie_store = await cookies()
  const cookie_visitor = cookie_store.get(visitor_cookie_name)?.value ?? null
  const header_visitor = header_store.get(client_visitor_header_name)

  await debug_event({
    category: 'pwa',
    event: 'auth_link_start_api_entered',
    payload: {
      phase: 'link_start_api',
      cookie_present: Boolean(cookie_visitor),
      header_visitor_present: Boolean(header_visitor),
      pathname: '/api/auth/link/start',
    },
  })

  try {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    const visitor_uuid =
      clean_uuid(cookie_visitor) ??
      clean_uuid(header_visitor) ??
      clean_uuid(header_store.get(resolved_visitor_request_header_name))

    const result = await run_auth_link_start({
      body,
      visitor_uuid,
    })

    if (!result.ok) {
      await debug_event({
        category: 'pwa',
        event: 'auth_link_start_response_sent',
        payload: {
          phase: 'link_start_api',
          ok: false,
          http_status: result.http_status,
          visitor_uuid: result.visitor_uuid ?? visitor_uuid,
          user_uuid: result.user_uuid ?? null,
          source_channel:
            result.source_channel ??
            (typeof body?.source_channel === 'string'
              ? body.source_channel
              : null),
          provider:
            typeof body?.provider === 'string' ? body.provider : null,
          state_exists: null,
          auth_url_exists: false,
          insert_success: null,
          redirect_url: null,
          return_path:
            typeof body?.return_path === 'string' ? body.return_path : null,
          is_standalone: body?.is_standalone === true,
          error_code: result.error_code,
          error_message: result.error_message,
          cause: result.cause,
        },
      })

      return NextResponse.json(
        {
          ok: false,
          error: 'link_start_failed',
          error_code: result.error_code,
          error_message: result.error_message,
          cause: result.cause,
        },
        { status: result.http_status },
      )
    }

    await debug_event({
      category: 'pwa',
      event: 'auth_link_start_response_sent',
      payload: {
        phase: 'link_start_api',
        ok: true,
        http_status: 200,
        visitor_uuid: result.visitor_uuid,
        user_uuid: result.user_uuid,
        source_channel: result.source_channel,
        provider: 'line',
        link_state: result.link_state,
        link_session_uuid: result.link_state,
        state_exists: true,
        auth_url_exists: true,
        insert_success: true,
        redirect_url: result.auth_url,
        return_path:
          typeof body?.return_path === 'string' ? body.return_path : null,
        is_standalone: body?.is_standalone === true,
        error_code: null,
        error_message: null,
      },
    })

    return NextResponse.json({
      ok: true,
      auth_url: result.auth_url,
      link_state: result.link_state,
      link_session_uuid: result.link_state,
      status: result.status,
    })
  } catch (error) {
    const error_message =
      error instanceof Error ? error.message : String(error)
    const cause =
      error instanceof Error
        ? {
            error_name: error.name,
            error_message: error.message,
            error_stack: error.stack ?? null,
          }
        : { error_message: String(error) }

    await debug_event({
      category: 'pwa',
      event: 'auth_link_start_response_sent',
      payload: {
        phase: 'link_start_api',
        ok: false,
        http_status: 500,
        state_exists: null,
        auth_url_exists: false,
        insert_success: null,
        redirect_url: null,
        error_code: 'link_start_unhandled',
        error_message,
        cause,
      },
    })

    return NextResponse.json(
      {
        ok: false,
        error: 'link_start_failed',
        error_code: 'link_start_unhandled',
        error_message,
        cause,
      },
      { status: 500 },
    )
  }
}
