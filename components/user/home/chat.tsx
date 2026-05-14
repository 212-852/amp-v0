import { redirect } from 'next/navigation'

import { WebChat } from '@/components/chat/web'
import UserHomeChatBootstrap from '@/components/user/home/bootstrap'
import SessionBootstrap from '@/components/session/bootstrap'
import type { initial_chat_result } from '@/lib/chat/action'
import { get_session_user, resolve_role_route } from '@/lib/auth/route'

const page_copy = {
  reload_title: {
    ja: 'チャットの読み込みに失敗しました',
    en: 'Failed to load chat',
    es: 'No se pudo cargar el chat',
  },
  reload_body: {
    ja: '再読み込みしてもう一度お試しください。',
    en: 'Please reload and try again.',
    es: 'Vuelve a cargar e intentalo de nuevo.',
  },
  reload_label: {
    ja: '再試行',
    en: 'Retry',
    es: 'Reintentar',
  },
} as const

function empty_user_home_chat(): initial_chat_result {
  const empty_room = {
    room_uuid: '',
    participant_uuid: '',
    bot_participant_uuid: '',
    user_uuid: null,
    visitor_uuid: '',
    channel: 'web' as const,
    mode: 'bot' as const,
  }

  return {
    room: empty_room,
    room_uuid: empty_room.room_uuid,
    participant_uuid: empty_room.participant_uuid,
    mode: empty_room.mode,
    is_new_room: false,
    is_seeded: false,
    messages: [],
    locale: 'ja',
  }
}

type user_home_chat_props = {
  pathname: '/' | '/user'
}

export default async function UserHomeChat({
  pathname,
}: user_home_chat_props) {
  const session = await get_session_user()
  const role_route = await resolve_role_route({
    pathname,
    user_uuid: session.user_uuid,
    role: session.role,
    tier: session.tier,
  })

  if (role_route.redirect_to) {
    redirect(role_route.redirect_to)
  }

  let chat_state: initial_chat_result

  try {
    const { load_user_home_chat } = await import('@/lib/chat/action')

    chat_state = await load_user_home_chat()
  } catch (error) {
    console.error('[user_home_chat_load_failed]', error)
    chat_state = empty_user_home_chat()
  }

  return (
    <>
      <SessionBootstrap
        enabled={
          !chat_state.room.room_uuid && chat_state.messages.length === 0
        }
      />
      {chat_state.room.room_uuid ? (
        <WebChat
          messages={chat_state.messages}
          room_uuid={chat_state.room.room_uuid}
          participant_uuid={chat_state.room.participant_uuid}
          locale={chat_state.locale}
          mode={chat_state.room.mode}
        />
      ) : (
        <UserHomeChatBootstrap />
      )}
    </>
  )
}
