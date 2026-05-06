import { redirect } from 'next/navigation'

import { WebChat } from '@/components/chat/web'
import SessionBootstrap from '@/components/session/bootstrap'
import type { initial_chat_result } from '@/lib/chat/action'
import { get_session_user, resolve_role_route } from '@/lib/auth/route'

export const dynamic = 'force-dynamic'

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
  return {
    room: {
      room_uuid: '',
      participant_uuid: '',
      bot_participant_uuid: '',
      user_uuid: null,
      visitor_uuid: '',
      channel: 'web',
      mode: 'bot',
    },
    is_new_room: false,
    is_seeded: false,
    messages: [],
  }
}

export default async function UserPage() {
  const session = await get_session_user()
  const role_route = await resolve_role_route({
    pathname: '/',
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
    console.error('[root_page_chat_load_failed]', error)
    chat_state = empty_user_home_chat()
  }

  return (
    <>
      <SessionBootstrap
        enabled={
          chat_state.messages.length === 0 &&
          !chat_state.room.room_uuid
        }
      />
      {chat_state.messages.length > 0 ? (
        <WebChat messages={chat_state.messages} />
      ) : (
        <section className="px-5 pt-6">
          <div className="rounded-[20px] bg-white px-5 py-6 text-center shadow-[0_2px_14px_rgba(42,29,24,0.06)]">
            <p className="text-[16px] font-semibold text-[#2a1d18]">
              {page_copy.reload_title.ja}
            </p>
            <p className="mt-2 text-[13px] text-[#6f5b4d]">
              {page_copy.reload_body.ja}
            </p>
            <a
              href="/"
              className="mt-4 inline-flex rounded-full bg-[#c9a77d] px-5 py-2 text-[13px] font-semibold text-white"
            >
              {page_copy.reload_label.ja}
            </a>
          </div>
        </section>
      )}
    </>
  )
}
