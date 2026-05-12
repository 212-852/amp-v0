import Link from 'next/link'

import AdminChatTimeline from '@/components/admin/c'
import AdminHandoffMemo from '@/components/admin/memo'
import {
  list_reception_room_messages,
  read_reception_room_memo,
  read_reception_room,
  resolve_room_subject,
  type reception_room,
  type reception_room_memo,
  type reception_room_message,
  type reception_room_subject,
} from '@/lib/admin/reception/room'

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

async function load_subject(
  room_uuid: string,
): Promise<reception_room_subject> {
  try {
    return await resolve_room_subject(room_uuid)
  } catch (error) {
    console.error('[admin_reception_room_page] resolve_subject_failed', {
      room_uuid,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      display_name: 'ゲスト',
      role: 'user',
      tier: 'guest',
      user_uuid: null,
      visitor_uuid: null,
    }
  }
}

async function load_memo(room_uuid: string): Promise<reception_room_memo> {
  try {
    return await read_reception_room_memo({ room_uuid })
  } catch (error) {
    console.error('[admin_reception_room_page] read_memo_failed', {
      room_uuid,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      room_uuid,
      handoff_memo: '',
      handoff_memo_updated_at: null,
      handoff_memo_updated_by: null,
    }
  }
}

export default async function AdminReceptionRoomPage({
  params,
}: AdminReceptionRoomPageProps) {
  const { room_uuid } = await params
  const room_result = await load_room(room_uuid)
  const subject = await load_subject(room_uuid)
  const memo = await load_memo(room_uuid)
  const message_result = await load_messages(room_uuid)
  const room = room_result.room

  return (
    <div className="-mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
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
            {subject.display_name}
          </span>
        </nav>
      </header>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="shrink-0 border-b border-neutral-200 px-6 py-4">
          <div className="flex flex-col gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-semibold leading-tight text-black">
                {subject.display_name}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-neutral-500">
                <span>
                  {subject.role ?? 'user'} / {subject.tier ?? 'guest'}
                </span>
                {room?.mode ? (
                  <>
                    <span aria-hidden>{'/'}</span>
                    <span>{room.mode}</span>
                  </>
                ) : null}
                <span aria-hidden>{'/'}</span>
                <span className="font-mono">{room_uuid.slice(0, 8)}</span>
              </div>
            </div>
            <AdminHandoffMemo
              room_uuid={room_uuid}
              initial_memo={memo.handoff_memo}
              initial_updated_at={memo.handoff_memo_updated_at}
            />
          </div>
        </div>

        <AdminChatTimeline
          messages={message_result.messages}
          load_failed={!message_result.ok}
        />

        <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-6 py-3 text-center text-sm font-medium text-neutral-500">
          返信機能は次のステップで実装
        </div>
      </section>
    </div>
  )
}
