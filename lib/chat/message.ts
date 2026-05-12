import 'server-only'

import { randomUUID } from 'crypto'

export type chat_locale = 'ja' | 'en' | 'es'

export type localized_text = string

type localized_content = Record<chat_locale, string>

export type bundle_sender = 'bot' | 'user' | 'concierge' | 'driver' | 'admin'

export type bundle_image = {
  src: string
  alt: string
}

export type quick_menu_item_key =
  | 'availability'
  | 'dispatch'
  | 'reservation'

export type welcome_bundle = {
  bundle_uuid: string
  bundle_type: 'welcome'
  sender: 'bot'
  version: 1
  locale: chat_locale
  content_key: 'initial.welcome'
  payload: {
    title: string
    text: string
  }
}

export type quick_menu_item = {
  key: quick_menu_item_key
  title: string
  description: string
  label: string
}

export type quick_menu_link = {
  key: string
  label: string
}

export type quick_menu_bundle = {
  bundle_uuid: string
  bundle_type: 'quick_menu'
  sender: 'bot'
  version: 1
  locale: chat_locale
  content_key: 'initial.quick_menu'
  payload: {
    title: string
    subtitle?: string
    image: bundle_image
    items: quick_menu_item[]
    support_heading?: string
    support_body?: string
    links?: quick_menu_link[]
  }
}

export type how_to_use_bundle = {
  bundle_uuid: string
  bundle_type: 'how_to_use'
  sender: 'bot'
  version: 1
  locale: chat_locale
  content_key: 'initial.how_to_use'
  payload: {
    title: string
    image: bundle_image
    steps: Array<{
      key: string
      title: string
      description: string
    }>
    notice_heading?: string
    notice_body?: string
    footer_link_label?: string
  }
}

export type faq_bundle = {
  bundle_uuid: string
  bundle_type: 'faq'
  sender: 'bot'
  version: 1
  locale: chat_locale
  content_key: 'initial.faq'
  payload: {
    title: string
    image: bundle_image
    items: Array<{
      key: string
      question: string
      answer: string
    }>
    primary_cta_label?: string
  }
}

export type initial_carousel_card =
  | quick_menu_bundle
  | how_to_use_bundle
  | faq_bundle

export type initial_carousel_bundle = {
  bundle_uuid: string
  bundle_type: 'initial_carousel'
  sender: 'bot'
  version: 1
  locale: chat_locale
  content_key: 'initial.carousel'
  cards: initial_carousel_card[]
}

export type text_bundle = {
  bundle_uuid: string
  bundle_type: 'text'
  sender: bundle_sender
  version: 1
  locale?: chat_locale
  content_key?: string
  metadata?: Record<string, unknown>
  payload: {
    text: string
  }
}

export type message_bundle =
  | welcome_bundle
  | initial_carousel_bundle
  | quick_menu_bundle
  | how_to_use_bundle
  | faq_bundle
  | text_bundle

function create_bundle_uuid() {
  return randomUUID()
}

function pick_text(
  content: localized_content,
  locale: chat_locale,
) {
  return content[locale] ?? content.ja
}

const initial_content = {
  welcome: {
    title: {
      ja: 'はじめまして',
      en: 'Nice to meet you',
      es: 'Mucho gusto',
    },
    text: {
      ja: 'ペットタクシーわんだにゃーへようこそ',
      en: 'Welcome to Pet Taxi Wandanya',
      es: 'Bienvenido a Pet Taxi Wandanya',
    },
  },
  quick_menu: {
    title: {
      ja: 'クイックメニュー',
      en: 'Quick Menu',
      es: 'Menu rapido',
    },
    subtitle: {
      ja: 'ご利用規約',
      en: 'Terms of use',
      es: 'Terminos de uso',
    },
    alt: {
      ja: 'クイックメニュー',
      en: 'Quick menu',
      es: 'Menu rapido',
    },
    items: [
      {
        key: 'availability' as const,
        title: {
          ja: '空車確認',
          en: 'Check availability',
          es: 'Comprobar disponibilidad',
        },
        description: {
          ja: '空車状況を確認します',
          en: 'Check vehicle availability.',
          es: 'Comprueba la disponibilidad del vehiculo.',
        },
        label: {
          ja: '空車確認',
          en: 'Check availability',
          es: 'Comprobar disponibilidad',
        },
      },
      {
        key: 'dispatch' as const,
        title: {
          ja: '配車を依頼する',
          en: 'Request a ride',
          es: 'Solicitar traslado',
        },
        description: {
          ja: '配車を依頼します',
          en: 'Request dispatch.',
          es: 'Solicita el traslado.',
        },
        label: {
          ja: '配車を依頼する',
          en: 'Request a ride',
          es: 'Solicitar traslado',
        },
      },
      {
        key: 'reservation' as const,
        title: {
          ja: '予約を確認する',
          en: 'Review reservation',
          es: 'Ver reserva',
        },
        description: {
          ja: '予約内容を確認します',
          en: 'Review your reservation details.',
          es: 'Revisa los detalles de tu reserva.',
        },
        label: {
          ja: '予約を確認する',
          en: 'Review reservation',
          es: 'Ver reserva',
        },
      },
    ],
    support_heading: {
      ja: '【合流サポート】',
      en: '[Meetup support]',
      es: '[Apoyo de encuentro]',
    },
    support_body: {
      ja:
        '当日は診察終了や空港手続き完了のタイミングに合わせ、\nドライバーがお客様とペットが確実に合流できるようサポートいたします。',
      en:
        'On the day, we align with clinic finish or airport procedures so the driver can meet you and your pet reliably.',
      es:
        'Ese dia coordinamos con el fin de la consulta o los tramites del aeropuerto para que el conductor os encuentre con fiabilidad.',
    },
    links: [
      {
        key: 'meetup_location',
        label: {
          ja: '合流地点を連絡する',
          en: 'Share meetup location',
          es: 'Comunicar punto de encuentro',
        },
      },
      {
        key: 'cancel_reservation',
        label: {
          ja: 'ご予約のキャンセル',
          en: 'Cancel reservation',
          es: 'Cancelar reserva',
        },
      },
    ],
  },
  how_to_use: {
    title: {
      ja: '使い方（ワンタップの流れ）',
      en: 'How to use (one-tap flow)',
      es: 'Uso (flujo de un toque)',
    },
    alt: {
      ja: '使い方',
      en: 'How to use',
      es: 'Como usar',
    },
    steps: [
      {
        key: 'step_1',
        title: {
          ja: '1) 「空車確認」をタップ',
          en: '1) Tap "Check availability"',
          es: '1) Toca "Comprobar disponibilidad"',
        },
        description: {
          ja: '',
          en: '',
          es: '',
        },
      },
      {
        key: 'step_2',
        title: {
          ja: '2) 可能なら「配車を依頼する」',
          en: '2) If available, tap "Request a ride"',
          es: '2) Si hay disponibilidad, toca "Solicitar traslado"',
        },
        description: {
          ja: '',
          en: '',
          es: '',
        },
      },
      {
        key: 'step_3',
        title: {
          ja: '3) 出発地・到着地・日時・ペット入力',
          en: '3) Enter pickup, drop-off, time, and pet details',
          es: '3) Introduce origen, destino, hora y mascota',
        },
        description: {
          ja: '',
          en: '',
          es: '',
        },
      },
      {
        key: 'step_4',
        title: {
          ja: '4) 内容確認して送信',
          en: '4) Review and send',
          es: '4) Revisa y envia',
        },
        description: {
          ja: '',
          en: '',
          es: '',
        },
      },
    ],
    notice_heading: {
      ja: '注意点',
      en: 'Notes',
      es: 'Notas',
    },
    notice_body: {
      ja:
        '・料金は時間帯・エリア・交通状況で変動\n・夜間・緊急は受付制限あり\n・キャンセル料が発生する場合あり',
      en:
        'Fares vary by time, area, and traffic.\nNight and urgent requests may be limited.\nCancellation fees may apply.',
      es:
        'Las tarifas varian segun hora, zona y trafico.\nPuede haber limites nocturnos o urgentes.\nPueden aplicarse tasas de cancelacion.',
    },
    footer_link_label: {
      ja: 'もっとご利用方法を見る',
      en: 'See more how to use',
      es: 'Ver mas sobre el uso',
    },
  },
  faq: {
    title: {
      ja: 'よくある質問',
      en: 'FAQ',
      es: 'Preguntas frecuentes',
    },
    alt: {
      ja: 'よくある質問',
      en: 'FAQ',
      es: 'Preguntas frecuentes',
    },
    items: [
      {
        key: 'payment',
        question: {
          ja: '支払い方法',
          en: 'Payment methods',
          es: 'Formas de pago',
        },
        answer: {
          ja: '',
          en: '',
          es: '',
        },
      },
      {
        key: 'pricing',
        question: {
          ja: '料金の仕組み',
          en: 'How pricing works',
          es: 'Como funciona el precio',
        },
        answer: {
          ja: '',
          en: '',
          es: '',
        },
      },
      {
        key: 'carrier_size',
        question: {
          ja: 'キャリー・サイズ制限',
          en: 'Carrier and size limits',
          es: 'Transportin y limites de tamano',
        },
        answer: {
          ja: '',
          en: '',
          es: '',
        },
      },
    ],
    primary_cta_label: {
      ja: 'すべてのFAQを開く',
      en: 'Open all FAQs',
      es: 'Abrir todas las FAQ',
    },
  },
} as const

export function build_initial_chat_bundles(input: {
  locale: chat_locale
}): message_bundle[] {
  const { locale } = input
  const quick_menu_card: quick_menu_bundle = {
    bundle_uuid: create_bundle_uuid(),
    bundle_type: 'quick_menu',
    sender: 'bot',
    version: 1,
    locale,
    content_key: 'initial.quick_menu',
    payload: {
      title: pick_text(initial_content.quick_menu.title, locale),
      subtitle: pick_text(initial_content.quick_menu.subtitle, locale),
      image: {
        src: '/images/LINE---quick-menu.jpg',
        alt: pick_text(initial_content.quick_menu.alt, locale),
      },
      items: initial_content.quick_menu.items.map((item) => ({
        key: item.key,
        title: pick_text(item.title, locale),
        description: pick_text(item.description, locale),
        label: pick_text(item.label, locale),
      })),
      support_heading: pick_text(
        initial_content.quick_menu.support_heading,
        locale,
      ),
      support_body: pick_text(
        initial_content.quick_menu.support_body,
        locale,
      ),
      links: initial_content.quick_menu.links.map((link) => ({
        key: link.key,
        label: pick_text(link.label, locale),
      })),
    },
  }
  const how_to_use_card: how_to_use_bundle = {
    bundle_uuid: create_bundle_uuid(),
    bundle_type: 'how_to_use',
    sender: 'bot',
    version: 1,
    locale,
    content_key: 'initial.how_to_use',
    payload: {
      title: pick_text(initial_content.how_to_use.title, locale),
      image: {
        src: '/images/LINE---how-yo-use.jpg',
        alt: pick_text(initial_content.how_to_use.alt, locale),
      },
      steps: initial_content.how_to_use.steps.map((step) => ({
        key: step.key,
        title: pick_text(step.title, locale),
        description: pick_text(step.description, locale),
      })),
      notice_heading: pick_text(
        initial_content.how_to_use.notice_heading,
        locale,
      ),
      notice_body: pick_text(
        initial_content.how_to_use.notice_body,
        locale,
      ),
      footer_link_label: pick_text(
        initial_content.how_to_use.footer_link_label,
        locale,
      ),
    },
  }
  const faq_card: faq_bundle = {
    bundle_uuid: create_bundle_uuid(),
    bundle_type: 'faq',
    sender: 'bot',
    version: 1,
    locale,
    content_key: 'initial.faq',
    payload: {
      title: pick_text(initial_content.faq.title, locale),
      image: {
        src: '/images/LINE---FAQ.jpg',
        alt: pick_text(initial_content.faq.alt, locale),
      },
      items: initial_content.faq.items.map((item) => ({
        key: item.key,
        question: pick_text(item.question, locale),
        answer: pick_text(item.answer, locale),
      })),
      primary_cta_label: pick_text(
        initial_content.faq.primary_cta_label,
        locale,
      ),
    },
  }

  return [
    {
      bundle_uuid: create_bundle_uuid(),
      bundle_type: 'welcome',
      sender: 'bot',
      version: 1,
      locale,
      content_key: 'initial.welcome',
      payload: {
        title: pick_text(initial_content.welcome.title, locale),
        text: pick_text(initial_content.welcome.text, locale),
      },
    },
    {
      bundle_uuid: create_bundle_uuid(),
      bundle_type: 'initial_carousel',
      sender: 'bot',
      version: 1,
      locale,
      content_key: 'initial.carousel',
      cards: [quick_menu_card, how_to_use_card, faq_card],
    },
  ]
}

const line_followup_ack_text: localized_content = {
  ja: 'メッセージを受け取りました',
  en: 'We received your message.',
  es: 'Hemos recibido tu mensaje.',
}

export function build_line_followup_ack_bundle(input: {
  locale: chat_locale
}): text_bundle {
  return {
    bundle_uuid: create_bundle_uuid(),
    bundle_type: 'text',
    sender: 'bot',
    version: 1,
    locale: input.locale,
    content_key: 'line.followup.ack',
    payload: {
      text: pick_text(line_followup_ack_text, input.locale),
    },
  }
}

export function build_user_text_bundle(input: {
  text: string
  locale?: chat_locale
  content_key?: string
  metadata?: Record<string, unknown>
}): text_bundle {
  return {
    bundle_uuid: create_bundle_uuid(),
    bundle_type: 'text',
    sender: 'user',
    version: 1,
    locale: input.locale,
    content_key: input.content_key,
    metadata: input.metadata,
    payload: {
      text: input.text,
    },
  }
}

export function build_staff_text_bundle(input: {
  text: string
  locale?: chat_locale
  sender: 'admin' | 'concierge'
  sender_display_name: string
}): text_bundle {
  return {
    bundle_uuid: create_bundle_uuid(),
    bundle_type: 'text',
    sender: input.sender,
    version: 1,
    locale: input.locale,
    content_key: 'admin.reception.reply',
    metadata: {
      sender_display_name: input.sender_display_name,
    },
    payload: {
      text: input.text,
    },
  }
}

const room_mode_switch_text: {
  bot: localized_content
  concierge: localized_content
} = {
  bot: {
    ja: 'ボット',
    en: 'BOT',
    es: 'BOT',
  },
  concierge: {
    ja: 'コンシェルジュ',
    en: 'Concierge',
    es: 'Concierge',
  },
}

export function build_room_mode_switch_bundle(input: {
  mode: 'bot' | 'concierge'
  locale: chat_locale
}): text_bundle {
  return build_user_text_bundle({
    text: pick_text(room_mode_switch_text[input.mode], input.locale),
    locale: input.locale,
    content_key: `room.mode.switch.${input.mode}`,
    metadata: {
      intent: 'switch_mode',
      mode: input.mode,
    },
  })
}

const room_mode_notice: {
  concierge_requested: localized_content
  resumed_bot: localized_content
} = {
  concierge_requested: {
    ja: 'コンシェルジュに切り替えました。担当者が確認します。',
    en: 'Switched to concierge. Our team will review this.',
    es: 'Cambiamos al concierge. Nuestro equipo lo revisara.',
  },
  resumed_bot: {
    ja: 'ボット応答に切り替えました。',
    en: 'Switched to bot replies.',
    es: 'Cambiamos a respuestas del bot.',
  },
}

export function pick_room_mode_notice_text(input: {
  notice: 'concierge_requested' | 'resumed_bot'
  locale: chat_locale
}): string {
  return pick_text(room_mode_notice[input.notice], input.locale)
}

export function build_room_mode_notice_bundle(input: {
  notice: 'concierge_requested' | 'resumed_bot'
  locale: chat_locale
}): text_bundle {
  return {
    bundle_uuid: create_bundle_uuid(),
    bundle_type: 'text',
    sender: 'bot',
    version: 1,
    locale: input.locale,
    content_key: `room.mode.${input.notice}`,
    payload: {
      text: pick_text(room_mode_notice[input.notice], input.locale),
    },
  }
}

export function build_room_mode_admin_accepted_bundle(input: {
  admin_display_name: string
  locale: chat_locale
}): text_bundle {
  const name = input.admin_display_name.trim() || 'Admin'
  const lines: localized_content = {
    ja: `${name} がコンシェルジュ対応を引き受けました。`,
    en: `${name} accepted.`,
    es: `${name} acepto.`,
  }

  return {
    bundle_uuid: create_bundle_uuid(),
    bundle_type: 'text',
    sender: 'bot',
    version: 1,
    locale: input.locale,
    content_key: 'room.mode.concierge_accepted',
    payload: {
      text: pick_text(lines, input.locale),
    },
  }
}
