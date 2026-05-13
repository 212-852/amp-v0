'use client'

import { Copy, X } from 'lucide-react'

import type {
  pwa_install_modal_ios_assist_copy,
  pwa_install_modal_panel_copy,
} from '@/lib/pwa/copy'

import Pwa_install_app_icon from '@/components/pwa/install_app_icon'

export type pwa_install_modal_ios_assist_view_props = {
  strings: pwa_install_modal_ios_assist_copy
  current_url: string
  toast_visible: boolean
  on_copy: () => void
  on_open_safari: () => void
}

export type pwa_install_modal_view_props = pwa_install_modal_panel_copy & {
  show_installed_badge: boolean
  on_close: () => void
  on_primary_press?: () => void
  primary_busy?: boolean
  ios_install_assist?: pwa_install_modal_ios_assist_view_props | null
}

/**
 * Presentational shell: renders resolved modal copy only (no OS / prompt logic).
 */
export default function Pwa_install_modal_body_view(props: pwa_install_modal_view_props) {
  const has_primary =
    Boolean(props.primary_button_label) && typeof props.on_primary_press === 'function'

  return (
    <div className="relative w-[92%] max-w-[360px] rounded-[26px] bg-white px-6 py-6 shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Pwa_install_app_icon />
          <div className="min-w-0 pr-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-semibold leading-snug text-neutral-900">
                {props.title}
              </h2>
              {props.show_installed_badge ? (
                <span
                  className="inline-flex shrink-0 items-center rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-neutral-600"
                  aria-hidden
                >
                  {props.installed_badge_label}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label={props.close_aria_label}
          onClick={props.on_close}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
        >
          <X className="h-[22px] w-[22px] stroke-[2.1] text-neutral-700" />
        </button>
      </div>

      <p className="mt-3 text-left text-[14px] leading-[1.65] text-neutral-600">
        {props.body}
      </p>

      {props.steps && props.steps.length > 0 ? (
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-left text-[13px] font-medium leading-[1.55] text-neutral-700">
          {props.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}

      {props.ios_install_assist ? (
        <>
          <div className="mt-4 flex flex-col gap-2.5">
            <div className="flex gap-2 rounded-xl border border-neutral-900/10 bg-neutral-900/[0.06] p-2">
              <input
                readOnly
                value={props.ios_install_assist.current_url}
                aria-label={props.ios_install_assist.strings.url_field_aria_label}
                className="min-w-0 flex-1 rounded-lg border border-neutral-200/90 bg-white/95 px-2.5 py-2 text-[11px] font-mono leading-snug text-neutral-900 outline-none ring-0"
              />
              <button
                type="button"
                aria-label={props.ios_install_assist.strings.copy_button_aria_label}
                onClick={props.ios_install_assist.on_copy}
                className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-neutral-800 shadow-sm active:scale-[0.98]"
              >
                <Copy className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
                <span className="max-w-[4.5rem] truncate">
                  {props.ios_install_assist.strings.copy_button_label}
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={props.ios_install_assist.on_open_safari}
              className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm active:scale-[0.99]"
            >
              {props.ios_install_assist.strings.safari_open_label}
            </button>
          </div>
          {props.ios_install_assist.toast_visible ? (
            <div
              className="pointer-events-none absolute bottom-[5.5rem] left-1/2 z-20 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg bg-neutral-900/92 px-4 py-2 text-center text-[12px] font-medium leading-snug text-white shadow-lg"
              role="status"
              aria-live="polite"
            >
              {props.ios_install_assist.strings.toast_copied_label}
            </div>
          ) : null}
        </>
      ) : null}

      {props.android_chrome_install_hint ? (
        <p className="mt-4 text-left text-[13px] font-medium leading-[1.55] text-neutral-700">
          {props.android_chrome_install_hint}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        {has_primary ? (
          <button
            type="button"
            disabled={props.primary_busy}
            onClick={props.on_primary_press}
            className="w-full rounded-full bg-neutral-900 px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {props.primary_button_label}
          </button>
        ) : null}

        {has_primary ? (
          <button
            type="button"
            onClick={props.on_close}
            className="text-center text-[12px] font-medium text-neutral-500"
          >
            {props.close_label}
          </button>
        ) : (
          <button
            type="button"
            onClick={props.on_close}
            className="w-full rounded-full bg-neutral-900 px-5 py-3 text-[14px] font-semibold text-white"
          >
            {props.close_label}
          </button>
        )}
      </div>
    </div>
  )
}
