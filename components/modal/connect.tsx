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

type connect_props = {
  on_close: () => void
}

export default function ConnectModal(
  props: connect_props,
) {
  const [view, set_view] = useState<'list' | 'email'>('list')
  const [email, set_email] = useState('')
  const [email_status, set_email_status] = useState<
    'idle' | 'sending' | 'sent' | 'failed'
  >('idle')
  const is_email_loading = email_status === 'sending'

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
        body: JSON.stringify({
          email,
        }),
      })

      set_email_status(response.ok ? 'sent' : 'failed')
    } catch {
      set_email_status('failed')
    }
  }

  return (
    <div
      className="
        relative
        w-[92%] max-w-[420px]
        rounded-[34px]
        bg-[#fdfaf8]
        px-7 py-7
        shadow-[0_12px_40px_rgba(42,29,24,0.08)]
      "
    >
      {view === 'email' ? (
        <div className="animate-[modal_in_220ms_ease-out_both]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={back_to_list_view}
                aria-label="back"
                className="
                  flex h-[38px] w-[38px]
                  shrink-0
                  items-center justify-center
                  rounded-full
                  transition-transform
                  active:scale-[0.94]
                "
              >
                <ArrowLeft className="h-[23px] w-[23px] stroke-[2.1] text-[#2a1d18]" />
              </button>

              <h2 className="text-[21px] font-semibold leading-[1.45] text-[#2a1d18]">
                メールで連携
              </h2>
            </div>

            <button
              type="button"
              onClick={props.on_close}
              aria-label="close"
              className="
                flex h-[38px] w-[38px]
                shrink-0
                items-center justify-center
                rounded-full
                transition-transform
                active:scale-[0.94]
              "
            >
              <X className="h-[24px] w-[24px] stroke-[2.1] text-[#2a1d18]" />
            </button>
          </div>

          <p className="mt-4 text-[14px] font-normal leading-[1.75] text-[#6d5c52]">
            入力したメールアドレス宛にログイン用リンクを送信します
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
              placeholder="メールアドレス"
              autoComplete="email"
              className="
                h-[56px] w-full
                rounded-[22px]
                border border-[#ddd2c8]
                bg-white
                px-5
                text-[15px]
                text-[#2a1d18]
                outline-none
                placeholder:text-[#9b8b82]
                focus:border-[#2a1d18]
              "
            />

            <button
              type="submit"
              disabled={is_email_loading}
              className="
                mt-4
                flex h-[56px] w-full
                items-center justify-center
                rounded-[22px]
                bg-[#2a1d18]
                px-5
                text-[14px] font-semibold
                text-white
                transition-transform
                active:scale-[0.98]
                disabled:opacity-60
              "
            >
              {is_email_loading ? '送信中' : 'マジックリンクを送信'}
            </button>

            {email_status === 'sent' ? (
              <p className="mt-4 text-[12px] leading-[1.6] text-[#6d5c52]">
                メールを送信しました
              </p>
            ) : null}

            {email_status === 'failed' ? (
              <p className="mt-4 text-[12px] leading-[1.6] text-[#b42318]">
                送信に失敗しました
              </p>
            ) : null}
          </form>
        </div>
      ) : (
        <div className="animate-[modal_in_220ms_ease-out_both]">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pr-1">
          <h2 className="text-[21px] font-semibold tracking-[-0.01em] leading-[1.45] text-[#2a1d18]">
            アカウント連携
          </h2>

          <p className="mt-4 text-[14px] font-normal leading-[1.75] text-[#6d5c52]">
            アカウント連携をすると、次回以降も
            スムーズにご利用いただけます。
            <br />
            未連携のままでもご利用いただけますが、
            情報は保存されません。
          </p>
        </div>

        <button
          type="button"
          onClick={props.on_close}
          aria-label="close"
          className="
            flex h-[38px] w-[38px]
            shrink-0
            items-center justify-center
            rounded-full
            transition-transform
            active:scale-[0.94]
          "
        >
          <X className="h-[24px] w-[24px] stroke-[2.1] text-[#2a1d18]" />
        </button>
      </div>

      {/* buttons */}
      <div className="mt-6 space-y-3.5">
        {/* line */}
        <button
          type="button"
          onClick={open_line_login}
          className="
            flex min-h-[80px] w-full
            items-center justify-between
            rounded-[28px]
            bg-[#06c755]
            px-5
            py-3
            text-white
            shadow-[0_4px_16px_rgba(6,199,85,0.14)]
            transition-transform
            active:scale-[0.97]
          "
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <div
              className="
                flex h-[44px] w-[44px]
                shrink-0
                items-center justify-center
                rounded-full
                bg-white/20
              "
            >
              <Link2 className="h-[22px] w-[22px] stroke-[2.2]" />
            </div>

            <span className="whitespace-nowrap text-[15px] font-semibold leading-[1.45]">
              LINEと連携
            </span>
          </div>

          <span className="shrink-0 pl-2 text-[11px] font-medium tracking-wide opacity-95">
            おすすめ
          </span>
        </button>

        {/* google */}
        <button
          type="button"
          onClick={open_google_login}
          className="
            flex min-h-[80px] w-full
            items-center justify-between
            rounded-[28px]
            border border-[#ddd2c8]
            bg-white
            px-5
            py-3
            text-[#2a1d18]
            transition-transform
            active:scale-[0.97]
          "
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <div
              className="
                flex h-[44px] w-[44px]
                shrink-0
                items-center justify-center
                rounded-full
                border border-[#d8d0c8]
                bg-[#faf8f6]
              "
            >
              <UserRound className="h-[22px] w-[22px] stroke-[2.1] text-[#4f83ff]" />
            </div>

            <span className="whitespace-nowrap text-[15px] font-medium leading-[1.45]">
              Googleで連携
            </span>
          </div>

          <span className="shrink-0 pl-2 text-[11px] font-medium leading-[1.4] text-[#6d5c52]">
            すばやく利用
          </span>
        </button>

        {/* email */}
        <button
          type="button"
          onClick={open_email_view}
          className="
            flex min-h-[80px] w-full
            items-center justify-between
            rounded-[28px]
            border border-[#e2d5ca]
            bg-[#fffaf6]
            px-5
            py-3
            text-[#2a1d18]
            transition-transform
            active:scale-[0.97]
          "
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <div
              className="
                flex h-[44px] w-[44px]
                shrink-0
                items-center justify-center
                rounded-full
                bg-[#efe4dc]
              "
            >
              <Mail className="h-[22px] w-[22px] stroke-[2.1]" />
            </div>

            <span className="whitespace-nowrap text-[15px] font-medium leading-[1.45]">
              メールで連携
            </span>
          </div>

          <span className="shrink-0 pl-2 text-[11px] font-medium leading-[1.4] text-[#6d5c52]">
            メールで利用
          </span>
        </button>
      </div>

      {/* accordion */}
      <button
        type="button"
        className="
          mt-6
          flex min-h-[68px] w-full
          items-center justify-between
          rounded-[26px]
          border border-[#ddd2c8]
          bg-white
          px-5
          py-3
          text-[#2a1d18]
          transition-transform
          active:scale-[0.98]
        "
      >
        <span className="text-left text-[15px] font-medium leading-[1.5]">
          連携するとできること
        </span>

        <ChevronDown className="h-[22px] w-[22px] shrink-0 stroke-[2.1] text-[#6d5c52]" />
      </button>
        </div>
      )}
    </div>
  )
}
