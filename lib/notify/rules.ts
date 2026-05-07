import 'server-only'

import { control } from '@/lib/config/control'

export type notify_event =
  | {
      event: 'new_user_created'
      provider: string
      user_uuid: string
      visitor_uuid: string
      display_name?: string | null
      locale?: string | null
      is_new_user: boolean
      is_new_visitor: boolean
    }
  | {
      event: 'concierge_room_request'
      room_uuid: string
      visitor_uuid: string
      user_uuid: string | null
      channel: string
    }
  | {
      event: 'concierge_requested'
      room_uuid: string
      participant_uuid: string
      visitor_uuid: string
      user_uuid: string | null
      source_channel: string
      mode: 'concierge'
      action_id: string | null
    }
  | {
      event: 'concierge_closed'
      room_uuid: string
      mode: 'bot'
      action_id: string | null
    }
  | {
      event: 'line_push'
      line_user_id: string
      message: string
    }
  | {
      event: 'debug_trace'
      category: string
      debug_event: string
      payload: Record<string, unknown>
    }

export type notify_channel = 'discord' | 'line'

export type notify_rule = {
  category?: 'concierge_requested' | 'concierge_closed'
  priority?: 'high' | 'normal'
  targets?: Array<'admin' | 'concierge' | 'owner' | 'core'>
  channels: notify_channel[]
}

export function should_send_notify(event: notify_event) {
  if (event.event === 'new_user_created') {
    return control.notify.new_user_created
  }

  if (event.event === 'concierge_room_request') {
    return control.notify.concierge_room_request
  }

  if (
    event.event === 'concierge_requested' ||
    event.event === 'concierge_closed'
  ) {
    return control.notify.concierge_room_request
  }

  if (event.event === 'line_push') {
    return true
  }

  if (event.event === 'debug_trace') {
    return control.notify.debug_trace
  }

  return false
}

export function resolve_notify_rule(event: notify_event): notify_rule {
  if (!should_send_notify(event)) {
    return {
      channels: [],
    }
  }

  if (event.event === 'new_user_created') {
    return {
      channels: ['discord'],
    }
  }

  if (event.event === 'concierge_room_request') {
    return {
      channels: ['discord'],
    }
  }

  if (event.event === 'concierge_requested') {
    return {
      category: 'concierge_requested',
      priority: 'high',
      targets: ['admin', 'concierge', 'owner', 'core'],
      channels: ['discord'],
    }
  }

  if (event.event === 'concierge_closed') {
    return {
      category: 'concierge_closed',
      priority: 'normal',
      targets: ['admin', 'concierge', 'owner', 'core'],
      channels: ['discord'],
    }
  }

  if (event.event === 'line_push') {
    return {
      channels: ['line'],
    }
  }

  if (event.event === 'debug_trace') {
    return {
      channels: ['discord'],
    }
  }

  return {
    channels: [],
  }
}
