'use client'

import { useEffect } from 'react'

/**
 * Temporary render probe: open DevTools console and search for
 * ADMIN_REAL_COMPONENT_RENDERED to see which admin subtree mounted.
 */
export function AdminRenderProbe({ file_path }: { file_path: string }) {
  useEffect(() => {
    console.log('ADMIN_REAL_COMPONENT_RENDERED', file_path)
  }, [file_path])

  return (
    <span data-debug-component={file_path} hidden aria-hidden />
  )
}
