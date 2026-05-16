'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'

const component_file = 'components/admin/reception/live.tsx'

export type admin_reception_live_props = {
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string
}

/** Stubs kept so room.tsx can compile while live is mounted from page.tsx only. */
export function register_admin_reception_live_support_action(
  _listener: unknown,
) {
  return () => {}
}

export function register_admin_reception_live_message(_listener: unknown) {
  return () => {}
}

export function register_admin_reception_live_action(_listener: unknown) {
  return () => {}
}

function emit_live_mounted_debug(props: admin_reception_live_props) {
  const room_uuid = props.room_uuid.trim()

  send_admin_chat_debug({
    event: 'admin_reception_live_mounted',
    room_uuid: room_uuid || null,
    active_room_uuid: room_uuid || null,
    admin_user_uuid: props.admin_user_uuid.trim() || null,
    admin_participant_uuid: props.admin_participant_uuid.trim() || null,
    component_file,
    pathname:
      typeof window !== 'undefined' && room_uuid
        ? `/admin/reception/${room_uuid}`
        : null,
    phase: 'admin_reception_live',
  })
}

export default function AdminReceptionLive(props: admin_reception_live_props) {
  const mounted_key_ref = useRef<string | null>(null)
  const mount_key = [
    props.room_uuid.trim(),
    props.admin_user_uuid.trim(),
    props.admin_participant_uuid.trim(),
  ].join('|')

  useLayoutEffect(() => {
    if (mounted_key_ref.current === mount_key) {
      return
    }

    mounted_key_ref.current = mount_key
    emit_live_mounted_debug(props)
  }, [mount_key, props])

  useEffect(() => {
    emit_live_mounted_debug(props)
  }, [mount_key, props])

  return null
}
