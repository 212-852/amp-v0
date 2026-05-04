import 'server-only'

type line_reply_message = {
  type: string
  text?: string
}

export async function send_line_reply(input: {
  reply_token: string
  messages: line_reply_message[]
}) {
  const access_token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN

  if (!access_token) {
    throw new Error('missing LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')
  }

  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      replyToken: input.reply_token,
      messages: input.messages,
    }),
  })

  if (!response.ok) {
    const body_text = await response.text()
    throw new Error(`line reply failed: ${response.status} ${body_text}`)
  }
}

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
