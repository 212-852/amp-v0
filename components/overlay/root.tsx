'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import OverlayPanel from './panel'
import type { overlay_props } from './types'

export default function OverlayRoot(props: overlay_props) {
  useEffect(() => {
    if (!props.open) {
      return
    }

    const original =
      document.body.style.overflow

    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow =
        original
    }
  }, [props.open])

  if (!props.open) {
    return null
  }

  const tree = (
    <div className="fixed inset-0 z-[9999]">
      <button
        type="button"
        aria-label="close"
        onClick={props.on_close}
        className="
          overlay_backdrop_in
          fixed inset-0
          bg-black/35
        "
      />

      <OverlayPanel variant={props.variant}>
        {props.children}
      </OverlayPanel>
    </div>
  )

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(tree, document.body)
}
