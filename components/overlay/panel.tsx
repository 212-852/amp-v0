'use client'

import type { ReactNode } from 'react'
import type { overlay_variant } from './types'

type panel_props = {
  variant?: overlay_variant
  children: ReactNode
}

const variant_class: Record<overlay_variant, string> = {
  center:
    'items-center justify-center',

  bottom:
    'items-end justify-center',

  left:
    'items-center justify-start',

  right:
    'items-center justify-end',
}

const content_class: Record<overlay_variant, string> = {
  center:
    'justify-center',

  bottom:
    'justify-center',

  left:
    'justify-start',

  right:
    'justify-end',
}

const content_animate: Record<
  Exclude<overlay_variant, 'center'>,
  string
> = {
  bottom:
    'animate-[modal_in_0.3s_cubic-bezier(0.22,1,0.36,1)_both]',

  left:
    'animate-[modal_in_0.3s_cubic-bezier(0.22,1,0.36,1)_both]',

  right:
    'animate-[modal_in_0.3s_cubic-bezier(0.22,1,0.36,1)_both]',
}

export default function OverlayPanel(props: panel_props) {
  const variant = props.variant ?? 'center'
  const is_center = variant === 'center'

  if (is_center) {
    return (
      <div
        className="
          fixed inset-0 z-[10000]
          flex items-center justify-center
          pointer-events-none
        "
      >
        <div
          className="
            center_modal_pop_in
            flex w-full justify-center
            pointer-events-auto
          "
        >
          {props.children}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`
        fixed inset-0 z-[10000]
        flex
        pointer-events-none
        ${variant_class[variant]}
      `}
    >
      <div
        className={`
          flex w-full
          pointer-events-auto
          ${content_animate[variant]}
          ${content_class[variant]}
        `}
      >
        {props.children}
      </div>
    </div>
  )
}
