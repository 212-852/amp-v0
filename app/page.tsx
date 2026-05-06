import { WebChat } from '@/components/chat/web'
import SessionBootstrap from '@/components/session/bootstrap'
import type { initial_chat_result } from '@/lib/chat/action'

export const dynamic = 'force-dynamic'

function empty_user_home_chat(): initial_chat_result {
  return {
    room: {
      room_uuid: '',
      participant_uuid: '',
      bot_participant_uuid: '',
      user_uuid: null,
      visitor_uuid: '',
      channel: 'web',
    },
    is_new_room: false,
    is_seeded: false,
    messages: [],
  }
}

export default async function UserPage() {
  let chat_state: initial_chat_result

  try {
    const { load_user_home_chat } = await import('@/lib/chat/action')

    chat_state = await load_user_home_chat()
  } catch (error) {
    console.error('[root_page_chat_load_failed]', error)
    chat_state = empty_user_home_chat()
  }

  return (
    <>
      <SessionBootstrap enabled={chat_state.messages.length === 0} />
      <WebChat messages={chat_state.messages} />
    </>
  )
}
