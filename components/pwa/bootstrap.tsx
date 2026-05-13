'use client'

import { useEffect } from 'react'

import {
  is_standalone_pwa,
  register_pwa_service_worker,
  set_pwa_source_channel_cookie,
} from '@/lib/pwa/client'

export default function PwaBootstrap() {
  useEffect(() => {
    if (is_standalone_pwa()) {
      set_pwa_source_channel_cookie()
    }

    void register_pwa_service_worker()
  }, [])

  return null
}
