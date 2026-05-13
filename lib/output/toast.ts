'use client'

import { send_chat_realtime_debug } from '@/lib/chat/realtime/client'

const toast_text = '\u65b0\u3057\u3044\u30e1\u30c3\u30bb\u30fc\u30b8'

export type chat_toast_context = {
  room_uuid: string | null
  active_room_uuid: string | null
  message_uuid: string | null
  sender_user_uuid: string | null
  sender_participant_uuid: string | null
  sender_role: string | null
  active_user_uuid: string | null
  active_participant_uuid: string | null
  active_role: string | null
  role: string | null
  tier: string | null
  source_channel: string | null
  target_path: string
  phase: string
}

export type chat_toast_decision =
  | { show: true; skip_reason: null }
  | { show: false; skip_reason: string }

function visibility_state() {
  if (typeof document === 'undefined') {
    return 'hidden'
  }

  return document.visibilityState
}

function is_self_sender(input: chat_toast_context) {
  if (
    input.sender_user_uuid &&
    input.active_user_uuid &&
    input.sender_user_uuid === input.active_user_uuid &&
    (!input.sender_role || !input.active_role || input.sender_role === input.active_role)
  ) {
    return true
  }

  if (
    input.sender_participant_uuid &&
    input.active_participant_uuid &&
    input.sender_participant_uuid === input.active_participant_uuid
  ) {
    return true
  }

  if (
    !input.sender_user_uuid &&
    !input.sender_participant_uuid &&
    input.sender_role &&
    input.active_role &&
    input.sender_role === input.active_role
  ) {
    return true
  }

  return false
}

export function resolve_chat_message_toast_decision(
  input: chat_toast_context,
): chat_toast_decision {
  if (visibility_state() !== 'visible') {
    return { show: false, skip_reason: 'document_not_visible' }
  }

  if (!input.room_uuid) {
    return { show: false, skip_reason: 'missing_room_uuid' }
  }

  if (input.active_room_uuid && input.room_uuid === input.active_room_uuid) {
    return { show: false, skip_reason: 'active_room_open' }
  }

  if (is_self_sender(input)) {
    return { show: false, skip_reason: 'self_message' }
  }

  return { show: true, skip_reason: null }
}

function ensure_toast_root() {
  let root = document.getElementById('chat-toast-root')

  if (root) {
    return root
  }

  root = document.createElement('div')
  root.id = 'chat-toast-root'
  root.className =
    'fixed left-4 right-4 top-[calc(env(safe-area-inset-top,0px)+16px)] z-[9999] flex flex-col items-center gap-2 pointer-events-none'
  document.body.appendChild(root)

  return root
}

function render_chat_toast(input: chat_toast_context) {
  const root = ensure_toast_root()
  const toast = document.createElement('button')

  toast.type = 'button'
  toast.textContent = toast_text
  toast.className =
    'pointer-events-auto min-h-11 max-w-[320px] rounded-full border border-neutral-200 bg-white px-5 py-3 text-[14px] font-semibold text-neutral-950 shadow-[0_8px_24px_rgba(0,0,0,0.14)]'
  toast.addEventListener('click', () => {
    window.location.href = input.target_path
  })

  root.appendChild(toast)

  window.setTimeout(() => {
    toast.remove()

    if (root.childElementCount === 0) {
      root.remove()
    }
  }, 4_000)
}

export function handle_chat_message_toast(input: chat_toast_context) {
  send_chat_realtime_debug({
    event: 'toast_decision_started',
    room_uuid: input.room_uuid,
    active_room_uuid: input.active_room_uuid,
    message_uuid: input.message_uuid,
    payload_message_uuid: input.message_uuid,
    payload_room_uuid: input.room_uuid,
    sender_user_uuid: input.sender_user_uuid,
    sender_participant_uuid: input.sender_participant_uuid,
    sender_role: input.sender_role,
    active_user_uuid: input.active_user_uuid,
    active_participant_uuid: input.active_participant_uuid,
    active_role: input.active_role,
    role: input.role,
    tier: input.tier,
    source_channel: input.source_channel,
    phase: input.phase,
  })

  const decision = resolve_chat_message_toast_decision(input)

  if (!decision.show) {
    send_chat_realtime_debug({
      event: 'toast_skipped',
      room_uuid: input.room_uuid,
      active_room_uuid: input.active_room_uuid,
      message_uuid: input.message_uuid,
      payload_message_uuid: input.message_uuid,
      payload_room_uuid: input.room_uuid,
      sender_user_uuid: input.sender_user_uuid,
      sender_participant_uuid: input.sender_participant_uuid,
      sender_role: input.sender_role,
      active_user_uuid: input.active_user_uuid,
      active_participant_uuid: input.active_participant_uuid,
      active_role: input.active_role,
      role: input.role,
      tier: input.tier,
      source_channel: input.source_channel,
      ignored_reason: decision.skip_reason,
      phase: input.phase,
    })

    return decision
  }

  render_chat_toast(input)

  send_chat_realtime_debug({
    event: 'toast_shown',
    room_uuid: input.room_uuid,
    active_room_uuid: input.active_room_uuid,
    message_uuid: input.message_uuid,
    payload_message_uuid: input.message_uuid,
    payload_room_uuid: input.room_uuid,
    sender_user_uuid: input.sender_user_uuid,
    sender_participant_uuid: input.sender_participant_uuid,
    sender_role: input.sender_role,
    active_user_uuid: input.active_user_uuid,
    active_participant_uuid: input.active_participant_uuid,
    active_role: input.active_role,
    role: input.role,
    tier: input.tier,
    source_channel: input.source_channel,
    phase: input.phase,
  })

  return decision
}
