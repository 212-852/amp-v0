import { WebChat } from '@/components/chat/web'
import { load_user_home_chat } from '@/lib/chat/action'

export default async function UserPage() {
  const chat_state = await load_user_home_chat()

  return <WebChat messages={chat_state.messages} />
}
