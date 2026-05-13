import 'server-only'

/**
 * Single resolver for admin chat list customer title from users + identities
 * + participant. Identity JSON uses only keys present on rows (no invented
 * column names in SQL). Debug summaries expose key names and booleans only.
 */

export const admin_chat_unset_customer_label = '未設定ユーザー'

export type resolved_admin_chat_customer_source =
  | 'participants.display_name'
  | 'participants.nickname'
  | 'participants.label'
  | 'identities.line_profile'
  | 'users.display_name'
  | 'latest_user_message.sender_display_name'
  | 'unset'

export type admin_chat_identity_payload_shape_debug = {
  identity_columns_present: string[]
  json_keys_present: Record<string, string[]>
  provider: string | null
  has_profile_display_name: boolean
  has_metadata_display_name: boolean
  has_raw_user_meta_display_name: boolean
  has_provider_profile_display_name: boolean
  has_participant_display_name: boolean
}

const JSON_PROFILE_COLUMNS = [
  'profile',
  'metadata',
  'raw_user_meta_data',
  'provider_profile',
  'profile_json',
  'line_profile',
] as const

const KNOWN_JSON_COLUMN_SET = new Set<string>(JSON_PROFILE_COLUMNS)

type json_profile_column = (typeof JSON_PROFILE_COLUMNS)[number]

function trim_string(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parse_json_object(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value === 'string') {
    const t = value.trim()

    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t) as unknown

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
      } catch {
        return null
      }
    }
  }

  return null
}

function display_label_from_plain_object(
  obj: Record<string, unknown>,
): string | null {
  return (
    trim_string(obj.displayName) ??
    trim_string(obj.name) ??
    trim_string(obj.display_name)
  )
}

function display_name_from_json_column_value(value: unknown): string | null {
  const obj = parse_json_object(value)

  if (!obj) {
    return null
  }

  return display_label_from_plain_object(obj)
}

/**
 * Reads only columns that exist on the row. Tries known JSON blobs first
 * (profile, metadata, raw_user_meta_data, provider_profile, ...), then any
 * other object / JSON string fields.
 */
export function extract_identity_display_name_for_admin_rows(
  rows: Record<string, unknown>[],
): string | null {
  const sorted = [...rows].sort((a, b) => {
    const a_line = trim_string(a.provider)?.toLowerCase() === 'line' ? 0 : 1
    const b_line = trim_string(b.provider)?.toLowerCase() === 'line' ? 0 : 1

    return a_line - b_line
  })

  for (const row of sorted) {
    for (const col of JSON_PROFILE_COLUMNS) {
      if (!(col in row)) {
        continue
      }

      const label = display_name_from_json_column_value(row[col])

      if (label) {
        return label
      }
    }

    for (const [key, value] of Object.entries(row)) {
      if (
        key === 'user_uuid' ||
        key === 'provider' ||
        key === 'provider_id' ||
        key === 'identity_uuid' ||
        key === 'id' ||
        key === 'created_at' ||
        key === 'updated_at' ||
        KNOWN_JSON_COLUMN_SET.has(key)
      ) {
        continue
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = display_label_from_plain_object(
          value as Record<string, unknown>,
        )

        if (nested) {
          return nested
        }
      }

      if (typeof value === 'string' && value.trim().startsWith('{')) {
        const parsed = display_name_from_json_string_object(value)

        if (parsed) {
          return parsed
        }
      }
    }
  }

  return null
}

function display_name_from_json_string_object(raw: string): string | null {
  const obj = parse_json_object(raw)

  if (!obj) {
    return null
  }

  return display_label_from_plain_object(obj)
}

function object_has_display_name_key(obj: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(obj, 'displayName') ||
    Object.prototype.hasOwnProperty.call(obj, 'display_name')
  )
}

function object_has_name_key(obj: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(obj, 'name')
}

function summarize_column_shape(
  rows: Record<string, unknown>[],
  column: json_profile_column,
): { keys: string[]; has_display_name_key: boolean; has_name_key: boolean } {
  const keys = new Set<string>()
  let has_display_name_key = false
  let has_name_key = false

  for (const row of rows) {
    if (!(column in row)) {
      continue
    }

    const obj = parse_json_object(row[column])

    if (!obj) {
      continue
    }

    for (const k of Object.keys(obj)) {
      keys.add(k)
    }

    if (object_has_display_name_key(obj)) {
      has_display_name_key = true
    }

    if (object_has_name_key(obj)) {
      has_name_key = true
    }
  }

  return {
    keys: [...keys].sort(),
    has_display_name_key,
    has_name_key,
  }
}

export function summarize_admin_chat_identity_payload_shape(
  rows: Record<string, unknown>[],
  participant_display_name: string | null,
): admin_chat_identity_payload_shape_debug {
  const columns = new Set<string>()

  for (const row of rows) {
    for (const k of Object.keys(row)) {
      columns.add(k)
    }
  }

  const json_keys_present: Record<string, string[]> = {}
  let has_profile_display_name = false
  let has_metadata_display_name = false
  let has_raw_user_meta_display_name = false
  let has_provider_profile_display_name = false

  for (const col of JSON_PROFILE_COLUMNS) {
    const shape = summarize_column_shape(rows, col)
    json_keys_present[col] = shape.keys

    if (col === 'profile') {
      has_profile_display_name =
        shape.has_display_name_key || shape.has_name_key
    }

    if (col === 'metadata') {
      has_metadata_display_name =
        shape.has_display_name_key || shape.has_name_key
    }

    if (col === 'raw_user_meta_data') {
      has_raw_user_meta_display_name =
        shape.has_display_name_key || shape.has_name_key
    }

    if (col === 'provider_profile') {
      has_provider_profile_display_name =
        shape.has_display_name_key || shape.has_name_key
    }
  }

  let provider: string | null = null

  for (const row of rows) {
    provider = provider ?? trim_string(row.provider)

    if (provider) {
      break
    }
  }

  return {
    identity_columns_present: [...columns].sort(),
    json_keys_present,
    provider,
    has_profile_display_name,
    has_metadata_display_name,
    has_raw_user_meta_display_name,
    has_provider_profile_display_name,
    has_participant_display_name: Boolean(
      trim_string(participant_display_name),
    ),
  }
}

export function resolve_admin_chat_list_customer_display(input: {
  user: Record<string, unknown> | null | undefined
  identity_rows: Record<string, unknown>[] | null | undefined
  participant: {
    display_name?: string | null
    nickname?: string | null
    label?: string | null
  } | null
  latest_user_message_sender_display_name?: string | null
}): { title: string; source: resolved_admin_chat_customer_source } {
  const from_participant_display = trim_string(input.participant?.display_name)

  if (from_participant_display) {
    return {
      title: from_participant_display,
      source: 'participants.display_name',
    }
  }

  const from_participant_nickname = trim_string(input.participant?.nickname)

  if (from_participant_nickname) {
    return {
      title: from_participant_nickname,
      source: 'participants.nickname',
    }
  }

  const from_participant_label = trim_string(input.participant?.label)

  if (from_participant_label) {
    return {
      title: from_participant_label,
      source: 'participants.label',
    }
  }

  const from_identity = extract_identity_display_name_for_admin_rows(
    input.identity_rows ?? [],
  )

  if (from_identity) {
    return { title: from_identity, source: 'identities.line_profile' }
  }

  const user_display = trim_string(input.user?.['display_name'])

  if (user_display) {
    return { title: user_display, source: 'users.display_name' }
  }

  const from_latest_sender = trim_string(
    input.latest_user_message_sender_display_name,
  )

  if (from_latest_sender) {
    return {
      title: from_latest_sender,
      source: 'latest_user_message.sender_display_name',
    }
  }

  return { title: admin_chat_unset_customer_label, source: 'unset' }
}
