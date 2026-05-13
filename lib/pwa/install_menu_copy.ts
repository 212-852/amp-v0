export type pwa_install_menu_copy_variant = 'standard' | 'safari_manual'

/**
 * rules: which primary/subtitle pair the install menu row shows.
 * Does not decide tier or standalone; callers pass `has_beforeinstallprompt` and UA.
 */
export function is_ios_like_user_agent(user_agent: string | null | undefined): boolean {
  if (!user_agent) {
    return false
  }

  const ua = user_agent.toLowerCase()

  return (
    ua.includes('iphone') ||
    ua.includes('ipad') ||
    ua.includes('ipod')
  )
}

export function resolve_pwa_install_menu_copy_variant(input: {
  has_beforeinstallprompt: boolean
  user_agent: string | null | undefined
}): pwa_install_menu_copy_variant {
  if (input.has_beforeinstallprompt) {
    return 'standard'
  }

  if (is_ios_like_user_agent(input.user_agent)) {
    return 'safari_manual'
  }

  return 'standard'
}
