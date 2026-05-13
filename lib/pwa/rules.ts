export type pwa_install_role = 'user' | 'driver' | 'admin' | 'guest' | null
export type pwa_install_tier = 'guest' | 'member' | 'vip' | null

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
