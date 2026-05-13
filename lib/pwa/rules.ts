export type pwa_install_role = 'user' | 'driver' | 'admin' | 'guest' | null
export type pwa_install_tier = 'guest' | 'member' | 'vip' | null

export type pwa_install_client_os = 'ios' | 'android' | 'desktop'

/**
 * rules: classify client OS from User-Agent (install modal / menu hints only).
 */
export function resolve_pwa_install_client_os(
  user_agent: string | null | undefined,
): pwa_install_client_os {
  if (!user_agent) {
    return 'desktop'
  }

  const ua = user_agent.toLowerCase()

  if (
    ua.includes('iphone') ||
    ua.includes('ipad') ||
    ua.includes('ipod')
  ) {
    return 'ios'
  }

  if (ua.includes('android')) {
    return 'android'
  }

  return 'desktop'
}

export function can_show_pwa_install(input: {
  role: pwa_install_role
  tier: pwa_install_tier
  already_installed: boolean
}) {
  if (input.already_installed) {
    return false
  }

  return (
    input.role === 'user' &&
    (input.tier === 'member' || input.tier === 'vip')
  )
}
