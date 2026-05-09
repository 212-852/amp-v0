import UserHomeChat from '@/components/user/home/chat'

export const dynamic = 'force-dynamic'

export default async function UserRoutePage() {
  return <UserHomeChat pathname="/user" />
}
