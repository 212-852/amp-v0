'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  Link2,
  Mail,
  UserRound,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

import { is_line_in_app_browser } from '@/lib/auth/context'
import { pwa_line_link_purpose } from '@/lib/auth/pwa/link/rules'
import type { locale_key } from '@/lib/locale/action'
import {
  build_pwa_diagnostic_payload,
  is_standalone_pwa,
  post_pwa_debug,
} from '@/lib/pwa/client'
import {
  clear_pwa_line_link_error_flags,
  set_pwa_line_link_failed_flags,
} from '@/lib/pwa/line_link_storage'
import { pending_pwa_line_pass_storage_key } from '@/lib/pwa/link_return_client'
import {
  build_session_restore_headers,
  write_local_visitor_uuid,
} from '@/lib/visitor/client'

type connected_provider = 'line' | 'google' | 'email'

type connect_props = {
  locale: locale_key
  connected_providers: connected_provider[]
  on_close: () => void
}

const content = {
  title: {
    ja: 'アカウント連携',
    en: 'Account Connection',
    es: 'Conexion de Cuenta',
  },
  description: {
    ja: 'アカウント連携をすると、次回以降もスムーズにご利用いただけます。未連携のままでもご利用いただけますが、情報は保存されません。',
    en: 'Connect an account for a smoother experience next time. You can continue without linking, but your information will not be saved.',
    es: 'Conecta una cuenta para usar el servicio con mas facilidad la proxima vez. Puedes continuar sin conectar, pero tu informacion no se guardara.',
  },
  line: {
    ja: 'LINEと連携',
    en: 'Connect LINE',
    es: 'Conectar LINE',
  },
  recommended: {
    ja: 'おすすめ',
    en: 'Recommended',
    es: 'Recomendado',
  },
  google: {
    ja: 'Googleで連携',
    en: 'Connect Google',
    es: 'Conectar Google',
  },
  quick: {
    ja: 'すばやく利用',
    en: 'Quick start',
    es: 'Inicio rapido',
  },
  email: {
    ja: 'メールで連携',
    en: 'Connect Email',
    es: 'Conectar Email',
  },
  email_use: {
    ja: 'メールで利用',
    en: 'Use email',
    es: 'Usar email',
  },
  email_description: {
    ja: '入力したメールアドレス宛にログイン用リンクを送信します',
    en: 'We will send a login link to the email address you enter.',
    es: 'Enviaremos un enlace de acceso al correo electronico que ingreses.',
  },
  email_placeholder: {
    ja: 'メールアドレス',
    en: 'Email address',
    es: 'Correo electronico',
  },
  sending: {
    ja: '送信中',
    en: 'Sending',
    es: 'Enviando',
  },
  send_magic_link: {
    ja: 'マジックリンクを送信',
    en: 'Send magic link',
    es: 'Enviar enlace magico',
  },
  sent: {
    ja: 'メールを送信しました',
    en: 'Email sent',
    es: 'Correo enviado',
  },
  failed: {
    ja: '送信に失敗しました',
    en: 'Failed to send',
    es: 'No se pudo enviar',
  },
  benefits: {
    ja: '連携するとできること',
    en: 'What linking enables',
    es: 'Que permite la conexion',
  },
  connected: {
    ja: '連携済み',
    en: 'Connected',
    es: 'Conectado',
  },
  checking_line: {
    ja: 'LINE連携を確認しています',
    en: 'Checking LINE connection',
    es: 'Verificando conexion con LINE',
  },
  completed_line: {
    ja: '連携が完了しました。アプリを更新します',
    en: 'Connection completed. Refreshing the app.',
    es: 'Conexion completada. Actualizando la app.',
  },
  timeout_line: {
    ja: '時間切れです。もう一度「LINEと連携」からお試しください',
    en: 'Timed out. Try Connect LINE again.',
    es: 'Tiempo agotado. Prueba Conectar LINE de nuevo.',
  },
  line_link_failed_hint: {
    ja: '連携に失敗しました。もう一度「LINEと連携」からお試しください',
    en: 'Link failed. Try Connect LINE again.',
    es: 'Error al conectar. Prueba Conectar LINE de nuevo.',
  },
  manual_refresh: {
    ja: '更新する',
    en: 'Refresh',
    es: 'Actualizar',
  },
}

const provider_labels: Record<connected_provider, string> = {
  line: 'LINE',
  google: 'Google',
  email: 'Email',
}

export default function ConnectModal({
  locale,
  connected_providers,
  on_close,
}: connect_props) {
  const router = useRouter()
  const [view, set_view] = useState<'list' | 'email'>('list')
  const [email, set_email] = useState('')
  const [email_status, set_email_status] = useState<
    'idle' | 'sending' | 'sent' | 'failed'
  >('idle')
  const [line_status, set_line_status] = useState<
    'idle' | 'checking' | 'completed' | 'timeout' | 'failed'
  >('idle')
  const [line_poll_visitor_uuid, set_line_poll_visitor_uuid] = useState<
    string | null
  >(null)
  const poll_started_at_ref = useRef<number | null>(null)
  const poll_timer_ref = useRef<number | null>(null)
  const polling_ref = useRef(false)

  const is_email_loading = email_status === 'sending'
  const has_connected_provider = connected_providers.length > 0
  const is_line_polling = line_status === 'checking'
  const line_is_connected = connected_providers.includes('line')

  useEffect(() => {
    if (!line_is_connected) {
      return
    }

    clear_pwa_line_link_error_flags()
    set_line_status((previous) =>
      previous === 'failed' || previous === 'timeout' ? 'idle' : previous,
    )
  }, [line_is_connected])

  function clear_poll_timer() {
    if (poll_timer_ref.current !== null) {
      window.clearTimeout(poll_timer_ref.current)
      poll_timer_ref.current = null
    }
  }

  async function refresh_session_and_reload(visitor: string) {
    clear_pwa_line_link_error_flags()

    post_pwa_debug({
      event: 'pwa_session_refresh_started',
      phase: 'link_session_refresh',
      visitor_uuid: visitor,
      provider: 'line',
      status: 'completed',
      ...build_pwa_diagnostic_payload(),
    })

    try {
      const response = await fetch('/api/session', {
        method: 'GET',
        credentials: 'include',
        headers: build_session_restore_headers(),
      })

      const payload = (await response.json().catch(() => null)) as {
        visitor_uuid?: string | null
        user_uuid?: string | null
      } | null

      write_local_visitor_uuid(payload?.visitor_uuid ?? null)

      if (!response.ok) {
        throw new Error(`session_refresh_http_${response.status}`)
      }

      post_pwa_debug({
        event: 'pwa_session_refresh_succeeded',
        phase: 'link_session_refresh',
        visitor_uuid: visitor,
        user_uuid: payload?.user_uuid ?? null,
        provider: 'line',
        status: 'completed',
        ...build_pwa_diagnostic_payload(),
      })

      clear_pwa_line_link_error_flags()
      router.refresh()

      post_pwa_debug({
        event: 'pwa_reload_triggered',
        phase: 'link_session_reload',
        visitor_uuid: visitor,
        provider: 'line',
        status: 'completed',
        ...build_pwa_diagnostic_payload(),
      })

      window.location.reload()
    } catch (error) {
      set_pwa_line_link_failed_flags()
      set_line_status('failed')
      post_pwa_debug({
        event: 'pwa_session_refresh_failed',
        phase: 'link_session_refresh',
        visitor_uuid: visitor,
        provider: 'line',
        status: 'completed',
        error_code: 'session_refresh_failed',
        error_message: error instanceof Error ? error.message : String(error),
        ...build_pwa_diagnostic_payload(),
      })
    }
  }

  async function poll_link_status(visitor: string) {
    if (polling_ref.current) {
      return
    }

    polling_ref.current = true

    try {
      const started_at = poll_started_at_ref.current ?? Date.now()
      poll_started_at_ref.current = started_at

      if (Date.now() - started_at >= 60_000) {
        clear_poll_timer()
        set_pwa_line_link_failed_flags()
        set_line_status('timeout')
        post_pwa_debug({
          event: 'pwa_line_link_poll_failed',
          phase: 'link_session_poll',
          visitor_uuid: visitor,
          provider: 'line',
          reason: 'poll_timeout_60s',
          ...build_pwa_diagnostic_payload(),
        })

        return
      }

      const response = await fetch('/api/auth/pwa/link/status', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          visitor_uuid: visitor,
          purpose: pwa_line_link_purpose,
        }),
      })
      const payload = (await response.json().catch(() => null)) as {
        status?: string
        completed_user_uuid?: string | null
        return_path?: string | null
      } | null
      const status = payload?.status ?? 'failed'

      if (status === 'completed') {
        clear_poll_timer()
        clear_pwa_line_link_error_flags()
        set_line_status('completed')
        post_pwa_debug({
          event: 'pwa_line_link_poll_completed',
          phase: 'link_session_poll',
          visitor_uuid: visitor,
          completed_user_uuid: payload?.completed_user_uuid ?? null,
          provider: 'line',
          status,
          return_path: payload?.return_path ?? null,
          ...build_pwa_diagnostic_payload(),
        })
        await refresh_session_and_reload(visitor)

        return
      }

      if (
        status === 'expired' ||
        status === 'failed' ||
        status === 'closed' ||
        !response.ok
      ) {
        clear_poll_timer()
        set_pwa_line_link_failed_flags()
        set_line_status(status === 'expired' ? 'timeout' : 'failed')
        post_pwa_debug({
          event: 'pwa_line_link_poll_failed',
          phase: 'link_session_poll',
          visitor_uuid: visitor,
          provider: 'line',
          poll_status: status,
          error_message: response.ok ? null : `http_${response.status}`,
          ...build_pwa_diagnostic_payload(),
        })

        return
      }

      poll_timer_ref.current = window.setTimeout(() => {
        void poll_link_status(visitor)
      }, 2_000)
    } finally {
      polling_ref.current = false
    }
  }

  async function open_line_login() {
    post_pwa_debug({
      event: 'pwa_link_start_clicked',
      phase: 'connect_modal',
      provider: 'line',
      ...build_pwa_diagnostic_payload(),
    })

    if (connected_providers.includes('line')) {
      return
    }

    if (is_line_in_app_browser(navigator.userAgent) && !is_standalone_pwa()) {
      const liff_id = process.env.NEXT_PUBLIC_LIFF_ID?.trim()

      if (!liff_id) {
        return
      }

      window.location.href = `https://liff.line.me/${liff_id}`

      return
    }

    set_line_status('checking')
    clear_poll_timer()
    clear_pwa_line_link_error_flags()

    const standalone = is_standalone_pwa()
    const auth_window = standalone ? null : window.open('', '_blank')

    post_pwa_debug({
      event: 'pwa_link_start_request_started',
      phase: 'connect_modal',
      provider: 'line',
      ...build_pwa_diagnostic_payload(),
    })

    try {
      const session_response = await fetch('/api/session', {
        method: 'GET',
        credentials: 'include',
        headers: build_session_restore_headers(),
      })
      const session_payload = (await session_response
        .json()
        .catch(() => null)) as {
        visitor_uuid?: string | null
      } | null

      write_local_visitor_uuid(session_payload?.visitor_uuid ?? null)

      const response = await fetch('/api/auth/pwa/link/start', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...build_session_restore_headers(),
        },
        body: JSON.stringify({
          provider: 'line',
          source_channel: standalone ? 'pwa' : 'web',
          return_path: window.location.pathname,
          is_standalone: standalone,
        }),
      })
      const payload = (await response.json().catch(() => null)) as {
        auth_url?: string
        pass_uuid?: string
        visitor_uuid?: string | null
        error?: string
        error_code?: string
        error_message?: string
        cause?: Record<string, unknown> | null
      } | null

      if (!payload) {
        throw new Error('link_start_invalid_json')
      }

      if (!response.ok || !payload.auth_url || !payload.visitor_uuid) {
        const error_code =
          payload.error_code ?? `http_${response.status}`
        const error_message =
          payload.error_message ??
          (typeof payload.error === 'string' ? payload.error : null) ??
          'link_start_failed'

        post_pwa_debug({
          event: 'pwa_link_start_request_failed',
          phase: 'connect_modal',
          provider: 'line',
          error_code,
          error_message,
          reason: payload.cause ? JSON.stringify(payload.cause) : null,
          ...build_pwa_diagnostic_payload(),
        })

        post_pwa_debug({
          event: 'pwa_identity_link_failed',
          phase: 'connect_modal',
          provider: 'line',
          error_code,
          error_message,
          reason: payload.cause ? JSON.stringify(payload.cause) : null,
          ...build_pwa_diagnostic_payload(),
        })

        throw new Error(error_message)
      }

      post_pwa_debug({
        event: 'pwa_link_start_request_succeeded',
        phase: 'connect_modal',
        visitor_uuid: payload.visitor_uuid,
        pass_uuid: payload.pass_uuid ?? null,
        provider: 'line',
        status: 'open',
        ...build_pwa_diagnostic_payload(),
      })

      set_line_poll_visitor_uuid(payload.visitor_uuid)
      poll_started_at_ref.current = Date.now()

      post_pwa_debug({
        event: 'pwa_line_auth_opened',
        phase: 'line_auth_opened',
        visitor_uuid: payload.visitor_uuid,
        pass_uuid: payload.pass_uuid ?? null,
        provider: 'line',
        status: 'open',
        ...build_pwa_diagnostic_payload(),
      })

      if (standalone) {
        try {
          sessionStorage.setItem(
            pending_pwa_line_pass_storage_key,
            payload.visitor_uuid,
          )
        } catch (storage_error) {
          post_pwa_debug({
            event: 'pwa_line_auth_redirect_failed',
            phase: 'connect_modal',
            visitor_uuid: payload.visitor_uuid,
            pass_uuid: payload.pass_uuid ?? null,
            provider: 'line',
            error_code: 'pending_pass_storage_failed',
            error_message:
              storage_error instanceof Error
                ? storage_error.message
                : String(storage_error),
            ...build_pwa_diagnostic_payload(),
          })

          throw storage_error
        }

        post_pwa_debug({
          event: 'pwa_line_auth_redirect_started',
          phase: 'connect_modal',
          visitor_uuid: payload.visitor_uuid,
          pass_uuid: payload.pass_uuid ?? null,
          provider: 'line',
          status: 'open',
          ...build_pwa_diagnostic_payload(),
        })

        window.location.href = payload.auth_url

        return
      }

      post_pwa_debug({
        event: 'pwa_line_link_poll_started',
        phase: 'link_session_poll',
        visitor_uuid: payload.visitor_uuid,
        pass_uuid: payload.pass_uuid ?? null,
        provider: 'line',
        status: 'open',
        ...build_pwa_diagnostic_payload(),
      })

      if (auth_window) {
        auth_window.opener = null
        auth_window.location.href = payload.auth_url
      } else {
        post_pwa_debug({
          event: 'pwa_line_auth_redirect_started',
          phase: 'connect_modal',
          visitor_uuid: payload.visitor_uuid,
          pass_uuid: payload.pass_uuid ?? null,
          provider: 'line',
          status: 'open',
          ...build_pwa_diagnostic_payload(),
        })

        window.location.href = payload.auth_url
      }

      void poll_link_status(payload.visitor_uuid)
    } catch (error) {
      auth_window?.close()
      set_pwa_line_link_failed_flags()
      set_line_status('failed')

      post_pwa_debug({
        event: 'pwa_link_start_request_failed',
        phase: 'connect_modal',
        provider: 'line',
        error_code: 'link_start_failed',
        error_message: error instanceof Error ? error.message : String(error),
        ...build_pwa_diagnostic_payload(),
      })

      post_pwa_debug({
        event: 'pwa_identity_link_failed',
        phase: 'connect_modal',
        provider: 'line',
        error_code: 'link_start_failed',
        error_message: error instanceof Error ? error.message : String(error),
        ...build_pwa_diagnostic_payload(),
      })
    }
  }

  function open_google_login() {
    window.location.href = '/api/auth/google'
  }

  function open_email_view() {
    set_view('email')
  }

  function back_to_list_view() {
    set_view('list')
    set_email_status('idle')
  }

  async function send_email_login() {
    if (!email || is_email_loading) {
      return
    }

    set_email_status('sending')

    try {
      const response = await fetch('/api/auth/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      set_email_status(response.ok ? 'sent' : 'failed')
    } catch {
      set_email_status('failed')
    }
  }

  useEffect(() => {
    function handle_visibility_change() {
      if (
        document.visibilityState === 'visible' &&
        line_status === 'checking' &&
        line_poll_visitor_uuid
      ) {
        clear_poll_timer()
        void poll_link_status(line_poll_visitor_uuid)
      }
    }

    document.addEventListener('visibilitychange', handle_visibility_change)

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handle_visibility_change,
      )
      clear_poll_timer()
    }
  }, [line_status, line_poll_visitor_uuid])

  return (
    <div className="relative w-[92%] max-w-[420px] rounded-[34px] bg-[#fdfaf8] px-7 py-7 shadow-[0_12px_40px_rgba(42,29,24,0.08)]">
      {view === 'email' ? (
        <div className="animate-[modal_in_220ms_ease-out_both]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={back_to_list_view}
                aria-label="back"
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
              >
                <ArrowLeft className="h-[23px] w-[23px] stroke-[2.1] text-[#2a1d18]" />
              </button>

              <h2 className="text-[21px] font-semibold leading-[1.45] text-[#2a1d18]">
                {content.email[locale]}
              </h2>
            </div>

            <button
              type="button"
              onClick={on_close}
              aria-label="close"
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
            >
              <X className="h-[24px] w-[24px] stroke-[2.1] text-[#2a1d18]" />
            </button>
          </div>

          <p className="mt-4 text-[14px] font-normal leading-[1.75] text-[#6d5c52]">
            {content.email_description[locale]}
          </p>

          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault()
              send_email_login()
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(event) => {
                set_email(event.target.value)
                set_email_status('idle')
              }}
              placeholder={content.email_placeholder[locale]}
              autoComplete="email"
              className="h-[56px] w-full rounded-[22px] border border-[#ddd2c8] bg-white px-5 text-[15px] text-[#2a1d18] outline-none placeholder:text-[#9b8b82] focus:border-[#2a1d18]"
            />

            <button
              type="submit"
              disabled={is_email_loading}
              className="mt-4 flex h-[56px] w-full items-center justify-center rounded-[22px] bg-[#2a1d18] px-5 text-[14px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {is_email_loading
                ? content.sending[locale]
                : content.send_magic_link[locale]}
            </button>

            {email_status === 'sent' ? (
              <p className="mt-4 text-[12px] leading-[1.6] text-[#6d5c52]">
                {content.sent[locale]}
              </p>
            ) : null}

            {email_status === 'failed' ? (
              <p className="mt-4 text-[12px] leading-[1.6] text-[#b42318]">
                {content.failed[locale]}
              </p>
            ) : null}
          </form>
        </div>
      ) : line_status !== 'idle' ? (
        <div className="animate-[modal_in_220ms_ease-out_both]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-1">
              <h2 className="text-[21px] font-semibold leading-[1.45] text-[#2a1d18]">
                {line_status === 'completed'
                  ? content.completed_line[locale]
                  : line_status === 'timeout'
                    ? content.timeout_line[locale]
                    : line_status === 'failed'
                      ? content.line_link_failed_hint[locale]
                      : content.checking_line[locale]}
              </h2>
            </div>

            <button
              type="button"
              onClick={on_close}
              aria-label="close"
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
            >
              <X className="h-[24px] w-[24px] stroke-[2.1] text-[#2a1d18]" />
            </button>
          </div>

          {line_status === 'checking' ? (
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#e8dfd6]">
              <div className="h-full w-1/2 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-[#06c755]" />
            </div>
          ) : null}

          {line_status === 'timeout' || line_status === 'failed' ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 flex h-[54px] w-full items-center justify-center rounded-[22px] bg-[#2a1d18] px-5 text-[14px] font-semibold text-white transition-transform active:scale-[0.98]"
            >
              {content.manual_refresh[locale]}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="animate-[modal_in_220ms_ease-out_both]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-1">
              <h2 className="text-[21px] font-semibold tracking-[-0.01em] leading-[1.45] text-[#2a1d18]">
                {content.title[locale]}
              </h2>

              {!has_connected_provider ? (
                <p className="mt-4 text-[14px] font-normal leading-[1.75] text-[#6d5c52]">
                  {content.description[locale]}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={on_close}
              aria-label="close"
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
            >
              <X className="h-[24px] w-[24px] stroke-[2.1] text-[#2a1d18]" />
            </button>
          </div>

          {has_connected_provider ? (
            <div className="mt-5 border-t border-[#e8dfd6] pt-3.5">
              <p className="text-[14px] font-normal leading-[1.65] text-[#6d5c52]">
                {content.connected[locale]}
              </p>

              <ul className="mt-1.5 list-none space-y-0.5 p-0">
                {connected_providers.map((provider) => (
                  <li
                    key={provider}
                    className="text-[14px] font-normal leading-[1.65] text-[#2a1d18]"
                  >
                    {provider_labels[provider]}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="mt-6 space-y-3.5">
                <button
                  type="button"
                  onClick={open_line_login}
                  disabled={is_line_polling}
                  className="flex min-h-[80px] w-full items-center justify-between rounded-[28px] bg-[#06c755] px-5 py-3 text-white shadow-[0_4px_16px_rgba(6,199,85,0.14)] transition-transform active:scale-[0.97]"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-white/20">
                      <Link2 className="h-[22px] w-[22px] stroke-[2.2]" />
                    </div>

                    <span className="whitespace-nowrap text-[15px] font-semibold leading-[1.45]">
                      {content.line[locale]}
                    </span>
                  </div>

                  <span className="shrink-0 pl-2 text-[11px] font-medium tracking-wide opacity-95">
                    {content.recommended[locale]}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={open_google_login}
                  className="flex min-h-[80px] w-full items-center justify-between rounded-[28px] border border-[#ddd2c8] bg-white px-5 py-3 text-[#2a1d18] transition-transform active:scale-[0.97]"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-[#d8d0c8] bg-[#faf8f6]">
                      <UserRound className="h-[22px] w-[22px] stroke-[2.1] text-[#4f83ff]" />
                    </div>

                    <span className="whitespace-nowrap text-[15px] font-medium leading-[1.45]">
                      {content.google[locale]}
                    </span>
                  </div>

                  <span className="shrink-0 pl-2 text-[11px] font-medium leading-[1.4] text-[#6d5c52]">
                    {content.quick[locale]}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={open_email_view}
                  className="flex min-h-[80px] w-full items-center justify-between rounded-[28px] border border-[#e2d5ca] bg-[#fffaf6] px-5 py-3 text-[#2a1d18] transition-transform active:scale-[0.97]"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-[#efe4dc]">
                      <Mail className="h-[22px] w-[22px] stroke-[2.1]" />
                    </div>

                    <span className="whitespace-nowrap text-[15px] font-medium leading-[1.45]">
                      {content.email[locale]}
                    </span>
                  </div>

                  <span className="shrink-0 pl-2 text-[11px] font-medium leading-[1.4] text-[#6d5c52]">
                    {content.email_use[locale]}
                  </span>
                </button>
              </div>

              <button
                type="button"
                className="mt-6 flex min-h-[68px] w-full items-center justify-between rounded-[26px] border border-[#ddd2c8] bg-white px-5 py-3 text-[#2a1d18] transition-transform active:scale-[0.98]"
              >
                <span className="text-left text-[15px] font-medium leading-[1.5]">
                  {content.benefits[locale]}
                </span>

                <ChevronDown className="h-[22px] w-[22px] shrink-0 stroke-[2.1] text-[#6d5c52]" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
