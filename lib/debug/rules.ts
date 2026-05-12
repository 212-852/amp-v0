import 'server-only'

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
      channels: ['discord'],
    }
  }

  if (input.event === 'handoff_memo_save_succeeded') {
    return {
      category: 'handoff_memo',
      level: 'info',
      channels: ['discord'],
    }
  }

  return {
    category: input.category,
    level: 'info',
    channels: ['discord'],
  }
}
