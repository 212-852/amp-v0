'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  Link2,
  Mail,
  UserRound,
  X,
} from 'lucide-react'

import type { locale_key } from '@/lib/locale/action'

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
  const [view, set_view] = useState<'list' | 'email'>('list')
  const [email, set_email] = useState('')
  const [email_status, set_email_status] = useState<
    'idle' | 'sending' | 'sent' | 'failed'
  >('idle')

  const is_email_loading = email_status === 'sending'
  const has_connected_provider = connected_providers.length > 0

  function open_line_login() {
    window.location.href = '/api/auth/line'
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