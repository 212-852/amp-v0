import type { reception_room_summary } from '@/lib/admin/reception/rules'

import AdminReceptionInboxItem from './inbox_item'

type AdminReceptionListProps = {
  rooms: reception_room_summary[]
  is_loading?: boolean
  empty_label?: string
}

export default function AdminReceptionList({
  rooms,
  is_loading,
  empty_label = '該当するルームはありません',
}: AdminReceptionListProps) {
  if (is_loading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-neutral-400">
        読み込み中...
      </div>
    )
  }

  if (rooms.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white text-sm text-neutral-400">
        {empty_label}
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-1">
      {rooms.map((room) => (
        <li key={room.room_uuid}>
          <AdminReceptionInboxItem room={room} variant="full" />
        </li>
      ))}
    </ul>
  )
}
