'use client'

import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import type { chat_realtime_hook_append_result } from '@/lib/chat/realtime/use_chat_realtime'

type support_action_listener = (action: chat_action_realtime_payload) => void

type message_listener = (
  message: realtime_archived_message,
) => chat_realtime_hook_append_result | void

type action_listener = (
  action: chat_action_realtime_payload,
  inserted_index: number,
) => chat_realtime_hook_append_result | void

const support_action_listeners = new Set<support_action_listener>()
const message_listeners = new Set<message_listener>()
const action_listeners = new Set<action_listener>()

export function register_admin_reception_live_support_action(
  listener: support_action_listener,
) {
  support_action_listeners.add(listener)

  return () => {
    support_action_listeners.delete(listener)
  }
}

export function register_admin_reception_live_message(listener: message_listener) {
  message_listeners.add(listener)

  return () => {
    message_listeners.delete(listener)
  }
}

export function register_admin_reception_live_action(listener: action_listener) {
  action_listeners.add(listener)

  return () => {
    action_listeners.delete(listener)
  }
}

export function emit_admin_reception_live_support_action(
  action: chat_action_realtime_payload,
) {
  for (const listener of support_action_listeners) {
    listener(action)
  }
}

export function emit_admin_reception_live_message(
  message: realtime_archived_message,
) {
  let last: chat_realtime_hook_append_result | void = undefined

  for (const listener of message_listeners) {
    last = listener(message) ?? last
  }

  return last
}

export function emit_admin_reception_live_action(
  action: chat_action_realtime_payload,
  inserted_index: number,
) {
  let last: chat_realtime_hook_append_result | void = undefined

  for (const listener of action_listeners) {
    last = listener(action, inserted_index) ?? last
  }

  return last
}
