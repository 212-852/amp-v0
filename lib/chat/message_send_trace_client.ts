export async function post_message_send_trace_pair(input: {
  chat_event: string
  user_event: string
  payload: Record<string, unknown>
}) {
  try {
    await fetch('/api/debug/message_send_trace', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_event: input.chat_event,
        user_event: input.user_event,
        payload: input.payload,
      }),
    })
  } catch {
    /* non-blocking */
  }
}
