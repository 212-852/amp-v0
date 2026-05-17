'use client'

import type { Liff } from '@line/liff'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { is_line_in_app_browser } from '@/lib/auth/context'
import {
  build_liff_redirect_uri,
  read_return_path_from_location,
} from '@/lib/auth/liff/redirect_uri'
import Loading from '@/components/shared/loading'

type liff_debug_payload = Record<string, unknown>

/** LINE Developers LIFF id for production (client bundle; must match env). */
const EXPECTED_LIFF_ID = '2006953406-vj2gYoAb'

/** LINE LIFF Endpoint URL registered in LINE Developers (trailing slash). */
const EXPECTED_LIFF_ENDPOINT_ORIGIN = 'https://app.da-nya.com'

function should_skip_path(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/driver') ||
    pathname.startsWith('/api')
  )
}

/**
 * LIFF bootstrap only in LINE in-app WebView (`Line/` user agent).
 * Desktop (incl. `liff.referrer` on the endpoint URL or `liff.line.me` in Chrome) uses OAuth via `/api/auth/line`.
 */
function should_run_liff_bootstrap(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return is_line_in_app_browser(navigator.userAgent)
}

function serialize_error(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    message: String(error),
  }
}

async function emit_liff_debug(
  event: string,
  payload: liff_debug_payload = {},
) {
  console.log('[liff] step', event, payload)

  try {
    await fetch('/api/debug/liff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        event,
        payload,
      }),
    })
  } catch (error) {
    console.error('[liff] debug event failed', event, error)
  }
}

async function emit_liff_auth_failed(payload: liff_debug_payload) {
  await emit_liff_debug('liff_auth_failed', payload)
}

async function read_session_snapshot() {
  try {
    const response = await fetch('/api/session', {
      credentials: 'include',
    })

    if (!response.ok) {
      return {
        session_restored: false,
        user_uuid: null,
        visitor_uuid: null,
        role: null,
        tier: null,
      }
    }

    const data = (await response.json().catch(() => null)) as {
      user_uuid?: string | null
      visitor_uuid?: string | null
      role?: string | null
      tier?: string | null
    } | null

    return {
      session_restored: Boolean(data?.user_uuid || data?.visitor_uuid),
      user_uuid: data?.user_uuid ?? null,
      visitor_uuid: data?.visitor_uuid ?? null,
      role: data?.role ?? null,
      tier: data?.tier ?? null,
    }
  } catch {
    return {
      session_restored: false,
      user_uuid: null,
      visitor_uuid: null,
      role: null,
      tier: null,
    }
  }
}

async function read_liff_id_token(liff: Liff): Promise<string | null> {
  try {
    const raw = liff.getIDToken()

    if (typeof raw === 'string') {
      return raw.length > 0 ? raw : null
    }

    if (
      raw !== null &&
      raw !== undefined &&
      typeof (raw as Promise<string | null>).then === 'function'
    ) {
      try {
        const resolved = await (raw as Promise<string | null>)

        return typeof resolved === 'string' && resolved.length > 0
          ? resolved
          : null
      } catch (error) {
        console.error('[liff] id token read failed', error)

        return null
      }
    }

    return null
  } catch (error) {
    console.error('[liff] getIDToken failed', error)

    return null
  }
}

export default function LiffBootstrap() {
  const router = useRouter()
  const [is_loading, set_is_loading] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return (
      is_line_in_app_browser(navigator.userAgent) &&
      !should_skip_path(window.location.pathname)
    )
  })
  const [liff_error, set_liff_error] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (should_skip_path(window.location.pathname)) {
      return
    }

    if (!should_run_liff_bootstrap()) {
      return
    }

    const href = window.location.href
    const user_agent = navigator.userAgent
    const pathname = window.location.pathname
    const is_line_browser = is_line_in_app_browser(user_agent)
    const is_liff_url = href.includes('liff.line.me')
    const liff_id = process.env.NEXT_PUBLIC_LIFF_ID ?? ''
    const base_payload = {
      href,
      user_agent,
      pathname,
      is_line_browser,
      is_liff_url,
    }

    const global_started = globalThis as unknown as {
      __amp_liff_started?: boolean
    }

    if (global_started.__amp_liff_started) {
      void emit_liff_debug('liff_bootstrap_duplicate_skipped', {
        ...base_payload,
        liff_id,
        reason: 'window.__amp_liff_started',
      })

      return
    }

    global_started.__amp_liff_started = true

    function build_auth_request_payload(input: {
      line_user_id: string
      display_name: string | null
      picture_url: string | null
      id_token?: string | null
    }) {
      return {
        line_user_id: input.line_user_id,
        display_name: input.display_name,
        picture_url: input.picture_url,
        source_channel: 'liff',
        return_path: read_return_path_from_location(),
        current_url: window.location.href,
        pathname: window.location.pathname,
        search: window.location.search,
        ...(input.id_token ? { id_token: input.id_token } : {}),
      }
    }

    async function post_liff_session(payload: Record<string, unknown>) {
      return fetch('/api/auth/line/liff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
    }

    async function finish_auth_response(
      response: Response,
      context: liff_debug_payload,
    ) {
      const result = await response.json().catch((error) => {
        console.error('[liff] auth response parse failed', error)

        void emit_liff_debug('liff_auth_api_result_parse_failed', {
          ...base_payload,
          status: response.status,
          error: serialize_error(error),
        })

        return null
      })

      console.log('[liff] auth result', result)
      console.log('[liff] auth response status', response.status)

      if (!response.ok) {
        const session_snapshot = await read_session_snapshot()
        const error_code =
          result &&
          typeof result === 'object' &&
          'error_code' in result &&
          typeof (result as { error_code?: string }).error_code === 'string'
            ? (result as { error_code: string }).error_code
            : `http_${response.status}`

        await emit_liff_auth_failed({
          ...context,
          ...session_snapshot,
          http_status: response.status,
          error_code,
          error_message:
            result &&
            typeof result === 'object' &&
            'error' in result &&
            typeof (result as { error?: string }).error === 'string'
              ? (result as { error: string }).error
              : `HTTP ${response.status}`,
          reason: 'liff_auth_api_failed',
        })

        const msg =
          result &&
          typeof result === 'object' &&
          'error' in result &&
          typeof (result as { error?: string }).error === 'string'
            ? (result as { error: string }).error
            : `HTTP ${response.status}`
        set_liff_error(msg)
        console.error('[liff] auth API error', response.status, result)
      } else if (
        result &&
        typeof result === 'object' &&
        'ok' in result &&
        result.ok === true
      ) {
        await emit_liff_debug('liff_auth_api_completed', {
          ...base_payload,
          status: response.status,
          result,
        })
        window.dispatchEvent(new Event('amp_session_changed'))
        router.refresh()
      } else {
        await emit_liff_auth_failed({
          ...context,
          http_status: response.status,
          error_code: 'unexpected_result',
          error_message: 'Unexpected LIFF auth API result',
          reason: 'unexpected_result',
          result,
        })
        set_liff_error('LIFF auth failed')
      }

      set_is_loading(false)
    }

    async function run() {
      let liff_init_completed_ok = false
      let liff_handle: Liff | null = null
      let auth_context: liff_debug_payload = {
        ...base_payload,
        liff_id_exists: Boolean(liff_id),
        liff_initialized: false,
        is_liff_browser: is_line_browser,
        is_in_client: false,
        is_logged_in: false,
        has_access_token: false,
        line_user_id_exists: false,
        line_profile_loaded: false,
        return_path: read_return_path_from_location(),
        current_url: href,
        pathname,
        search: window.location.search,
      }

      try {
        set_is_loading(true)
        set_liff_error(null)

        await emit_liff_debug('liff_bootstrap_started', base_payload)

        if (!liff_id) {
          await emit_liff_debug('liff_bootstrap_failed', {
            ...base_payload,
            reason: 'missing_liff_id',
          })
          set_is_loading(false)
          set_liff_error('NEXT_PUBLIC_LIFF_ID is not set')

          return
        }

        await emit_liff_debug('liff_environment_detected', {
          ...base_payload,
          liff_id,
          liff_id_matches_expected: liff_id === EXPECTED_LIFF_ID,
          expected_liff_id: EXPECTED_LIFF_ID,
          page_origin: window.location.origin,
          liff_endpoint_origin_expected: EXPECTED_LIFF_ENDPOINT_ORIGIN,
          origin_matches_liff_endpoint:
            window.location.origin === EXPECTED_LIFF_ENDPOINT_ORIGIN,
        })

        let liff: Liff

        try {
          const mod = await import('@line/liff')

          liff = mod.default
          liff_handle = liff
          await emit_liff_debug('liff_sdk_imported', base_payload)

          let sdk_version: string | null = null

          try {
            sdk_version = liff.getVersion()
          } catch {
            sdk_version = null
          }

          await emit_liff_debug('liff_origin_checked', {
            href: window.location.href,
            origin: window.location.origin,
            pathname: window.location.pathname,
            liff_id,
            sdk_version: sdk_version ?? 'unavailable',
          })
        } catch (error) {
          await emit_liff_debug('liff_sdk_import_failed', {
            ...base_payload,
            error: serialize_error(error),
          })
          console.error('[liff] @line/liff import failed', error)
          set_liff_error('LIFF SDK could not be loaded')
          set_is_loading(false)

          return
        }

        const pre_init_is_in_client = liff.isInClient()

        await emit_liff_debug(
          pre_init_is_in_client
            ? 'liff_in_client_true'
            : 'liff_in_client_false',
          {
            ...base_payload,
            liff_id,
            phase: 'before_init',
            is_in_client: pre_init_is_in_client,
          },
        )

        if (is_line_browser && !pre_init_is_in_client) {
          const bootstrap_key = 'amp_liff_bootstrap'
          const redirect_url = `https://liff.line.me/${liff_id}`
          const has_bootstrap_flag =
            window.sessionStorage.getItem(bootstrap_key) === '1'

          if (has_bootstrap_flag) {
            await emit_liff_debug('liff_container_redirect_skipped', {
              ...base_payload,
              liff_id,
              redirect_url,
              reason: 'bootstrap_flag_exists',
            })
          } else {
            window.sessionStorage.setItem(bootstrap_key, '1')
            await emit_liff_debug('liff_container_redirect_started', {
              ...base_payload,
              liff_id,
              redirect_url,
            })
            window.location.replace(redirect_url)

            return
          }
        }

        let init_timeout: number | null = null

        try {
          const location_search = window.location.search
          const document_referrer = document.referrer
          const window_location_href = window.location.href

          const init_payload = {
            ...base_payload,
            liff_id,
            location_search,
            document_referrer,
            window_location_href,
          }

          const search_looks_like_liff_or_oauth =
            /liff|openid|[?&]code=|[?&]state=/i.test(location_search)

          await emit_liff_debug('liff_pre_init_context', {
            ...base_payload,
            liff_id,
            location_search,
            document_referrer,
            window_location_href,
            search_looks_like_liff_or_oauth,
            possibly_line_in_app_not_liff_launch:
              !search_looks_like_liff_or_oauth && document_referrer === '',
          })

          init_timeout = window.setTimeout(() => {
            void emit_liff_debug('liff_init_timeout', init_payload)
          }, 8000)

          await emit_liff_debug('liff_init_started', init_payload)
          await liff.init({ liffId: liff_id })
          window.clearTimeout(init_timeout)
          init_timeout = null
          window.sessionStorage.removeItem('amp_liff_bootstrap')

          await emit_liff_debug('liff_init_completed', base_payload)
          liff_init_completed_ok = true
          auth_context = {
            ...auth_context,
            liff_initialized: true,
          }
        } catch (error) {
          if (init_timeout !== null) {
            window.clearTimeout(init_timeout)
          }

          await emit_liff_debug('liff_init_failed', {
            ...base_payload,
            liff_id,
            error_name: error instanceof Error ? error.name : null,
            error_message:
              error instanceof Error ? error.message : String(error),
            error_stack: error instanceof Error ? error.stack : null,
            error_code:
              typeof error === 'object' && error !== null && 'code' in error
                ? String((error as { code?: unknown }).code)
                : null,
            error: serialize_error(error),
          })
          console.error('[liff] init failed', error)
          await emit_liff_auth_failed({
            ...auth_context,
            liff_initialized: false,
            error_code: 'liff_init_failed',
            error_message:
              error instanceof Error ? error.message : 'LIFF init failed',
            reason: 'liff_init_failed',
            error: serialize_error(error),
          })
          set_liff_error(
            error instanceof Error ? error.message : 'LIFF init failed',
          )
          set_is_loading(false)

          return
        }

        if (
          !liff.isInClient() &&
          !is_line_in_app_browser(navigator.userAgent)
        ) {
          await emit_liff_debug('liff_identity_skipped_not_liff_context', {
            ...base_payload,
            liff_id,
            is_in_client: liff.isInClient(),
          })
          set_is_loading(false)

          return
        }

        const is_in_client = liff.isInClient()
        await emit_liff_debug('liff_in_client_checked', {
          ...base_payload,
          is_in_client,
        })
        await emit_liff_debug(
          is_in_client ? 'liff_in_client_true' : 'liff_in_client_false',
          {
            ...base_payload,
            liff_id,
            phase: 'after_init',
            is_in_client,
          },
        )

        const is_logged_in = liff.isLoggedIn()
        let has_access_token = false

        try {
          const access_token = liff.getAccessToken()
          has_access_token =
            typeof access_token === 'string' && access_token.length > 0
        } catch {
          has_access_token = false
        }

        auth_context = {
          ...auth_context,
          is_in_client,
          is_logged_in,
          has_access_token,
        }

        await emit_liff_debug('liff_login_state_checked', {
          ...base_payload,
          is_in_client,
          is_logged_in,
          has_access_token,
        })

        if (!is_logged_in) {
          console.log('[liff] login started', base_payload)
          await emit_liff_debug('liff_login_started', {
            ...base_payload,
            is_in_client,
            is_logged_in,
            redirect_uri: build_liff_redirect_uri(),
          })
          liff.login({ redirectUri: build_liff_redirect_uri() })

          return
        }

        let profile: Awaited<ReturnType<Liff['getProfile']>>

        try {
          await emit_liff_debug('liff_profile_fetch_started', {
            ...base_payload,
            is_in_client,
            is_logged_in,
          })
          profile = await liff.getProfile()
          await emit_liff_debug('liff_profile_fetch_completed', {
            ...base_payload,
            is_in_client,
            is_logged_in,
            line_user_id: profile.userId,
            has_display_name: Boolean(profile.displayName),
            has_picture_url: Boolean(profile.pictureUrl),
          })
        } catch (error) {
          await emit_liff_debug('liff_profile_fetch_failed', {
            ...base_payload,
            is_in_client,
            is_logged_in,
            error: serialize_error(error),
          })

          await emit_liff_auth_failed({
            ...auth_context,
            line_profile_loaded: false,
            error_code: 'liff_profile_fetch_failed',
            error_message:
              error instanceof Error ? error.message : 'Profile fetch failed',
            reason: 'liff_profile_fetch_failed',
            error: serialize_error(error),
          })

          set_liff_error('LIFF auth failed')
          set_is_loading(false)

          return
        }

        auth_context = {
          ...auth_context,
          line_user_id_exists: Boolean(profile.userId),
          line_profile_loaded: true,
        }

        const id_token = await read_liff_id_token(liff)

        if (!id_token) {
          await emit_liff_debug('liff_id_token_empty', {
            ...base_payload,
            line_user_id: profile.userId,
          })
        }

        if (!liff_init_completed_ok) {
          await emit_liff_debug('liff_auth_api_blocked', {
            ...base_payload,
            liff_id,
            reason: 'init_not_completed',
          })
          set_is_loading(false)

          return
        }

        const global_gate = globalThis as unknown as {
          __amp_liff_auth_sent?: boolean
        }

        if (global_gate.__amp_liff_auth_sent) {
          set_is_loading(false)

          return
        }

        global_gate.__amp_liff_auth_sent = true

        await emit_liff_debug('liff_auth_api_started', {
          ...base_payload,
          line_user_id: profile.userId,
          has_id_token: Boolean(id_token),
        })

        let response: Response

        try {
          const primary_payload = build_auth_request_payload({
            line_user_id: profile.userId,
            display_name: profile.displayName ?? null,
            picture_url: profile.pictureUrl ?? null,
            id_token,
          })

          response = await post_liff_session(primary_payload)

          if (
            !response.ok &&
            id_token &&
            (response.status === 401 || response.status === 400)
          ) {
            await emit_liff_debug('liff_auth_api_retry_without_id_token', {
              ...auth_context,
              line_user_id: profile.userId,
              status: response.status,
            })

            response = await post_liff_session(
              build_auth_request_payload({
                line_user_id: profile.userId,
                display_name: profile.displayName ?? null,
                picture_url: profile.pictureUrl ?? null,
              }),
            )
          }
        } catch (error) {
          await emit_liff_debug('liff_auth_api_failed', {
            ...base_payload,
            line_user_id: profile.userId,
            error: serialize_error(error),
          })

          await emit_liff_auth_failed({
            ...auth_context,
            error_code: 'liff_auth_api_network_failed',
            error_message:
              error instanceof Error ? error.message : 'Network error',
            reason: 'liff_auth_api_network_failed',
            error: serialize_error(error),
          })

          set_liff_error('LIFF auth failed')
          set_is_loading(false)

          return
        }

        await finish_auth_response(response, auth_context)
      } catch (error) {
        console.error('[liff] bootstrap failed', error)
        await emit_liff_debug('liff_bootstrap_failed', {
          ...base_payload,
          error: serialize_error(error),
        })
        await emit_liff_auth_failed({
          ...auth_context,
          liff_initialized: liff_init_completed_ok,
          is_in_client: liff_handle?.isInClient() ?? auth_context.is_in_client,
          is_logged_in: liff_handle?.isLoggedIn() ?? auth_context.is_logged_in,
          error_code: 'liff_bootstrap_failed',
          error_message:
            error instanceof Error ? error.message : 'LIFF bootstrap failed',
          reason: 'liff_bootstrap_failed',
          error: serialize_error(error),
        })
        set_liff_error('LIFF auth failed')
        set_is_loading(false)
      }
    }

    void run().catch((error) => {
      console.error('[liff] bootstrap run rejected', error)
      void emit_liff_debug('liff_bootstrap_failed', {
        ...base_payload,
        error: serialize_error(error),
      })
      set_is_loading(false)
    })
  }, [])

  return (
    <>
      {is_loading ? (
        <Loading full_screen text="LOADING..." />
      ) : null}
      {liff_error ? (
        <div
          className="fixed bottom-4 left-1/2 z-[10000] max-w-[90vw] -translate-x-1/2 rounded-md bg-red-900/90 px-3 py-2 text-center text-[11px] text-white shadow-lg"
          role="alert"
        >
          {liff_error}
        </div>
      ) : null}
    </>
  )
}
