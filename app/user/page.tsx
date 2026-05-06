import { redirect } from 'next/navigation'

import { get_session_user, resolve_role_route } from '@/lib/auth/route'

export const dynamic = 'force-dynamic'

export default async function UserRedirectPage() {
  const session = await get_session_user()
  const role_route = await resolve_role_route({
    pathname: '/user',
    user_uuid: session.user_uuid,
    role: session.role,
    tier: session.tier,
  })

  if (role_route.redirect_to) {
    redirect(role_route.redirect_to)
  }

  redirect('/')
}
