export type save_reception_room_memo_result =
  | {
      ok: true
      memo: string
      updated_at: string | null
    }
  | {
      ok: false
      error: string
    }

type memo_response = {
  ok: boolean
  memo?: string
  updated_at?: string | null
  error?: string
}

export async function save_reception_room_memo({
  room_uuid,
  memo,
}: {
  room_uuid: string
  memo: string
}): Promise<save_reception_room_memo_result> {
  const response = await fetch(`/api/admin/reception/${room_uuid}/memo`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memo }),
  })

  const payload = (await response.json().catch(() => null)) as
    | memo_response
    | null

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      error: payload?.error ?? 'memo_update_failed',
    }
  }

  return {
    ok: true,
    memo: payload.memo ?? '',
    updated_at: payload.updated_at ?? null,
  }
}
