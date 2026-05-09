import Link from 'next/link'

import { load_archived_messages } from '@/lib/chat/archive'
import { list_room_presence } from '@/lib/chat/presence/action'

function typing_label(
  participants: Array<{ display_name: string }>,
) {
  if (participants.length === 0) {
    return null
  }

  if (participants.length === 1) {
    return `${participants[0].display_name} が入力中...`
  }

  return `${participants
    .slice(0, 2)
    .map((participant) => participant.display_name)
    .join(' と ')} が入力中...`
}

function message_text(message: Awaited<ReturnType<typeof load_archived_messages>>[number]) {
  if (message.bundle.bundle_type === 'text') {
    return message.bundle.payload.text
  }

  return `[${message.bundle.bundle_type}]`
}

export const dynamic = 'force-dynamic'

export default async function AdminReceptionRoomPage({
  params,
}: {
  params: Promise<{ room_uuid: string }>
}) {
  const { room_uuid } = await params
  const [presence, messages] = await Promise.all([
    list_room_presence({ room_uuid }),
    load_archived_messages(room_uuid).catch(() => []),
  ])
  const typing = typing_label(presence.typing_participants)

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <header className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/admin/reception"
              className="text-[12px] font-semibold text-neutral-500 hover:text-black"
            >
              受付一覧へ
            </Link>
            <h1 className="mt-1 truncate text-base font-semibold text-black">
              Room {room_uuid.slice(0, 8)}
            </h1>
            {typing ? (
              <p className="mt-1 text-[12px] font-semibold text-amber-700">
                {typing}
              </p>
            ) : null}
          </div>
          <div className="flex max-w-[55%] flex-wrap justify-end gap-1">
            {presence.active_participants.map((participant) => (
              <span
                key={participant.participant_uuid}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-700"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {participant.display_name}
                <span className="text-neutral-400">/{participant.role}</span>
              </span>
            ))}
          </div>
        </div>
      </header>

      <section className="min-h-0 rounded-2xl border border-neutral-200 bg-white p-3">
        <div className="flex flex-col gap-2">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">
              メッセージはまだありません
            </p>
          ) : (
            messages.slice(-30).map((message) => (
              <article
                key={message.archive_uuid}
                className="rounded-xl bg-neutral-50 px-3 py-2"
              >
                <div className="text-[11px] text-neutral-400">
                  {new Date(message.created_at).toLocaleString('ja-JP')}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
                  {message_text(message)}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
