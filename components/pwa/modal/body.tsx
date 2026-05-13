'use client'

import { X } from 'lucide-react'

import type { pwa_install_modal_panel_copy } from '@/lib/pwa/copy'

import Pwa_install_app_icon from '@/components/pwa/install_app_icon'

export type pwa_install_modal_view_props = pwa_install_modal_panel_copy & {
  show_installed_badge: boolean
  on_close: () => void
  on_primary_press?: () => void
  primary_busy?: boolean
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
                  PWA
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label="close"
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
