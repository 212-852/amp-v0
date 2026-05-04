import 'server-only'

import { randomUUID } from 'crypto'

import { build_welcome_bundle } from '@/shared/chat/welcome'

export type chat_locale = 'ja' | 'en' | 'es'

export type localized_text = Record<chat_locale, string>

export type bundle_sender = 'bot' | 'user' | 'concierge' | 'driver' | 'admin'

export type bundle_image = {
  src: string
  alt: localized_text
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
  payload: {
    title: localized_text
    text: localized_text
  }
}

export type quick_menu_item = {
  key: quick_menu_item_key
  title: localized_text
  description: localized_text
  label: localized_text
}

export type quick_menu_link = {
  key: string
  label: localized_text
}

export type quick_menu_bundle = {
  bundle_uuid: string
  bundle_type: 'quick_menu'
  sender: 'bot'
  version: 1
  payload: {
    title: localized_text
    subtitle?: localized_text
    image: bundle_image
    items: quick_menu_item[]
    support_heading?: localized_text
    support_body?: localized_text
    links?: quick_menu_link[]
  }
}

export type how_to_use_bundle = {
  bundle_uuid: string
  bundle_type: 'how_to_use'
  sender: 'bot'
  version: 1
  payload: {
    title: localized_text
    image: bundle_image
    steps: Array<{
      key: string
      title: localized_text
      description: localized_text
    }>
    notice_heading?: localized_text
    notice_body?: localized_text
    footer_link_label?: localized_text
  }
}

export type faq_bundle = {
  bundle_uuid: string
  bundle_type: 'faq'
  sender: 'bot'
  version: 1
  payload: {
    title: localized_text
    image: bundle_image
    items: Array<{
      key: string
      question: localized_text
      answer: localized_text
    }>
    primary_cta_label?: localized_text
  }
}

export type text_bundle = {
  bundle_uuid: string
  bundle_type: 'text'
  sender: bundle_sender
  version: 1
  payload: {
    text: localized_text
  }
}

export type message_bundle =
  | welcome_bundle
  | quick_menu_bundle
  | how_to_use_bundle
  | faq_bundle
  | text_bundle

function create_bundle_uuid() {
  return randomUUID()
}

export function build_initial_chat_bundles(): message_bundle[] {
  return [
    build_welcome_bundle(),
    {
      bundle_uuid: create_bundle_uuid(),
      bundle_type: 'quick_menu',
      sender: 'bot',
      version: 1,
      payload: {
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
        image: {
          src: '/images/LINE---quick-menu.jpg',
          alt: {
            ja: 'クイックメニュー',
            en: 'Quick menu',
            es: 'Menu rapido',
          },
        },
        items: [
          {
            key: 'availability',
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
            key: 'dispatch',
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
            key: 'reservation',
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
    },
    {
      bundle_uuid: create_bundle_uuid(),
      bundle_type: 'how_to_use',
      sender: 'bot',
      version: 1,
      payload: {
        title: {
          ja: '使い方（ワンタップの流れ）',
          en: 'How to use (one-tap flow)',
          es: 'Uso (flujo de un toque)',
        },
        image: {
          src: '/images/LINE---how-yo-use.jpg',
          alt: {
            ja: '使い方',
            en: 'How to use',
            es: 'Como usar',
          },
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
    },
    {
      bundle_uuid: create_bundle_uuid(),
      bundle_type: 'faq',
      sender: 'bot',
      version: 1,
      payload: {
        title: {
          ja: 'よくある質問',
          en: 'FAQ',
          es: 'Preguntas frecuentes',
        },
        image: {
          src: '/images/LINE---FAQ.jpg',
          alt: {
            ja: 'よくある質問',
            en: 'FAQ',
            es: 'Preguntas frecuentes',
          },
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
    },
  ]
}
