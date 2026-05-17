export const line_link_return_path_cookie_name = 'amp_line_link_return_path'

export function normalize_line_link_return_path(
  value: string | null | undefined,
) {
  const trimmed = value?.trim() ?? ''

  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null
  }

  return trimmed.slice(0, 512)
}

export function line_link_return_path_cookie_options() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  }
}
