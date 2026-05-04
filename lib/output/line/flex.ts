import 'server-only'

import type {
  faq_bundle,
  how_to_use_bundle,
  initial_carousel_bundle,
  message_bundle,
  quick_menu_bundle,
  welcome_bundle,
} from '@/lib/chat/message'

export type line_api_message = Record<string, unknown>

function truncate(s: string, max: number) {
  if (s.length <= max) {
    return s
  }

  return `${s.slice(0, max - 1)}…`
}

function flex_text(
  text: string,
  options?: {
    weight?: string
    size?: string
    color?: string
    margin?: string
  },
): Record<string, unknown> {
  return {
    type: 'text',
    text: truncate(text, 2000),
    wrap: true,
    ...(options?.weight ? { weight: options.weight } : {}),
    ...(options?.size ? { size: options.size } : {}),
    ...(options?.color ? { color: options.color } : {}),
    ...(options?.margin ? { margin: options.margin } : {}),
  }
}

function flex_separator(): Record<string, unknown> {
  return { type: 'separator', margin: 'md' }
}

function flex_message_button(label: string, text: string, style: string) {
  return {
    type: 'button',
    style,
    height: 'sm',
    action: {
      type: 'message',
      label: truncate(label, 40),
      text: truncate(text, 300),
    },
  }
}

function bubble_hero(image_url: string | null): Record<string, unknown> | null {
  if (!image_url) {
    return null
  }

  return {
    type: 'image',
    url: image_url,
    size: 'full',
    aspectRatio: '20:13',
    aspectMode: 'cover',
  }
}

function build_quick_menu_bubble(
  bundle: quick_menu_bundle,
  absolute_url: (path: string) => string | null,
): Record<string, unknown> {
  const p = bundle.payload
  const image_url = absolute_url(p.image.src)

  const body_contents: Record<string, unknown>[] = [
    flex_text(p.title, { weight: 'bold', size: 'xl' }),
  ]

  if (p.subtitle) {
    body_contents.push(
      flex_text(p.subtitle, { size: 'sm', color: '#a1887f' }),
    )
  }

  if (p.support_heading || p.support_body) {
    body_contents.push(flex_separator())
  }

  if (p.support_heading) {
    body_contents.push(flex_text(p.support_heading, { weight: 'bold' }))
  }

  if (p.support_body) {
    body_contents.push(flex_text(p.support_body, { size: 'xs', color: '#666666' }))
  }

  const footer_buttons: Record<string, unknown>[] = []

  for (const item of p.items) {
    footer_buttons.push(
      flex_message_button(item.label, item.label, 'primary'),
    )
  }

  if (p.links) {
    for (const link of p.links) {
      footer_buttons.push(
        flex_message_button(link.label, link.label, 'link'),
      )
    }
  }

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: body_contents,
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: footer_buttons,
    },
  }

  const hero = bubble_hero(image_url)
  if (hero) {
    bubble.hero = hero
  }

  return bubble
}

function build_how_to_use_bubble(
  bundle: how_to_use_bundle,
  absolute_url: (path: string) => string | null,
): Record<string, unknown> {
  const p = bundle.payload
  const image_url = absolute_url(p.image.src)

  const body_contents: Record<string, unknown>[] = [
    flex_text(p.title, { weight: 'bold', size: 'xl' }),
  ]

  for (const step of p.steps) {
    const desc = step.description.trim()
    body_contents.push(
      flex_text(desc ? `${step.title}\n${desc}` : step.title, {
        size: 'sm',
      }),
    )
  }

  if (p.notice_heading || p.notice_body) {
    body_contents.push(flex_separator())
  }

  if (p.notice_heading) {
    body_contents.push(flex_text(p.notice_heading, { weight: 'bold' }))
  }

  if (p.notice_body) {
    body_contents.push(
      flex_text(p.notice_body, { size: 'xs', color: '#666666' }),
    )
  }

  const footer_contents: Record<string, unknown>[] = []

  if (p.footer_link_label) {
    footer_contents.push(
      flex_message_button(
        p.footer_link_label,
        p.footer_link_label,
        'link',
      ),
    )
  }

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: body_contents,
    },
  }

  if (footer_contents.length > 0) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: footer_contents,
    }
  }

  const hero = bubble_hero(image_url)
  if (hero) {
    bubble.hero = hero
  }

  return bubble
}

function build_faq_bubble(
  bundle: faq_bundle,
  absolute_url: (path: string) => string | null,
): Record<string, unknown> {
  const p = bundle.payload
  const image_url = absolute_url(p.image.src)

  const body_contents: Record<string, unknown>[] = [
    flex_text(p.title, { weight: 'bold', size: 'xl' }),
  ]

  for (const item of p.items) {
    const answer = item.answer.trim()
    if (answer) {
      body_contents.push(flex_text(item.question, { weight: 'bold', size: 'sm' }))
      body_contents.push(
        flex_text(answer, { size: 'xs', color: '#666666' }),
      )
    } else {
      body_contents.push(flex_text(item.question, { size: 'sm' }))
    }
  }

  const footer_buttons: Record<string, unknown>[] = []

  for (const item of p.items) {
    footer_buttons.push(
      flex_message_button(item.question, item.question, 'secondary'),
    )
  }

  if (p.primary_cta_label) {
    footer_buttons.push(
      flex_message_button(
        p.primary_cta_label,
        p.primary_cta_label,
        'primary',
      ),
    )
  }

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: body_contents,
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: footer_buttons,
    },
  }

  const hero = bubble_hero(image_url)
  if (hero) {
    bubble.hero = hero
  }

  return bubble
}

function is_welcome(b: message_bundle): b is welcome_bundle {
  return b.bundle_type === 'welcome'
}

function is_initial_carousel(
  b: message_bundle,
): b is initial_carousel_bundle {
  return b.bundle_type === 'initial_carousel'
}

function is_quick_menu(b: message_bundle): b is quick_menu_bundle {
  return b.bundle_type === 'quick_menu'
}

function is_how_to_use(b: message_bundle): b is how_to_use_bundle {
  return b.bundle_type === 'how_to_use'
}

function is_faq(b: message_bundle): b is faq_bundle {
  return b.bundle_type === 'faq'
}

export function build_seed_carousel_line_messages(input: {
  bundles: message_bundle[]
  absolute_url: (path: string) => string | null
}): { messages: line_api_message[]; flex_bubble_count: number } {
  const bundles = input.bundles

  if (bundles.length < 2) {
    throw new Error('expected welcome and initial_carousel bundles')
  }

  const welcome = bundles.find(is_welcome)
  const carousel_bundle = bundles.find(is_initial_carousel)
  const carousel_cards =
    carousel_bundle?.cards ??
    [
      bundles.find(is_quick_menu),
      bundles.find(is_how_to_use),
      bundles.find(is_faq),
    ].filter((card): card is quick_menu_bundle | how_to_use_bundle | faq_bundle =>
      Boolean(card),
    )
  const quick = carousel_cards.find(is_quick_menu)
  const how = carousel_cards.find(is_how_to_use)
  const faq = carousel_cards.find(is_faq)

  if (!welcome || !quick || !how || !faq) {
    throw new Error('missing welcome or initial carousel cards')
  }

  const welcome_message: line_api_message = {
    type: 'text',
    text: truncate(`${welcome.payload.title}\n${welcome.payload.text}`, 5000),
  }

  const bubbles = [
    build_quick_menu_bubble(quick, input.absolute_url),
    build_how_to_use_bubble(how, input.absolute_url),
    build_faq_bubble(faq, input.absolute_url),
  ]

  const alt_text = truncate(
    `Pet Taxi Wandanya / ${quick.payload.title}`,
    400,
  )

  const carousel: line_api_message = {
    type: 'flex',
    altText: alt_text,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  }

  return {
    messages: [welcome_message, carousel],
    flex_bubble_count: bubbles.length,
  }
}
