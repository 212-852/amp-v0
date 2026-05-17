export type notification_method_trigger = 'pwa' | 'line' | null

export type notification_method_preferences = {
  primary_channel: 'push' | 'line' | 'none'
  pwa_push_enabled: boolean
  line_enabled: boolean
}

export type notification_method_adjustment_result<
  T extends notification_method_preferences,
> = {
  preferences: T
  auto_adjusted: boolean
  invalid_both_off_prevented: boolean
  trigger_method: notification_method_trigger
  previous_pwa_enabled: boolean
  previous_line_enabled: boolean
  next_pwa_enabled: boolean
  next_line_enabled: boolean
}

function primary_channel_for(input: {
  pwa_push_enabled: boolean
  line_enabled: boolean
}): 'push' | 'line' | 'none' {
  if (input.pwa_push_enabled) {
    return 'push'
  }

  if (input.line_enabled) {
    return 'line'
  }

  return 'none'
}

export function enforce_notification_method_selection<
  T extends notification_method_preferences,
>(input: {
  previous: notification_method_preferences
  next: T
  trigger_method?: notification_method_trigger
  pwa_available?: boolean | null
}): notification_method_adjustment_result<T> {
  const trigger_method = input.trigger_method ?? null
  const previous_pwa_enabled = input.previous.pwa_push_enabled
  const previous_line_enabled = input.previous.line_enabled
  const requested_pwa_enabled = input.next.pwa_push_enabled
  const requested_line_enabled = input.next.line_enabled
  let pwa_push_enabled = requested_pwa_enabled
  let line_enabled = requested_line_enabled
  let auto_adjusted = false
  let invalid_both_off_prevented = false

  if (!pwa_push_enabled && !line_enabled) {
    invalid_both_off_prevented = true
    auto_adjusted = true

    if (trigger_method === 'pwa') {
      line_enabled = true
    } else if (trigger_method === 'line') {
      if (input.pwa_available === false) {
        line_enabled = true
      } else {
        pwa_push_enabled = true
      }
    } else if (previous_pwa_enabled) {
      pwa_push_enabled = true
    } else {
      line_enabled = true
    }
  }

  const preferences = {
    ...input.next,
    pwa_push_enabled,
    line_enabled,
    primary_channel: primary_channel_for({
      pwa_push_enabled,
      line_enabled,
    }),
  }

  return {
    preferences,
    auto_adjusted,
    invalid_both_off_prevented,
    trigger_method,
    previous_pwa_enabled,
    previous_line_enabled,
    next_pwa_enabled: preferences.pwa_push_enabled,
    next_line_enabled: preferences.line_enabled,
  }
}
