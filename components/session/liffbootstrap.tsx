'use client'

import type { Liff } from '@line/liff'
import { useEffect, useState } from 'react'

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

function should_run_liff_bootstrap(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const ua = navigator.userAgent.toLowerCase()

  return ua.includes('line/') || window.location.href.includes('liff.line.me')
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
  const [is_loading, set_is_loading] = useState(false)
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
    const is_line_browser = user_agent.toLowerCase().includes('line/')
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

    async function post_liff_session(payload: Record<string, unknown>) {
      return fetch('/api/auth/line/liff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
    }

    async function finish_auth_response(response: Response) {
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
        await emit_liff_debug('liff_auth_api_failed', {
          ...base_payload,
          status: response.status,
          result,
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
      } else {
        await emit_liff_debug('liff_auth_api_failed', {
          ...base_payload,
          status: response.status,
          result,
          reason: 'unexpected_result',
        })
      }

      set_is_loading(false)
    }

    async function run() {
      let liff_init_completed_ok = false

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
          const init_payload = {
            ...base_payload,
            liff_id,
          }
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
          set_liff_error(
            error instanceof Error ? error.message : 'LIFF init failed',
          )
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
        await emit_liff_debug('liff_login_state_checked', {
          ...base_payload,
          is_in_client,
          is_logged_in,
        })

        if (!is_in_client && !is_logged_in) {
          console.log('[liff] login started', base_payload)
          await emit_liff_debug('liff_login_started', {
            ...base_payload,
            is_in_client,
            is_logged_in,
          })
          liff.login()

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

          throw error
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
          const payload: Record<string, unknown> = {
            line_user_id: profile.userId,
            display_name: profile.displayName ?? null,
            picture_url: profile.pictureUrl ?? null,
            source_channel: 'liff',
          }

          if (id_token) {
            payload.id_token = id_token
          }

          response = await post_liff_session(payload)
        } catch (error) {
          await emit_liff_debug('liff_auth_api_failed', {
            ...base_payload,
            line_user_id: profile.userId,
            error: serialize_error(error),
          })

          throw error
        }

        await finish_auth_response(response)
      } catch (error) {
        console.error('[liff] bootstrap failed', error)
        await emit_liff_debug('liff_bootstrap_failed', {
          ...base_payload,
          error: serialize_error(error),
        })
        set_liff_error(
          error instanceof Error ? error.message : 'LIFF bootstrap failed',
        )
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
