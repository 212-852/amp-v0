'use client'

const pwa_install_app_icon_base =
  'h-10 w-10 shrink-0 object-cover shadow-[0_2px_8px_rgba(0,0,0,0.1)]'

export type pwa_install_app_icon_props = {
  /** default rounded-2xl; admin menu uses rounded-xl */
  rounded_class?: string
  class_name?: string
}

export default function Pwa_install_app_icon(props: pwa_install_app_icon_props) {
  const rounded = props.rounded_class ?? 'rounded-2xl'

  return (
    <img
      src="/icon-192.png"
      srcSet="/icon-192.png 1x, /icon-512.png 2x"
      alt="PET TAXI"
      width={40}
      height={40}
      className={[pwa_install_app_icon_base, rounded, props.class_name]
        .filter(Boolean)
        .join(' ')}
      decoding="async"
    />
  )
}
