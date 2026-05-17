'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'

import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import { send_chat_realtime_debug } from '@/lib/chat/realtime/client'
import { participant_presence_columns_available } from '@/lib/chat/presence/schema'
import {
  call_leave_support_room,
  resolve_client_presence_source_channel,
  support_room_api_action_to_realtime,
} from '@/lib/chat/realtime/support_room_client'

const heartbeat_interval_ms = 20_000
const visibility_hidden_leave_delay_ms = 10_000

export type admin_support_session_ref_value = {
  room_uuid: string
  admin_participant_uuid: string
  enter_action_uuid: string
  support_session_key: string
  left_sent: boolean
  existing_left_action_uuid: string | null
}

function leave_trigger_debug(input: {
  event: string
  room_uuid: string
  previous_room_uuid: string | null
  next_room_uuid: string | null
  admin_user_uuid: string | null
  admin_participant_uuid: string
  leave_reason: string
  reason?: string | null
  support_session_key?: string | null
  existing_left_action_uuid?: string | null
  ignored_reason?: string | null
  error_code?: string | null
  error_message?: string | null
}) {
  const pathname =
    typeof window !== 'undefined' ? window.location.pathname : null
  const visibility_state =
    typeof document !== 'undefined' ? document.visibilityState : null

  send_chat_realtime_debug({
    event: input.event,
    phase: 'admin_support_presence',
    room_uuid: input.room_uuid,
    active_room_uuid: input.room_uuid,
    previous_room_uuid: input.previous_room_uuid,
    next_room_uuid: input.next_room_uuid,
    admin_user_uuid: input.admin_user_uuid,
    participant_uuid: input.admin_participant_uuid,
    visibility_state,
    pathname,
    leave_reason: input.leave_reason,
    reason: input.reason ?? input.leave_reason,
    support_session_key: input.support_session_key ?? null,
    existing_left_action_uuid: input.existing_left_action_uuid ?? null,
    ignored_reason: input.ignored_reason ?? null,
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
  })
}

async function post_admin_support_presence(input: {
  room_uuid: string
  participant_uuid: string
  action: string
  keepalive?: boolean
  leave_reason?: string
  support_session_key?: string
}) {
  const response = await fetch('/api/chat/presence', {
    method: 'POST',
    credentials: 'include',
    keepalive: input.keepalive,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      room_uuid: input.room_uuid,
      participant_uuid: input.participant_uuid,
      action: input.action,
      last_channel: resolve_client_presence_source_channel(),
      active_area: 'admin_reception_room',
      leave_reason: input.leave_reason,
      previous_active_room_uuid: input.room_uuid,
      next_active_room_uuid: null,
      support_session_key: input.support_session_key,
    }),
  })

  if (!response.ok) {
    throw new Error(`presence_${response.status}`)
  }
}

async function post_admin_support_leave(input: {
  room_uuid: string
  participant_uuid: string
  admin_user_uuid: string | null
  support_session_key: string
  leave_reason: string
  action?: 'admin_support_leave' | 'admin_support_page_unload'
  keepalive?: boolean
  on_support_action?: (action: chat_action_realtime_payload) => void
  support_session_ref?: MutableRefObject<admin_support_session_ref_value | null>
}) {
  const support_session = input.support_session_ref?.current ?? null
  const support_session_key =
    support_session?.support_session_key ?? input.support_session_key

  if (
    !support_session ||
    support_session.room_uuid !== input.room_uuid ||
    support_session.admin_participant_uuid !== input.participant_uuid
  ) {
    leave_trigger_debug({
      event: 'support_left_duplicate_skipped',
      room_uuid: input.room_uuid,
      previous_room_uuid: input.room_uuid,
      next_room_uuid: null,
      admin_user_uuid: input.admin_user_uuid,
      admin_participant_uuid: input.participant_uuid,
      leave_reason: input.leave_reason,
      reason: 'missing_current_support_session',
      support_session_key,
      existing_left_action_uuid: support_session?.existing_left_action_uuid,
      ignored_reason: 'missing_current_support_session',
    })

    return
  }

  if (support_session.left_sent === true) {
    leave_trigger_debug({
      event: 'support_left_duplicate_skipped',
      room_uuid: input.room_uuid,
      previous_room_uuid: input.room_uuid,
      next_room_uuid: null,
      admin_user_uuid: input.admin_user_uuid,
      admin_participant_uuid: input.participant_uuid,
      leave_reason: input.leave_reason,
      reason: 'client_support_session_already_left',
      support_session_key,
      existing_left_action_uuid: support_session.existing_left_action_uuid,
      ignored_reason: 'client_support_session_already_left',
    })

    return
  }

  support_session.left_sent = true

  leave_trigger_debug({
    event: 'admin_support_leave_call_started',
    room_uuid: input.room_uuid,
    previous_room_uuid: input.room_uuid,
    next_room_uuid: null,
    admin_user_uuid: input.admin_user_uuid,
    admin_participant_uuid: input.participant_uuid,
    leave_reason: input.leave_reason,
    reason: input.leave_reason,
    support_session_key,
    existing_left_action_uuid: support_session.existing_left_action_uuid,
  })

  try {
    const result = await call_leave_support_room({
      room_uuid: input.room_uuid,
      participant_uuid: input.participant_uuid,
      leave_reason: input.leave_reason,
      support_session_key,
      action: input.action,
      keepalive: input.keepalive,
    })

    if (result.ok && result.action) {
      support_session.existing_left_action_uuid = result.action.action_uuid
      input.on_support_action?.(
        support_room_api_action_to_realtime(result.action),
      )
    }

    leave_trigger_debug({
      event: 'admin_support_leave_call_succeeded',
      room_uuid: input.room_uuid,
      previous_room_uuid: input.room_uuid,
      next_room_uuid: null,
      admin_user_uuid: input.admin_user_uuid,
      admin_participant_uuid: input.participant_uuid,
      leave_reason: input.leave_reason,
      reason: result.ok && result.skipped ? 'skipped' : input.leave_reason,
      support_session_key,
      existing_left_action_uuid: support_session.existing_left_action_uuid,
    })
  } catch (error) {
    leave_trigger_debug({
      event: 'admin_support_leave_call_failed',
      room_uuid: input.room_uuid,
      previous_room_uuid: input.room_uuid,
      next_room_uuid: null,
      admin_user_uuid: input.admin_user_uuid,
      admin_participant_uuid: input.participant_uuid,
      leave_reason: input.leave_reason,
      reason: input.leave_reason,
      support_session_key,
      existing_left_action_uuid: support_session.existing_left_action_uuid,
      error_code: 'support_leave_call_failed',
      error_message: error instanceof Error ? error.message : String(error),
    })
  }
}

export function use_admin_reception_support_presence(input: {
  room_uuid: string
  staff_participant_uuid: string
  staff_user_uuid: string | null
  staff_tier: string | null
  enabled: boolean
  on_support_action?: (action: chat_action_realtime_payload) => void
  on_recover_enter?: () => void
  support_session_ref?: MutableRefObject<admin_support_session_ref_value | null>
}) {
  const idle_leave_timer_ref = useRef<number | null>(null)
  const was_hidden_ref = useRef(false)
  const support_session_key_ref = useRef<string>('')
  const prev_room_for_change_ref = useRef<string | null>(null)
  const on_support_action_ref = useRef(input.on_support_action)
  const on_recover_enter_ref = useRef(input.on_recover_enter)

  useEffect(() => {
    on_support_action_ref.current = input.on_support_action
    on_recover_enter_ref.current = input.on_recover_enter
  }, [input.on_recover_enter, input.on_support_action])

  useEffect(() => {
    if (
      !input.enabled ||
      !input.room_uuid.trim() ||
      !input.staff_participant_uuid.trim()
    ) {
      return
    }

    const room_uuid = input.room_uuid
    const participant_uuid = input.staff_participant_uuid

    support_session_key_ref.current =
      input.support_session_ref?.current?.support_session_key ?? ''

    const prev_tracked = prev_room_for_change_ref.current

    if (prev_tracked && prev_tracked !== room_uuid) {
      leave_trigger_debug({
        event: 'admin_leave_room_change_detected',
        room_uuid: prev_tracked,
        previous_room_uuid: prev_tracked,
        next_room_uuid: room_uuid,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'room_change',
      })
    }

    prev_room_for_change_ref.current = room_uuid

    const on_before_unload = () => {
      leave_trigger_debug({
        event: 'admin_leave_beforeunload_detected',
        room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'beforeunload',
      })
      leave_trigger_debug({
        event: 'admin_support_leave_detected',
        room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'beforeunload',
      })
      void post_admin_support_leave({
        room_uuid,
        participant_uuid,
        admin_user_uuid: input.staff_user_uuid,
        action: 'admin_support_page_unload',
        keepalive: true,
        leave_reason: 'beforeunload',
        support_session_key: support_session_key_ref.current,
        support_session_ref: input.support_session_ref,
        on_support_action: on_support_action_ref.current,
      })
    }

    const post = (
      action: string,
      extra?: { leave_reason?: string; keepalive?: boolean },
    ) => {
      void post_admin_support_presence({
        room_uuid,
        participant_uuid,
        action,
        keepalive: extra?.keepalive,
        leave_reason: extra?.leave_reason,
        support_session_key: support_session_key_ref.current,
      }).catch(() => {})
    }

    post('admin_support_join')

    if (!participant_presence_columns_available) {
      send_chat_realtime_debug({
        event: 'admin_presence_timeout_checker_disabled',
        room_uuid,
        active_room_uuid: room_uuid,
        participant_uuid,
        source_channel: 'admin',
        reason: 'participant_presence_columns_unavailable',
        phase: 'admin_support_presence_timeout_checker',
      })
    } else {
      send_chat_realtime_debug({
        event: 'admin_presence_timeout_checker_started',
        room_uuid,
        active_room_uuid: room_uuid,
        participant_uuid,
        source_channel: 'admin',
        reason: null,
        phase: 'admin_support_presence_timeout_checker',
      })
    }

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return
      }

      post('admin_support_heartbeat')
      if (participant_presence_columns_available) {
        void post_admin_support_presence({
          room_uuid,
          participant_uuid,
          action: 'admin_support_timeout_check',
          support_session_key: support_session_key_ref.current,
        }).catch(() => {})
      }
    }, heartbeat_interval_ms)

    const clear_idle_leave_timer = () => {
      if (idle_leave_timer_ref.current !== null) {
        window.clearTimeout(idle_leave_timer_ref.current)
        idle_leave_timer_ref.current = null
      }
    }

    const on_visibility = () => {
      if (document.visibilityState === 'hidden') {
        was_hidden_ref.current = true
        leave_trigger_debug({
          event: 'admin_leave_visibility_hidden_detected',
          room_uuid,
          previous_room_uuid: room_uuid,
          next_room_uuid: null,
          admin_user_uuid: input.staff_user_uuid,
          admin_participant_uuid: participant_uuid,
          leave_reason: 'visibility_hidden',
        })
        void post_admin_support_presence({
          room_uuid,
          participant_uuid,
          action: 'admin_support_idle',
          keepalive: true,
          support_session_key: support_session_key_ref.current,
        }).catch(() => {})
        clear_idle_leave_timer()
        idle_leave_timer_ref.current = window.setTimeout(() => {
          leave_trigger_debug({
            event: 'admin_leave_visibility_hidden_detected',
            room_uuid,
            previous_room_uuid: room_uuid,
            next_room_uuid: null,
            admin_user_uuid: input.staff_user_uuid,
            admin_participant_uuid: participant_uuid,
            leave_reason: 'visibility_hidden_timeout',
          })
          leave_trigger_debug({
            event: 'admin_support_leave_detected',
            room_uuid,
            previous_room_uuid: room_uuid,
            next_room_uuid: null,
            admin_user_uuid: input.staff_user_uuid,
            admin_participant_uuid: participant_uuid,
            leave_reason: 'visibility_hidden_timeout',
          })
          void post_admin_support_leave({
            room_uuid,
            participant_uuid,
            admin_user_uuid: input.staff_user_uuid,
            keepalive: true,
            leave_reason: 'visibility_hidden_timeout',
            support_session_key: support_session_key_ref.current,
            support_session_ref: input.support_session_ref,
            on_support_action: on_support_action_ref.current,
          })
        }, visibility_hidden_leave_delay_ms)
      } else {
        clear_idle_leave_timer()
        if (was_hidden_ref.current) {
          was_hidden_ref.current = false
          void fetch('/api/chat/presence', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              room_uuid,
              participant_uuid,
              action: 'admin_support_recovered',
              last_channel: resolve_client_presence_source_channel(),
              active_area: 'admin_reception_room',
              support_session_key: support_session_key_ref.current,
            }),
          }).catch(() => {})
        }
        post('admin_support_join')
        on_recover_enter_ref.current?.()
      }
    }

    const on_pagehide = () => {
      leave_trigger_debug({
        event: 'admin_leave_pagehide_detected',
        room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'pagehide',
      })
      leave_trigger_debug({
        event: 'admin_support_leave_detected',
        room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'pagehide',
      })
      void post_admin_support_leave({
        room_uuid,
        participant_uuid,
        admin_user_uuid: input.staff_user_uuid,
        action: 'admin_support_page_unload',
        keepalive: true,
        leave_reason: 'pagehide',
        support_session_key: support_session_key_ref.current,
        support_session_ref: input.support_session_ref,
        on_support_action: on_support_action_ref.current,
      })
    }

    window.addEventListener('beforeunload', on_before_unload)
    document.addEventListener('visibilitychange', on_visibility)
    window.addEventListener('pagehide', on_pagehide)

    return () => {
      window.clearInterval(heartbeat)
      if (participant_presence_columns_available) {
        send_chat_realtime_debug({
          event: 'admin_presence_timeout_checker_stopped',
          room_uuid,
          active_room_uuid: room_uuid,
          participant_uuid,
          source_channel: 'admin',
          reason: 'component_cleanup',
          phase: 'admin_support_presence_timeout_checker',
        })
      }
      window.removeEventListener('beforeunload', on_before_unload)
      document.removeEventListener('visibilitychange', on_visibility)
      window.removeEventListener('pagehide', on_pagehide)
      clear_idle_leave_timer()
      leave_trigger_debug({
        event: 'admin_leave_route_change_detected',
        room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'route_change',
      })
      leave_trigger_debug({
        event: 'admin_support_leave_detected',
        room_uuid,
        previous_room_uuid: room_uuid,
        next_room_uuid: null,
        admin_user_uuid: input.staff_user_uuid,
        admin_participant_uuid: participant_uuid,
        leave_reason: 'route_change',
      })
      void post_admin_support_leave({
        room_uuid,
        participant_uuid,
        admin_user_uuid: input.staff_user_uuid,
        keepalive: true,
        leave_reason: 'route_change',
        support_session_key: support_session_key_ref.current,
        support_session_ref: input.support_session_ref,
        on_support_action: on_support_action_ref.current,
      })
      prev_room_for_change_ref.current = null
    }
  }, [
    input.enabled,
    input.room_uuid,
    input.staff_participant_uuid,
    input.staff_tier,
    input.staff_user_uuid,
    input.support_session_ref,
  ])
}
