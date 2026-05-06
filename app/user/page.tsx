import UserHomeChat from '@/components/user/home_chat'

export const dynamic = 'force-dynamic'

export default async function UserRoutePage() {
  return <UserHomeChat pathname="/user" />
}
