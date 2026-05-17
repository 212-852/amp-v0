'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import {
  call_enter_support_room,
  call_leave_support_room,
  support_room_api_action_to_realtime,
} from '@/lib/chat/realtime/support_room_client'
import { get_or_create_admin_support_client_session_id } from '@/lib/support/lifecycle/client_session'

const component_file = 'lib/support/lifecycle/client.ts'
const support_lifecycle_owner = component_file

type global_lifecycle_owner = {
  key: string
  owner: string
  room_uuid: string
  admin_participant_uuid: string
}

type support_session_ref_value = {
  room_uuid: string
  admin_participant_uuid: string
  enter_action_uuid: string
  support_session_key: string
  left_sent: boolean
  existing_left_action_uuid: string | null
}

function current_owner_global(): typeof globalThis & {
  __admin_support_lifecycle_owner?: global_lifecycle_owner
} {
  return globalThis as typeof globalThis & {
    __admin_support_lifecycle_owner?: global_lifecycle_owner
  }
}

export type use_support_lifecycle_input = {
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string
  on_support_action: (action: chat_action_realtime_payload) => void
}

export function use_support_lifecycle(input: use_support_lifecycle_input) {
  const pathname = `/admin/reception/${input.room_uuid}`
  const support_session_ref = useRef<support_session_ref_value | null>(null)
  const enter_session_ref = useRef<string | null>(null)
  const has_entered_support_ref = useRef(false)
  const owner_registered_ref = useRef(false)
  const [owner_registered, set_owner_registered] = useState(false)
  const lifecycle_mounted_room_ref = useRef<string | null>(null)
  const client_session_id_ref = useRef<string | null>(null)
  const latest_room_uuid_ref = useRef(input.room_uuid)
  const admin_user_uuid_ref = useRef(input.admin_user_uuid)
  const admin_participant_uuid_ref = useRef(input.admin_participant_uuid)
  const on_support_action_ref = useRef(input.on_support_action)

  useEffect(() => {
    on_support_action_ref.current = input.on_support_action
  }, [input.on_support_action])

  useEffect(() => {
    latest_room_uuid_ref.current = input.room_uuid
    admin_user_uuid_ref.current = input.admin_user_uuid
    admin_participant_uuid_ref.current = input.admin_participant_uuid
  }, [input.admin_participant_uuid, input.admin_user_uuid, input.room_uuid])

  useLayoutEffect(() => {
    const lifecycle_room = input.room_uuid.trim()

    if (!lifecycle_room || lifecycle_mounted_room_ref.current === lifecycle_room) {
      return
    }

    lifecycle_mounted_room_ref.current = lifecycle_room

    send_admin_chat_debug({
      event: 'support_lifecycle_mounted',
      room_uuid: lifecycle_room,
      active_room_uuid: lifecycle_room,
      admin_user_uuid: input.admin_user_uuid.trim() || null,
      admin_participant_uuid: input.admin_participant_uuid.trim() || null,
      component_file,
      support_lifecycle_owner,
      pathname: `/admin/reception/${lifecycle_room}`,
      phase: 'support_lifecycle',
    })
  }, [input.admin_participant_uuid, input.admin_user_uuid, input.room_uuid])

  useEffect(() => {
    const admin_participant_uuid = input.admin_participant_uuid.trim()
    const owner_key = `${support_lifecycle_owner}|${input.room_uuid}|${admin_participant_uuid}`
    const root = current_owner_global()
    const current = root.__admin_support_lifecycle_owner

    if (current && current.key !== owner_key) {
      return
    }

    root.__admin_support_lifecycle_owner = {
      key: owner_key,
      owner: support_lifecycle_owner,
      room_uuid: input.room_uuid,
      admin_participant_uuid,
    }
    owner_registered_ref.current = true
    set_owner_registered(true)

    return () => {
      if (root.__admin_support_lifecycle_owner?.key === owner_key) {
        delete root.__admin_support_lifecycle_owner
      }
      owner_registered_ref.current = false
      set_owner_registered(false)
    }
  }, [input.admin_participant_uuid, input.admin_user_uuid, input.room_uuid])

  const run_enter_support_room = useCallback(async (trigger_source: string) => {
    const room_uuid = latest_room_uuid_ref.current
    const admin_user_uuid = admin_user_uuid_ref.current.trim()
    const admin_participant_uuid = admin_participant_uuid_ref.current.trim()

    if (!owner_registered_ref.current) {
      return
    }

    if (!room_uuid || !admin_user_uuid || !admin_participant_uuid) {
      return
    }

    const enter_key = `${room_uuid}|${admin_participant_uuid}`

    if (
      has_entered_support_ref.current ||
      enter_session_ref.current === enter_key
    ) {
      return
    }

    has_entered_support_ref.current = true
    enter_session_ref.current = enter_key

    send_admin_chat_debug({
      event: 'support_started_action_create_started',
      room_uuid,
      active_room_uuid: room_uuid,
      admin_user_uuid,
      admin_participant_uuid,
      component_file,
      support_lifecycle_owner,
      trigger_source,
      pathname,
      phase: 'support_enter',
    })

    try {
      if (!client_session_id_ref.current) {
        client_session_id_ref.current =
          get_or_create_admin_support_client_session_id()
      }

      const client_session_id = client_session_id_ref.current
      const support_session_key = `${room_uuid}|${admin_participant_uuid}|${client_session_id}`

      const result = await call_enter_support_room({
        room_uuid,
        admin_user_uuid,
        admin_participant_uuid,
        client_session_id,
        trigger_source,
      })

      if (!result.ok) {
        has_entered_support_ref.current = false
        enter_session_ref.current = null
        return
      }

      if (result.action) {
        const action = support_room_api_action_to_realtime(result.action)
        support_session_ref.current = {
          room_uuid,
          admin_participant_uuid,
          enter_action_uuid: result.action.action_uuid,
          support_session_key,
          left_sent: false,
          existing_left_action_uuid: null,
        }
        on_support_action_ref.current(action)
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
        support_lifecycle_owner,
        trigger_source,
        pathname,
        phase: 'support_enter',
      })
    } catch {
      has_entered_support_ref.current = false
      enter_session_ref.current = null
    }
  }, [pathname])

  const run_leave_support_room = useCallback((leave_reason: string) => {
    const room_uuid = latest_room_uuid_ref.current
    const admin_participant_uuid = admin_participant_uuid_ref.current.trim()
    const current = support_session_ref.current

    if (current?.left_sent === true) {
      return
    }

    if (
      !current ||
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
      support_lifecycle_owner,
      leave_reason,
      pathname,
      phase: 'support_leave',
    })

    void call_leave_support_room({
      room_uuid,
      participant_uuid: admin_participant_uuid,
      leave_reason,
      support_session_key: current.support_session_key,
      keepalive: true,
    })
      .then((result) => {
        if (result.ok && result.action) {
          current.existing_left_action_uuid = result.action.action_uuid
          on_support_action_ref.current(
            support_room_api_action_to_realtime(result.action),
          )
          send_admin_chat_debug({
            event: result.skipped
              ? 'support_left_duplicate_skipped'
              : 'support_left_action_create_succeeded',
            room_uuid,
            active_room_uuid: room_uuid,
            admin_participant_uuid,
            action_uuid: result.action.action_uuid,
            component_file,
            support_lifecycle_owner,
            leave_reason,
            pathname,
            phase: 'support_leave',
          })
        }
      })
      .catch(() => {})
  }, [pathname])

  useEffect(() => {
    void run_enter_support_room('room_mount')

    const room_uuid = latest_room_uuid_ref.current
    const participant_uuid = admin_participant_uuid_ref.current.trim()

    const post_presence = (action: string) => {
      if (!room_uuid || !participant_uuid) {
        return
      }

      void fetch('/api/chat/presence', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          room_uuid,
          participant_uuid,
          action,
          last_channel: 'admin',
        }),
      }).catch(() => {})
    }

    const post_visible_heartbeat = () => {
      if (document.visibilityState === 'visible') {
        post_presence('admin_support_heartbeat')
      }
    }

    post_visible_heartbeat()

    const heartbeat = window.setInterval(() => {
      post_visible_heartbeat()
    }, 20_000)

    const on_visibility_change = () => {
      if (document.visibilityState === 'hidden') {
        post_presence('admin_support_idle')
        return
      }

      post_presence('admin_support_recovered')
      post_visible_heartbeat()
    }

    const on_page_hide = () => {
      post_presence('admin_support_idle')
      run_leave_support_room('pagehide')
    }

    document.addEventListener('visibilitychange', on_visibility_change)
    window.addEventListener('pagehide', on_page_hide)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', on_visibility_change)
      window.removeEventListener('pagehide', on_page_hide)
      run_leave_support_room('component_cleanup')
    }
  }, [run_enter_support_room, run_leave_support_room])

  return {
    support_session_ref,
    owner_registered,
    run_enter_support_room,
    run_leave_support_room,
  }
}
