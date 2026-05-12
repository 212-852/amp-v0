import 'server-only'

import { debug_control } from './control'

export type debug_level = 'info' | 'warn' | 'error'
export type debug_channel = 'discord'

export type debug_rule = {
  category: string
  level: debug_level
  channels: debug_channel[]
}

export function resolve_debug_rule(input: {
  category: string
  event: string
}): debug_rule {
  if (
    input.event === 'handoff_memo_save_blocked' ||
    input.event === 'handoff_memo_save_failed' ||
    input.event === 'handoff_memo_list_failed'
  ) {
    return {
      category: 'handoff_memo',
      level: 'error',
      channels: ['discord'],
    }
  }

  if (input.event === 'handoff_memo_save_started') {
    return {
      category: 'handoff_memo',
      level: 'info',
      channels: debug_control.handoff_memo_debug_enabled
        ? ['discord']
        : [],
    }
  }

  if (input.event === 'handoff_memo_save_succeeded') {
    return {
      category: 'handoff_memo',
      level: 'info',
      channels: debug_control.handoff_memo_debug_enabled
        ? ['discord']
        : [],
    }
  }

  const admin_management_events = new Set([
    'admin_profile_save_started',
    'admin_profile_save_failed',
    'admin_profile_save_succeeded',
    'admin_internal_name_notify_failed',
    'admin_internal_name_notify_succeeded',
  ])

  if (
    input.category === 'admin_management' &&
    admin_management_events.has(input.event)
  ) {
    const is_failed =
      input.event === 'admin_profile_save_failed' ||
      input.event === 'admin_internal_name_notify_failed'

    return {
      category: 'admin_management',
      level: is_failed ? 'error' : 'info',
      channels: ['discord'],
    }
  }

  return {
    category: input.category,
    level: 'info',
    channels: ['discord'],
  }
}
