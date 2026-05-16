import Link from 'next/link'

import AdminReceptionActiveSummary from '@/components/admin/reception/active_summary'
import AdminChatTimeline from '@/components/admin/c'
import { AdminRenderProbe } from '@/components/admin/render_probe'
import AdminHandoffMemo from '@/components/admin/memo'
import { get_session_user, require_admin_route_access } from '@/lib/auth/route'
import {
  list_reception_room_messages,
  read_reception_room,
  type reception_room,
  type reception_room_message,
} from '@/lib/admin/reception/room'
import { customer_display_name_fallback } from '@/lib/chat/identity/customer_display_name'
import { list_handoff_memos, type handoff_memo } from '@/lib/chat/action'
import { resolve_admin_reception_send_context } from '@/lib/chat/room'
import { resolve_handoff_memo_saved_by_name } from '@/lib/admin/profile'
import { mark_reception_room_read_for_admin } from '@/lib/chat/room/admin_unread'

export const dynamic = 'force-dynamic'

type AdminReceptionRoomPageProps = {
  params: Promise<{ room_uuid: string }>
}

async function load_room(
  room_uuid: string,
): Promise<{ ok: true; room: reception_room | null } | { ok: false; room: null }> {
  try {
    return {
      ok: true,
      room: await read_reception_room({ room_uuid }),
    }
  } catch (error) {
    console.error('[admin_reception_room_page] get_reception_room_failed', {
      room_uuid,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      ok: false,
      room: null,
    }
  }
}

async function load_messages(
  room_uuid: string,
): Promise<
  | { ok: true; messages: reception_room_message[] }
  | { ok: false; messages: [] }
> {
  try {
    return {
      ok: true,
      messages: await list_reception_room_messages({ room_uuid }),
    }
  } catch (error) {
    console.error('[admin_reception_room_page] list_messages_failed', {
      room_uuid,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      ok: false,
      messages: [],
    }
  }
}

async function load_memos(room_uuid: string): Promise<handoff_memo[]> {
  const session = await get_session_user()

  try {
    return await list_handoff_memos({
      room_uuid,
      debug: {
        user_uuid: session.user_uuid,
        role: session.role,
        tier: session.tier,
        source_channel: 'web',
      },
    })
  } catch (error) {
    console.error('[admin_reception_room_page] list_memos_failed', {
      room_uuid,
      error: error instanceof Error ? error.message : String(error),
    })

    return []
  }
}

export default async function AdminReceptionRoomPage({
  params,
}: AdminReceptionRoomPageProps) {
  const { room_uuid } = await params
  const access = await require_admin_route_access('/admin/reception')
  await mark_reception_room_read_for_admin({
    room_uuid,
    actor_admin_user_uuid: access.user_uuid,
  })
  const send_context = await resolve_admin_reception_send_context({
    room_uuid,
    staff_user_uuid: access.user_uuid,
  })
  const staff_participant_uuid = send_context.ok
    ? send_context.data.staff_participant_uuid
    : ''
  const staff_display_name = await resolve_handoff_memo_saved_by_name(
    access.user_uuid,
  )
  const room_result = await load_room(room_uuid)
  const memos = await load_memos(room_uuid)
  const message_result = await load_messages(room_uuid)
  const room = room_result.room
  const customer_display_name =
    room?.display_name?.trim() || customer_display_name_fallback

  return (
    <div
      className="-mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
      data-debug-component="app/admin/reception/[room_uuid]/page.tsx"
    >
      <AdminRenderProbe file_path="app/admin/reception/[room_uuid]/page.tsx" />
      <div data-debug-component="app/admin/reception/[room_uuid]/page.tsx">
        DEBUG_ADMIN_CHAT_COMPONENT_app/admin/reception/[room_uuid]/page.tsx
      </div>
      <header className="shrink-0 border-b border-neutral-200 bg-white px-6 py-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-500"
        >
          <Link href="/admin" className="transition-colors hover:text-black">
            Home
          </Link>
          <span aria-hidden>{'>'}</span>
          <Link
            href="/admin/reception"
            className="transition-colors hover:text-black"
          >
            チャット一覧
          </Link>
          <span aria-hidden>{'>'}</span>
          <span className="truncate text-neutral-900">
            {customer_display_name}
          </span>
        </nav>
      </header>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="shrink-0 border-b border-neutral-200 px-6 py-4">
          <div className="flex flex-col gap-3">
            <AdminReceptionActiveSummary
              room_uuid={room_uuid}
              room={room}
              customer_display_name={customer_display_name}
              staff_user_uuid={access.user_uuid}
              staff_tier={access.tier}
              staff_participant_uuid={staff_participant_uuid}
            />
            <AdminHandoffMemo
              room_uuid={room_uuid}
              initial_memos={memos}
            />
          </div>
        </div>

        {/*
          Reception room chat timeline (client): components/admin/c.tsx -> AdminChatTimeline.
          Realtime for this UI must live in that module, not components/chat/web.tsx.
        */}
        <AdminChatTimeline
          key={room_uuid}
          messages={message_result.messages}
          load_failed={!message_result.ok}
          room_uuid={room_uuid}
          staff_participant_uuid={staff_participant_uuid}
          staff_display_name={staff_display_name}
          staff_user_uuid={access.user_uuid}
          staff_tier={access.tier}
          room_display_title={customer_display_name}
        />
      </section>
    </div>
  )
}
