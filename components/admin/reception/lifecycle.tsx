'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import {
  call_enter_support_room,
  call_leave_support_room,
} from '@/lib/chat/realtime/support_room_client'

const component_file = 'components/admin/reception/lifecycle.tsx'

type support_session = {
  room_uuid: string
  admin_participant_uuid: string
  support_session_key: string
  left_sent: boolean
}

export type admin_reception_lifecycle_props = {
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string
}

export default function AdminReceptionLifecycle(
  props: admin_reception_lifecycle_props,
) {
  const mounted_room_ref = useRef<string | null>(null)
  const enter_sent_ref = useRef(false)
  const support_session_ref = useRef<support_session | null>(null)
  const props_ref = useRef(props)

  props_ref.current = props

  useLayoutEffect(() => {
    const room_uuid = props.room_uuid.trim()

    if (!room_uuid) {
      return
    }

    if (mounted_room_ref.current === room_uuid) {
      return
    }

    mounted_room_ref.current = room_uuid

    send_admin_chat_debug({
      event: 'support_lifecycle_mounted',
      room_uuid,
      active_room_uuid: room_uuid,
      admin_user_uuid: props.admin_user_uuid.trim() || null,
      admin_participant_uuid: props.admin_participant_uuid.trim() || null,
      component_file,
      pathname: `/admin/reception/${room_uuid}`,
      phase: 'admin_reception_lifecycle',
    })
  }, [props.admin_participant_uuid, props.admin_user_uuid, props.room_uuid])

  useEffect(() => {
    const room_uuid = props_ref.current.room_uuid.trim()
    const admin_user_uuid = props_ref.current.admin_user_uuid.trim()
    const admin_participant_uuid =
      props_ref.current.admin_participant_uuid.trim()

    const run_enter = async () => {
      if (
        enter_sent_ref.current ||
        !room_uuid ||
        !admin_user_uuid ||
        !admin_participant_uuid
      ) {
        return
      }

      enter_sent_ref.current = true

      send_admin_chat_debug({
        event: 'support_started_action_create_started',
        room_uuid,
        active_room_uuid: room_uuid,
        admin_user_uuid,
        admin_participant_uuid,
        component_file,
        pathname: `/admin/reception/${room_uuid}`,
        phase: 'support_enter',
      })

      const result = await call_enter_support_room({
        room_uuid,
        admin_user_uuid,
        admin_participant_uuid,
        trigger_source: 'admin_reception_lifecycle_mount',
      })

      if (!result.ok) {
        enter_sent_ref.current = false

        return
      }

      if (result.action) {
        support_session_ref.current = {
          room_uuid,
          admin_participant_uuid,
          support_session_key: `${room_uuid}|${admin_participant_uuid}|${result.action.action_uuid}`,
          left_sent: false,
        }
      }

      send_admin_chat_debug({
        event: result.skipped
          ? 'support_started_duplicate_skipped'
          : 'support_started_action_create_succeeded',
        room_uuid,
        active_room_uuid: room_uuid,
        admin_user_uuid,
        admin_participant_uuid,
        action_uuid: result.action?.action_uuid ?? null,
        component_file,
        pathname: `/admin/reception/${room_uuid}`,
        phase: 'support_enter',
      })
    }

    const run_leave = (leave_reason: string) => {
      const current = support_session_ref.current
      const admin_participant_uuid =
        props_ref.current.admin_participant_uuid.trim()
      const room_uuid = props_ref.current.room_uuid.trim()

      if (!current || current.left_sent || !enter_sent_ref.current) {
        return
      }

      if (
        current.room_uuid !== room_uuid ||
        current.admin_participant_uuid !== admin_participant_uuid
      ) {
        return
      }

      current.left_sent = true

      send_admin_chat_debug({
        event: 'support_left_action_create_started',
        room_uuid,
        active_room_uuid: room_uuid,
        admin_participant_uuid,
        component_file,
        leave_reason,
        pathname: `/admin/reception/${room_uuid}`,
        phase: 'support_leave',
      })

      void call_leave_support_room({
        room_uuid,
        participant_uuid: admin_participant_uuid,
        leave_reason,
        support_session_key: current.support_session_key,
        keepalive: true,
      }).then((result) => {
        if (!result.ok) {
          return
        }

        send_admin_chat_debug({
          event: result.skipped
            ? 'support_left_duplicate_skipped'
            : 'support_left_action_create_succeeded',
          room_uuid,
          active_room_uuid: room_uuid,
          admin_participant_uuid,
          action_uuid: result.action?.action_uuid ?? null,
          component_file,
          leave_reason,
          pathname: `/admin/reception/${room_uuid}`,
          phase: 'support_leave',
        })
      })
    }

    void run_enter()

    const on_page_hide = () => {
      run_leave('pagehide')
    }

    window.addEventListener('pagehide', on_page_hide)

    return () => {
      window.removeEventListener('pagehide', on_page_hide)
      run_leave('component_cleanup')
    }
  }, [props.admin_participant_uuid, props.admin_user_uuid, props.room_uuid])

  return null
}
