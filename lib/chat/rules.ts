import 'server-only'

import type { archived_message } from './archive'

export function should_seed_initial_messages(
  archived_messages: archived_message[],
) {
  return archived_messages.length === 0
}
