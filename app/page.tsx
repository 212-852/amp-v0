import { WebChat } from '@/components/chat/web'
import SessionBootstrap from '@/components/session/bootstrap'
import { load_user_home_chat } from '@/lib/chat/action'

export default async function UserPage() {
  const chat_state = await load_user_home_chat()

  return (
    <>
      <SessionBootstrap enabled={chat_state.messages.length === 0} />
      <WebChat messages={chat_state.messages} />
    </>
  )
}
