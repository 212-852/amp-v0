'use client'

import {
  resolve_new_message_toast_decision,
  type new_message_toast_decision,
  type new_message_toast_decision_input,
} from '@/lib/chat/realtime/toast_decision'
import { send_chat_realtime_debug } from '@/lib/chat/realtime/client'

const toast_title = '\u65b0\u3057\u3044\u30e1\u30c3\u30bb\u30fc\u30b8'

export type chat_toast_decision = new_message_toast_decision

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
  is_scrolled_to_bottom: boolean | null
  subtitle: string
  scroll_to_bottom: (() => void) | null
}

function visibility_state(): DocumentVisibilityState {
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

function build_toast_decision_input(
  input: chat_toast_context,
): new_message_toast_decision_input {
  return {
    visibility_state: visibility_state(),
    room_uuid: input.room_uuid,
    active_room_uuid: input.active_room_uuid,
    message_uuid: input.message_uuid,
    is_self_sender: is_self_sender(input),
    is_scrolled_to_bottom: input.is_scrolled_to_bottom,
    has_toast_dom: typeof document !== 'undefined' && Boolean(document.body),
  }
}

/** @deprecated use resolve_new_message_toast_decision + build_toast_decision_input */
export function resolve_chat_message_toast_decision(
  input: chat_toast_context,
): chat_toast_decision {
  const decision = resolve_new_message_toast_decision(
    build_toast_decision_input(input),
  )

  return decision
}

function toast_debug_payload(
  input: chat_toast_context,
  extras: {
    visibility_state: string
    is_scrolled_to_bottom: boolean | null
    skip_reason?: string | null
  },
) {
  return {
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
    visibility_state: extras.visibility_state,
    is_scrolled_to_bottom: extras.is_scrolled_to_bottom,
    skip_reason: extras.skip_reason ?? null,
    ignored_reason: extras.skip_reason ?? null,
  }
}

function ensure_toast_root() {
  let root = document.getElementById('chat-toast-root')

  if (root) {
    return root
  }

  root = document.createElement('div')
  root.id = 'chat-toast-root'
  root.className =
    'pointer-events-none fixed left-1/2 z-[60] flex w-[min(100%-32px,320px)] max-w-[320px] -translate-x-1/2 flex-col items-stretch'
  root.style.bottom = 'calc(env(safe-area-inset-bottom, 0px) + 96px)'
  document.body.appendChild(root)

  return root
}

function render_chat_toast(input: chat_toast_context) {
  const root = ensure_toast_root()
  const toast = document.createElement('button')

  toast.type = 'button'
  toast.className =
    'pointer-events-auto w-full rounded-2xl border border-white/10 bg-[rgba(0,0,0,0.72)] px-4 py-3 text-left shadow-[0_10px_32px_rgba(0,0,0,0.35)] backdrop-blur-md'

  const title_el = document.createElement('div')
  title_el.className = 'text-[14px] font-semibold leading-snug text-white'
  title_el.textContent = toast_title

  const sub_el = document.createElement('div')
  sub_el.className =
    'mt-1 line-clamp-2 text-[12px] font-medium leading-snug text-white/85'
  sub_el.textContent = input.subtitle

  toast.appendChild(title_el)
  toast.appendChild(sub_el)

  const vs = visibility_state()
  const same_room =
    input.active_room_uuid != null &&
    input.room_uuid != null &&
    input.active_room_uuid === input.room_uuid

  toast.addEventListener('click', () => {
    send_chat_realtime_debug({
      event: 'toast_clicked',
      ...toast_debug_payload(input, {
        visibility_state: vs,
        is_scrolled_to_bottom: input.is_scrolled_to_bottom,
      }),
    })

    if (same_room && typeof input.scroll_to_bottom === 'function') {
      input.scroll_to_bottom()
    } else {
      window.location.href = input.target_path
    }
  })

  root.appendChild(toast)

  window.setTimeout(() => {
    send_chat_realtime_debug({
      event: 'toast_auto_hidden',
      ...toast_debug_payload(input, {
        visibility_state: visibility_state(),
        is_scrolled_to_bottom: input.is_scrolled_to_bottom,
      }),
    })

    toast.remove()

    if (root.childElementCount === 0) {
      root.remove()
    }
  }, 4_000)
}

export function handle_chat_message_toast(input: chat_toast_context) {
  const vs = visibility_state()
  const decision_input = build_toast_decision_input(input)

  send_chat_realtime_debug({
    event: 'toast_decision_started',
    ...toast_debug_payload(input, {
      visibility_state: vs,
      is_scrolled_to_bottom: input.is_scrolled_to_bottom,
    }),
  })

  const decision = resolve_new_message_toast_decision(decision_input)

  if (!decision.show) {
    send_chat_realtime_debug({
      event: 'toast_skipped',
      ...toast_debug_payload(input, {
        visibility_state: vs,
        is_scrolled_to_bottom: input.is_scrolled_to_bottom,
        skip_reason: decision.skip_reason,
      }),
    })

    return decision
  }

  render_chat_toast(input)

  send_chat_realtime_debug({
    event: 'toast_shown',
    ...toast_debug_payload(input, {
      visibility_state: vs,
      is_scrolled_to_bottom: input.is_scrolled_to_bottom,
    }),
  })

  return decision
}
