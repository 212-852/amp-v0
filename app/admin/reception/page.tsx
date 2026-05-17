import AdminReceptionList from '@/components/admin/reception/list'
import { require_admin_route_access } from '@/lib/auth/route'
import { read_admin_reception } from '@/lib/admin/reception/action'
import { debug_event } from '@/lib/debug'
import {
  list_reception_rooms,
  type reception_room,
  type reception_room_mode,
} from '@/lib/admin/reception/room'

export const dynamic = 'force-dynamic'

type AdminReceptionPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function parse_mode(value: unknown): reception_room_mode {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'bot' ? 'bot' : 'concierge'
}

async function load_rooms(
  mode: reception_room_mode,
  state: 'open' | 'closed',
): Promise<{ ok: true; rooms: reception_room[] } | { ok: false; rooms: [] }> {
  if (state !== 'open') {
    return {
      ok: true,
      rooms: [],
    }
  }

  try {
    return {
      ok: true,
      rooms: await list_reception_rooms({ mode, limit: 50 }),
    }
  } catch (error) {
    console.error('[admin_reception_page] list_reception_rooms_failed', {
      mode,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      ok: false,
      rooms: [],
    }
  }
}

function serialize_error(error: unknown) {
  return {
    error_message: error instanceof Error ? error.message : String(error),
    error_code:
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code ?? null
        : null,
  }
}

async function load_reception_state(
  admin_user_uuid: string,
): Promise<'open' | 'closed'> {
  try {
    const reception = await read_admin_reception(admin_user_uuid)
    return reception.state
  } catch (error) {
    await debug_event({
      category: 'admin_management',
      event: 'reception_state_load_failed',
      payload: {
        admin_user_uuid,
        ...serialize_error(error),
      },
    })

    return 'closed'
  }
}

export default async function AdminReceptionPage({
  searchParams,
}: AdminReceptionPageProps) {
  const access = await require_admin_route_access('/admin/reception')
  const params = await searchParams
  const selected_mode = parse_mode(params?.mode)
  const reception_state = await load_reception_state(access.user_uuid)
  const result = await load_rooms(selected_mode, reception_state)

  return (
    <AdminReceptionList
      admin_user_uuid={access.user_uuid}
      initial_state={reception_state}
      initial_rooms={result.rooms}
      mode={selected_mode}
      load_ok={result.ok}
    />
  )
}
