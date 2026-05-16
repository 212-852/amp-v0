'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import {
  call_enter_support_room,
  call_leave_support_room,
  support_room_api_action_to_realtime,
} from '@/lib/chat/realtime/support_room_client'

import type { admin_support_session_ref_value } from './admin_support_presence'

const component_file = 'components/admin/reception/use_support_lifecycle.ts'
const support_lifecycle_owner = component_file

type global_lifecycle_owner = {
  key: string
  owner: string
  room_uuid: string
  admin_participant_uuid: string
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
  const support_session_ref = useRef<admin_support_session_ref_value | null>(null)
  const enter_session_ref = useRef<string | null>(null)
  const has_entered_support_ref = useRef(false)
  const owner_registered_ref = useRef(false)
  const [owner_registered, set_owner_registered] = useState(false)
  const lifecycle_mounted_room_ref = useRef<string | null>(null)
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
      send_admin_chat_debug({
        event: 'support_lifecycle_duplicate_owner_skipped',
        room_uuid: input.room_uuid,
        active_room_uuid: input.room_uuid,
        admin_user_uuid: input.admin_user_uuid.trim() || null,
        admin_participant_uuid: admin_participant_uuid || null,
        component_file,
        support_lifecycle_owner,
        ignored_reason: 'support_lifecycle_owner_already_registered',
        pathname,
        phase: 'support_lifecycle_owner',
      })

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

    send_admin_chat_debug({
      event: 'support_lifecycle_owner_registered',
      room_uuid: input.room_uuid,
      active_room_uuid: input.room_uuid,
      admin_user_uuid: input.admin_user_uuid.trim() || null,
      admin_participant_uuid: admin_participant_uuid || null,
      component_file,
      support_lifecycle_owner,
      pathname,
      phase: 'support_lifecycle_owner',
    })

    return () => {
      if (root.__admin_support_lifecycle_owner?.key === owner_key) {
        delete root.__admin_support_lifecycle_owner
      }
      owner_registered_ref.current = false
      set_owner_registered(false)
    }
  }, [
    input.admin_participant_uuid,
    input.admin_user_uuid,
    input.room_uuid,
    pathname,
  ])

  const run_enter_support_room = useCallback(async (trigger_source: string) => {
    const room_uuid = latest_room_uuid_ref.current
    const admin_user_uuid = admin_user_uuid_ref.current.trim()
    const admin_participant_uuid = admin_participant_uuid_ref.current.trim()
    const timestamp = new Date().toISOString()
    const stack_hint =
      typeof Error === 'function'
        ? new Error('support_started_trigger_detected').stack
            ?.split('\n')
            .slice(1, 5)
            .join(' | ') ?? null
        : null

    send_admin_chat_debug({
      event: 'support_started_trigger_detected',
      room_uuid,
      active_room_uuid: room_uuid,
      admin_user_uuid: admin_user_uuid || null,
      admin_participant_uuid: admin_participant_uuid || null,
      component_file,
      support_lifecycle_owner,
      trigger_source,
      stack_hint,
      timestamp,
      pathname,
      phase: 'support_enter',
    })

    if (!owner_registered_ref.current) {
      send_admin_chat_debug({
        event: 'support_lifecycle_duplicate_owner_skipped',
        room_uuid,
        active_room_uuid: room_uuid,
        admin_user_uuid: admin_user_uuid || null,
        admin_participant_uuid: admin_participant_uuid || null,
        component_file,
        support_lifecycle_owner,
        ignored_reason: 'support_lifecycle_owner_not_registered',
        pathname,
        phase: 'support_enter',
      })

      return
    }

    if (!room_uuid || !admin_user_uuid || !admin_participant_uuid) {
      send_admin_chat_debug({
        event: 'enter_support_room_skipped_missing_admin_identity',
        room_uuid,
        active_room_uuid: room_uuid,
        admin_user_uuid: admin_user_uuid || null,
        admin_participant_uuid: admin_participant_uuid || null,
        admin_user_uuid_exists: admin_user_uuid.length > 0,
        admin_participant_uuid_exists: admin_participant_uuid.length > 0,
        component_file,
        support_lifecycle_owner,
        ignored_reason: !admin_user_uuid
          ? 'missing_admin_user_uuid'
          : 'missing_admin_participant_uuid',
        pathname,
        phase: 'support_enter',
        level: 'warn',
      })

      return
    }

    const enter_key = `${room_uuid}|${admin_participant_uuid}`

    if (
      has_entered_support_ref.current ||
      enter_session_ref.current === enter_key
    ) {
      send_admin_chat_debug({
        event: 'support_started_duplicate_skipped',
        room_uuid,
        active_room_uuid: room_uuid,
        admin_user_uuid,
        admin_participant_uuid,
        component_file,
        support_lifecycle_owner,
        trigger_source,
        stack_hint,
        timestamp,
        skipped_reason: 'already_entered_in_client_ref',
        ignored_reason: 'already_entered_in_client_ref',
        pathname,
        phase: 'support_enter',
      })

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
      stack_hint,
      timestamp,
      pathname,
      phase: 'support_enter',
    })

    send_admin_chat_debug({
      event: 'admin_support_enter_call_started',
      room_uuid,
      active_room_uuid: room_uuid,
      admin_user_uuid,
      admin_participant_uuid,
      component_file,
      support_lifecycle_owner,
      trigger_source,
      stack_hint,
      timestamp,
      pathname,
      phase: 'support_enter',
    })

    try {
      const result = await call_enter_support_room({
        room_uuid,
        admin_user_uuid,
        admin_participant_uuid,
        trigger_source,
      })

      if (!result.ok) {
        send_admin_chat_debug({
          event: 'admin_support_enter_call_failed',
          room_uuid,
          active_room_uuid: room_uuid,
          admin_user_uuid,
          admin_participant_uuid,
          component_file,
          support_lifecycle_owner,
          trigger_source,
          stack_hint,
          timestamp,
          pathname,
          error_code: result.error,
          error_message: result.error,
          phase: 'support_enter',
          level: 'error',
        })
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
          support_session_key: `${room_uuid}|${admin_participant_uuid}|${result.action.action_uuid}`,
          left_sent: false,
          existing_left_action_uuid: null,
        }
        on_support_action_ref.current(action)
      }

      send_admin_chat_debug({
        event: result.skipped
          ? 'support_started_duplicate_skipped'
          : 'admin_support_enter_call_succeeded',
        room_uuid,
        active_room_uuid: room_uuid,
        admin_user_uuid,
        admin_participant_uuid,
        action_uuid: result.action?.action_uuid ?? null,
        existing_action_uuid: result.skipped
          ? result.action?.action_uuid ?? null
          : null,
        existing_action_count: result.skipped ? 1 : 0,
        created_action_uuid: result.skipped
          ? null
          : result.action?.action_uuid ?? null,
        component_file,
        support_lifecycle_owner,
        trigger_source,
        stack_hint,
        timestamp,
        skipped_reason: result.skipped ? 'server_enter_skipped' : null,
        ignored_reason: result.skipped ? 'server_enter_skipped' : null,
        pathname,
        phase: 'support_enter',
      })
    } catch (error) {
      send_admin_chat_debug({
        event: 'admin_support_enter_call_failed',
        room_uuid,
        active_room_uuid: room_uuid,
        admin_user_uuid,
        admin_participant_uuid,
        component_file,
        support_lifecycle_owner,
        trigger_source,
        stack_hint,
        timestamp,
        pathname,
        error_code: 'enter_support_room_call_failed',
        error_message: error instanceof Error ? error.message : String(error),
        phase: 'support_enter',
        level: 'error',
      })
      has_entered_support_ref.current = false
      enter_session_ref.current = null
    }
  }, [pathname])

  const run_leave_support_room = useCallback(
    (leave_reason: string) => {
      const room_uuid = latest_room_uuid_ref.current
      const admin_participant_uuid = admin_participant_uuid_ref.current.trim()
      const current = support_session_ref.current

      if (current?.left_sent === true) {
        send_admin_chat_debug({
          event: 'support_left_duplicate_skipped',
          room_uuid,
          active_room_uuid: room_uuid,
          admin_participant_uuid,
          component_file,
          support_lifecycle_owner,
          leave_reason,
          support_session_key: current.support_session_key,
          existing_left_action_uuid: current.existing_left_action_uuid,
          ignored_reason: 'client_support_session_already_left',
          pathname,
          phase: 'support_leave',
        })

        return
      }

      if (
        !current ||
        current.room_uuid !== room_uuid ||
        current.admin_participant_uuid !== admin_participant_uuid
      ) {
        send_admin_chat_debug({
          event: 'support_left_duplicate_skipped',
          room_uuid,
          active_room_uuid: room_uuid,
          admin_participant_uuid,
          component_file,
          support_lifecycle_owner,
          leave_reason,
          support_session_key: current?.support_session_key ?? null,
          existing_left_action_uuid: current?.existing_left_action_uuid ?? null,
          ignored_reason: 'missing_current_support_session',
          pathname,
          phase: 'support_leave',
        })

        return
      }

      current.left_sent = true

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
          }
        })
        .catch(() => {})
    },
    [pathname],
  )

  useEffect(() => {
    void run_enter_support_room('room_mount')

    return () => {
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
