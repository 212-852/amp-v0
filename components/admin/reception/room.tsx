'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import AdminChat from '@/components/admin/chat'
import AdminHandoffMemo from '@/components/admin/memo'
import {
  use_admin_reception_support_presence,
  type admin_support_session_ref_value,
} from '@/components/admin/reception/admin_support_presence'
import AdminReceptionActiveSummary from '@/components/admin/reception/active_summary'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { handoff_memo } from '@/lib/chat/action'
import type {
  reception_room,
  reception_room_message,
} from '@/lib/admin/reception/room'
import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import {
  call_enter_support_room,
  call_leave_support_room,
  support_room_api_action_to_realtime,
} from '@/lib/chat/realtime/support_room_client'

type AdminReceptionRoomProps = {
  room_uuid: string
  room: reception_room | null
  customer_display_name: string
  staff_user_uuid: string | null
  staff_tier: string | null
  staff_participant_uuid: string
  staff_display_name: string
  memos: handoff_memo[]
  messages: reception_room_message[]
  load_failed: boolean
  admin_user_uuid: string
  admin_participant_uuid: string
}

const component_file = 'components/admin/reception/room.tsx'
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

export default function AdminReceptionRoom(props: AdminReceptionRoomProps) {
  const pathname = `/admin/reception/${props.room_uuid}`
  const [external_support_action, set_external_support_action] =
    useState<chat_action_realtime_payload | null>(null)
  const support_session_ref =
    useRef<admin_support_session_ref_value | null>(null)
  const enter_session_ref = useRef<string | null>(null)
  const has_entered_support_ref = useRef(false)
  const owner_registered_ref = useRef(false)
  const [owner_registered, set_owner_registered] = useState(false)
  const latest_room_uuid_ref = useRef(props.room_uuid)
  const admin_user_uuid_ref = useRef(props.admin_user_uuid)
  const admin_participant_uuid_ref = useRef(props.admin_participant_uuid)

  useEffect(() => {
    latest_room_uuid_ref.current = props.room_uuid
    admin_user_uuid_ref.current = props.admin_user_uuid
    admin_participant_uuid_ref.current = props.admin_participant_uuid
  }, [props.admin_participant_uuid, props.admin_user_uuid, props.room_uuid])

  useEffect(() => {
    const admin_participant_uuid = props.admin_participant_uuid.trim()
    const owner_key = `${support_lifecycle_owner}|${props.room_uuid}|${admin_participant_uuid}`
    const root = current_owner_global()
    const current = root.__admin_support_lifecycle_owner

    if (current && current.key !== owner_key) {
      send_admin_chat_debug({
        event: 'support_lifecycle_duplicate_owner_skipped',
        room_uuid: props.room_uuid,
        active_room_uuid: props.room_uuid,
        admin_user_uuid: props.admin_user_uuid.trim() || null,
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
      room_uuid: props.room_uuid,
      admin_participant_uuid,
    }
    owner_registered_ref.current = true
    set_owner_registered(true)

    send_admin_chat_debug({
      event: 'support_lifecycle_owner_registered',
      room_uuid: props.room_uuid,
      active_room_uuid: props.room_uuid,
      admin_user_uuid: props.admin_user_uuid.trim() || null,
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
    pathname,
    props.admin_participant_uuid,
    props.admin_user_uuid,
    props.room_uuid,
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
        set_external_support_action(action)
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
            set_external_support_action(
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

  use_admin_reception_support_presence({
    room_uuid: props.room_uuid,
    staff_participant_uuid: props.staff_participant_uuid,
    staff_user_uuid: props.staff_user_uuid,
    staff_tier: props.staff_tier,
    enabled: owner_registered,
    support_session_ref,
    on_support_action: (action) => {
      set_external_support_action(action)
    },
    on_recover_enter: () => {
      void run_enter_support_room('visibility_focus')
    },
  })

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-neutral-200 px-6 py-4">
        <div className="flex flex-col gap-3">
          <AdminReceptionActiveSummary
            room_uuid={props.room_uuid}
            room={props.room}
            customer_display_name={props.customer_display_name}
            staff_user_uuid={props.staff_user_uuid}
            staff_tier={props.staff_tier}
            staff_participant_uuid={props.staff_participant_uuid}
          />
          <AdminHandoffMemo
            room_uuid={props.room_uuid}
            initial_memos={props.memos}
          />
        </div>
      </div>

      <AdminChat
        key={props.room_uuid}
        messages={props.messages}
        load_failed={props.load_failed}
        room_uuid={props.room_uuid}
        staff_participant_uuid={props.staff_participant_uuid}
        staff_display_name={props.staff_display_name}
        staff_user_uuid={props.staff_user_uuid}
        staff_tier={props.staff_tier}
        room_display_title={props.customer_display_name}
        admin_user_uuid={props.admin_user_uuid}
        admin_participant_uuid={props.admin_participant_uuid}
        external_support_action={external_support_action}
      />
    </section>
  )
}
