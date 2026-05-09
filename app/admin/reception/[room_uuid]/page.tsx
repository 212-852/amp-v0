import Link from 'next/link'

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

function is_outgoing_message(message: reception_room_message): boolean {
  return (
    message.direction === 'outgoing' ||
    message.sender === 'admin' ||
    message.sender === 'bot' ||
    message.sender === 'system' ||
    message.role === 'admin' ||
    message.role === 'bot' ||
    message.role === 'system'
  )
}

function format_time(iso: string | null): string {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AdminReceptionRoomPage({
  params,
}: AdminReceptionRoomPageProps) {
  const { room_uuid } = await params
  const result = await load_room(room_uuid)
  const message_result = await load_messages(room_uuid)
  const room = result.room

  return (
    <div className="flex flex-col gap-4">
      <header>
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

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
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

        <div className="mt-5 flex flex-col gap-2">
          {!message_result.ok ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm font-medium text-neutral-500">
              メッセージを読み込めませんでした
            </div>
          ) : message_result.messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm font-medium text-neutral-500">
              メッセージはまだありません
            </div>
          ) : (
            <ol className="flex flex-col gap-2">
              {message_result.messages.map((message) => {
                const is_outgoing = is_outgoing_message(message)

                return (
                  <li
                    key={message.message_uuid}
                    className={`flex ${
                      is_outgoing ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                        is_outgoing
                          ? 'bg-emerald-600 text-white'
                          : 'bg-neutral-100 text-black'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">
                        {message.text}
                      </div>
                      <div
                        className={`mt-1 text-[10px] font-medium ${
                          is_outgoing ? 'text-emerald-50' : 'text-neutral-400'
                        }`}
                      >
                        {message.role ?? message.sender ?? 'message'}
                        {format_time(message.created_at)
                          ? ` - ${format_time(message.created_at)}`
                          : ''}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-center text-sm font-medium text-neutral-500">
          返信機能は次のステップで実装
        </div>
      </section>
    </div>
  )
}
