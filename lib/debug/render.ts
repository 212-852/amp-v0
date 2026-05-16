'use client'

export function render_debug(input: {
  category: string
  event: string
  level: 'info' | 'warn' | 'error'
  payload?: Record<string, unknown>
}) {
  void fetch('/api/debug/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      category: input.category,
      event: input.event,
      level: input.level,
      ...(input.payload ?? {}),
    }),
  }).catch(() => {})
}
