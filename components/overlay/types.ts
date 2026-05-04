import type { ReactNode } from 'react'

export type overlay_variant =
  | 'center'
  | 'bottom'
  | 'left'
  | 'right'

export type overlay_motion =
  | 'center'
  | 'bottom'
  | 'left'

export type overlay_props = {
  open: boolean
  on_close: () => void
  variant?: overlay_variant
  motion?: overlay_motion
  panel_class_name?: string
  children: ReactNode
}
