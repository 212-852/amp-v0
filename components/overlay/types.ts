export type overlay_variant =
  | 'center'
  | 'bottom'
  | 'left'
  | 'right'

export type overlay_props = {
  open: boolean
  on_close: () => void
  variant?: overlay_variant
  children: React.ReactNode
}