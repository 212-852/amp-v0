import 'server-only'

import { supabase } from '@/lib/db/supabase'

export type push_notify_input = {
  user_uuid: string
  message: string
  title?: string
  room_uuid?: string | null
  message_uuid?: string | null
}

export type push_notify_result = {
  ok: boolean
  available: boolean
  reason?: string
}

export async function send_push_notify(
  input: push_notify_input,
): Promise<push_notify_result> {
  const result = await supabase
    .from('push_subscriptions')
    .select('subscription_uuid')
    .eq('user_uuid', input.user_uuid)
    .eq('is_active', true)
    .limit(1)

  if (result.error) {
    return {
      ok: false,
      available: false,
      reason: result.error.message,
    }
  }

  if ((result.data ?? []).length === 0) {
    return {
      ok: false,
      available: false,
      reason: 'push_subscription_missing',
    }
  }

  if (
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_SUBJECT
  ) {
    return {
      ok: false,
      available: false,
      reason: 'vapid_keys_not_configured',
    }
  }

  return {
    ok: false,
    available: true,
    reason: 'webpush_delivery_not_configured',
  }
}
