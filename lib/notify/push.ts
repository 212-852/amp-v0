import 'server-only'

export type push_notify_input = {
  user_uuid: string
  message: string
  title?: string
}

export type push_notify_result = {
  ok: boolean
  available: boolean
  reason?: string
}

/**
 * Personal push delivery for an admin / owner / core user.
 *
 * The push subscription system is not yet wired up, so this stub always
 * reports `available: false`. Callers must treat this as a signal to fall
 * back to LINE personal push (see `notify/index.ts`).
 *
 * Future work plugs WebPush/FCM here without changing the orchestrator
 * contract: return `{ ok: true, available: true }` on success.
 */
export async function send_push_notify(
  _input: push_notify_input,
): Promise<push_notify_result> {
  return {
    ok: false,
    available: false,
    reason: 'push_subscriptions_not_configured',
  }
}
