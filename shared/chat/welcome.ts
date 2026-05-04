import 'server-only'

import { randomUUID } from 'crypto'

import type { welcome_bundle } from '@/lib/chat/message'

export function build_welcome_bundle(): welcome_bundle {
  return {
    bundle_uuid: randomUUID(),
    bundle_type: 'welcome',
    sender: 'bot',
    version: 1,
    payload: {
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
  }
}
