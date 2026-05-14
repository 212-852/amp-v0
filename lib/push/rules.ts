/**
 * Push subscriptions are device notification endpoints in `push_subscriptions`
 * (one user, many devices). They are not merged into `identities`.
 */
export type push_session_slice = {
  role: string | null | undefined
  tier: string | null | undefined
}

export type push_subscription_row = {
  enabled?: boolean | null
  is_pwa?: boolean | null
}

/**
 * rules: member / vip user only; guest / admin / driver cannot save for now.
 */
export function can_save_push_subscription(session: push_session_slice): boolean {
  return (
    session.role === 'user' &&
    (session.tier === 'member' || session.tier === 'vip')
  )
}

/**
 * PWA installed for product rules: enabled row with is_pwa true for this user.
 */
export function resolve_push_status(rows: push_subscription_row[]): {
  pwa_installed: boolean
  has_active_subscription: boolean
} {
  const has_active_subscription = rows.some((row) => row.enabled === true)

  const pwa_installed = rows.some(
    (row) => row.enabled === true && row.is_pwa === true,
  )

  return { pwa_installed, has_active_subscription }
}

/**
 * Whether the install entry may be offered (tier rules + not already recorded as PWA install).
 * Standalone display-mode hiding stays in the client shell only.
 */
export function should_offer_pwa_install(input: {
  session: push_session_slice
  pwa_push_installed: boolean
}): boolean {
  return can_save_push_subscription(input.session) && !input.pwa_push_installed
}

/** Admin header menu: any authenticated admin tier may open the install guide. */
export function can_offer_admin_pwa_install_menu_row(
  session: push_session_slice,
): boolean {
  return session.role === 'admin'
}
