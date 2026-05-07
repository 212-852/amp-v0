import 'server-only'

/**
 * Resolve optional ping for ACTION_TRACE webhook posts only.
 * Prefer DISCORD_DEBUG_MENTION_USER_ID (snowflake). Fallback: DISCORD_DEBUG_MENTION
 * as "<@id>", "<@!id>", plain snowflake, or arbitrary prefix (no allowed_mentions).
 */
function resolve_action_trace_mention(): {
  mention_prefix: string
  allowed_user_ids: string[]
} {
  const user_id_env = process.env.DISCORD_DEBUG_MENTION_USER_ID?.trim()

  if (user_id_env && /^\d{15,22}$/.test(user_id_env)) {
    return {
      mention_prefix: `<@${user_id_env}>\n`,
      allowed_user_ids: [user_id_env],
    }
  }

  const raw = process.env.DISCORD_DEBUG_MENTION?.trim()

  if (!raw) {
    return { mention_prefix: '', allowed_user_ids: [] }
  }

  const bracket = raw.match(/^<@!?(\d{15,22})>$/)

  if (bracket) {
    const id = bracket[1]

    return {
      mention_prefix: `<@${id}>\n`,
      allowed_user_ids: [id],
    }
  }

  if (/^\d{15,22}$/.test(raw)) {
    return {
      mention_prefix: `<@${raw}>\n`,
      allowed_user_ids: [raw],
    }
  }

  return {
    mention_prefix: `${raw}\n`,
    allowed_user_ids: [],
  }
}

export async function send_action_trace(
  event: string,
  payload: Record<string, unknown>,
) {
  const url =
    process.env.DISCORD_DEBUG_WEBHOOK_URL ||
    process.env.DISCORD_ACTION_WEBHOOK_URL

  if (!url) {
    return
  }

  const { mention_prefix, allowed_user_ids } = resolve_action_trace_mention()
  const json_block = JSON.stringify(payload, null, 2).slice(0, 1500)
  let content =
    `${mention_prefix}[ACTION_TRACE] ` +
    event +
    '\n```json\n' +
    json_block +
    '\n```'

  if (content.length > 2000) {
    content = content.slice(0, 1997) + '...'
  }

  const body: Record<string, unknown> = {
    content,
  }

  if (allowed_user_ids.length > 0) {
    body.allowed_mentions = {
      users: allowed_user_ids,
    }
  }

  await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => {})
}
