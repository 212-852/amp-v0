'use client'

import type { ReactNode } from 'react'
import type {
  overlay_motion,
  overlay_variant,
} from './types'

type panel_props = {
  variant?: overlay_variant
  motion?: overlay_motion
  panel_class_name?: string
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

const motion_class: Record<overlay_motion, string> = {
  center: 'center_modal_pop_in',
  bottom: 'overlay_panel_from_bottom',
  left: 'overlay_panel_from_left',
}

export default function OverlayPanel(props: panel_props) {
  const variant = props.variant ?? 'center'
  const is_center = variant === 'center'
  const motion =
    props.motion ?? (
      variant === 'bottom' || variant === 'left'
        ? variant
        : 'center'
    )

  if (is_center) {
    return (
      <div
        className="
          fixed inset-0 z-0
          flex items-center justify-center
          pointer-events-none
        "
      >
        <div
          className={`
            flex w-full justify-center
            pointer-events-auto
            ${motion_class[motion]}
          `}
        >
          <div
            className={[
              'flex w-full justify-center',
              props.panel_class_name ?? '',
            ].join(' ')}
          >
            {props.children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`
        fixed inset-0 z-0
        flex
        pointer-events-none
        ${variant_class[variant]}
      `}
    >
      <div
        className={`
          flex w-full
          pointer-events-auto
          ${motion_class[motion]}
          ${content_class[variant]}
          ${props.panel_class_name ?? ''}
        `}
      >
        {props.children}
      </div>
    </div>
  )
}
