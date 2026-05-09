import Link from 'next/link'

import AdminChatTimeline from '@/components/admin/c'
import {
  list_reception_room_messages,
  read_reception_room,
  type reception_room,
  type reception_room_message,
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

export default async function AdminReceptionRoomPage({
  params,
}: AdminReceptionRoomPageProps) {
  const { room_uuid } = await params
  const result = await load_room(room_uuid)
  const message_result = await load_messages(room_uuid)
  const room = result.room

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 bg-neutral-100 pb-3">
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
          <span className="text-neutral-900">Room</span>
        </nav>
      </header>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="shrink-0 border-b border-neutral-200 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            room_uuid
          </div>
          <div className="mt-1 break-all font-mono text-[13px] font-semibold text-black">
            {room_uuid}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-xl bg-neutral-100 px-3 py-2">
              <div className="font-medium text-neutral-500">mode</div>
              <div className="mt-1 font-semibold text-black">
                {room?.mode ?? 'unknown'}
              </div>
            </div>
            <div className="rounded-xl bg-neutral-100 px-3 py-2">
              <div className="font-medium text-neutral-500">status</div>
              <div className="mt-1 font-semibold text-black">
                {result.ok ? (room ? 'found' : 'not found') : 'load failed'}
              </div>
            </div>
          </div>
        </div>

        <AdminChatTimeline
          messages={message_result.messages}
          load_failed={!message_result.ok}
        />

        <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-center text-sm font-medium text-neutral-500">
          返信機能は次のステップで実装
        </div>
      </section>
    </div>
  )
}
