'use client'

import type { pwa_install_menu_copy_variant } from '@/lib/pwa/install_menu_copy'
import { pwa_install_menu_row_copy } from '@/lib/pwa/install_menu_copy'

import Pwa_install_app_icon from './install_app_icon'

export type pwa_install_menu_tone = 'user' | 'admin'

export type pwa_install_menu_item_props = {
  tone: pwa_install_menu_tone
  installed: boolean
  copy_variant: pwa_install_menu_copy_variant
  interactive: boolean
  is_busy?: boolean
  on_press?: () => void
  class_name?: string
}

const tone_shell: Record<
  pwa_install_menu_tone,
  { interactive: string; static: string }
> = {
  user: {
    interactive:
      'mt-auto flex w-full items-start gap-3 rounded-2xl border border-[#eadfd7] bg-white px-4 py-3 text-left shadow-[0_2px_12px_rgba(42,29,24,0.08)] transition-colors hover:bg-[#fffdfb] active:scale-[0.99]',
    static:
      'mt-auto flex w-full items-start gap-3 rounded-2xl border border-[#eadfd7] bg-white px-4 py-3 text-left shadow-[0_2px_12px_rgba(42,29,24,0.08)]',
  },
  admin: {
    interactive:
      'flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-colors hover:bg-neutral-100',
    static:
      'flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left shadow-[0_1px_4px_rgba(0,0,0,0.06)]',
  },
}

export default function Pwa_install_menu_item(props: pwa_install_menu_item_props) {
  const busy = Boolean(props.is_busy)
  const installed = props.installed
  const variant = props.copy_variant
  const text = installed
    ? pwa_install_menu_row_copy.installed_label
    : pwa_install_menu_row_copy[variant].title
  const subtitle = installed ? null : pwa_install_menu_row_copy[variant].subtitle

  const shell =
    props.interactive && !installed
      ? tone_shell[props.tone].interactive
      : tone_shell[props.tone].static

  const disabled = installed || busy || !props.on_press
  const title_class =
    props.tone === 'user'
      ? installed
        ? 'text-[14px] font-semibold text-[#8a7568]'
        : 'text-[14px] font-semibold text-[#2a1d18]'
      : installed
        ? 'text-[13px] font-semibold text-neutral-400'
        : 'text-[13px] font-semibold text-black'

  const subtitle_class =
    props.tone === 'user'
      ? 'mt-0.5 text-[11px] font-medium leading-[1.5] text-[#8a7568]'
      : 'mt-0.5 text-[11px] font-medium leading-[1.5] text-neutral-600'

  const badge_class =
    props.tone === 'user'
      ? 'inline-flex shrink-0 items-center rounded-full border border-[#c8e6c9] bg-[#e8f5e9] px-2 py-0.5 text-[10px] font-semibold leading-none text-[#2e7d32]'
      : 'inline-flex shrink-0 items-center rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-neutral-600'

  const inner = (
    <>
      <Pwa_install_app_icon
        rounded_class={props.tone === 'admin' ? 'rounded-xl' : 'rounded-2xl'}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className={title_class}>{text}</div>
          {installed ? (
            <span className={badge_class} aria-hidden>
              PWA
            </span>
          ) : null}
        </div>
        {subtitle ? <p className={subtitle_class}>{subtitle}</p> : null}
      </div>
    </>
  )

  const merged = [shell, props.class_name].filter(Boolean).join(' ')

  if (props.interactive && !installed && props.on_press) {
    return (
      <button
        type="button"
        className={merged}
        disabled={busy}
        onClick={props.on_press}
      >
        {inner}
      </button>
    )
  }

  return (
    <div
      className={[merged, installed || !props.on_press ? '' : 'opacity-80']
        .filter(Boolean)
        .join(' ')}
      aria-disabled={disabled}
    >
      {inner}
    </div>
  )
}
