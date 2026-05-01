import 'server-only'

export async function send_line_push_notify(input: {
  line_user_id: string
  message: string
}) {
  const access_token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN

  if (!access_token) {
    return
  }

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      to: input.line_user_id,
      messages: [
        {
          type: 'text',
          text: input.message,
        },
      ],
    }),
  })
}
