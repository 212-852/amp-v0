import type { realtime_archived_message } from '@/lib/chat/realtime/row'

export function compute_message_list_near_bottom(
  element: HTMLElement | null,
  threshold_px = 80,
): boolean {
  if (!element) {
    return false
  }

  const { scrollTop, scrollHeight, clientHeight } = element

  return scrollHeight - scrollTop - clientHeight <= threshold_px
}

export type new_message_toast_decision_input = {
  visibility_state: DocumentVisibilityState
  room_uuid: string | null
  active_room_uuid: string | null
  message_uuid: string | null
  is_self_sender: boolean
  is_scrolled_to_bottom: boolean | null
  has_toast_dom: boolean
}

export type new_message_toast_decision =
  | { show: true; skip_reason: null }
  | { show: false; skip_reason: string }

/**
 * rules: whether to show the new-message toast (no UI side effects).
 */
export function resolve_new_message_toast_decision(
  input: new_message_toast_decision_input,
): new_message_toast_decision {
  if (!input.has_toast_dom) {
    return { show: false, skip_reason: 'no_toast_provider' }
  }

  if (input.visibility_state !== 'visible') {
    return { show: false, skip_reason: 'hidden_document' }
  }

  if (!input.message_uuid || !input.message_uuid.trim()) {
    return { show: false, skip_reason: 'missing_message_uuid' }
  }

  if (!input.room_uuid) {
    return { show: false, skip_reason: 'missing_room_uuid' }
  }

  if (input.is_self_sender) {
    return { show: false, skip_reason: 'self_message' }
  }

  const same_room =
    input.active_room_uuid != null &&
    input.active_room_uuid === input.room_uuid

  const scrolled_to_bottom = input.is_scrolled_to_bottom === true

  if (same_room && scrolled_to_bottom) {
    return { show: false, skip_reason: 'same_room_at_bottom' }
  }

  return { show: true, skip_reason: null }
}

export function resolve_realtime_message_subtitle_for_toast(
  message: realtime_archived_message,
  room_fallback: string | null,
): string {
  const bundle = message.bundle
  const meta =
    'metadata' in bundle && bundle.metadata && typeof bundle.metadata === 'object'
      ? (bundle.metadata as Record<string, unknown>)
      : null

  if (meta) {
    const sender_name = meta.sender_display_name

    if (typeof sender_name === 'string' && sender_name.trim()) {
      return sender_name.trim()
    }

    const actor_name = meta.actor_display_name

    if (typeof actor_name === 'string' && actor_name.trim()) {
      return actor_name.trim()
    }
  }

  const sender = bundle.sender
  const labels: Record<string, string> = {
    user: 'ゲスト',
    bot: 'PET TAXI',
    concierge: 'コンシェルジュ',
    admin: '運営',
    driver: 'ドライバー',
  }

  return labels[sender] ?? room_fallback?.trim() ?? 'メッセージ'
}
