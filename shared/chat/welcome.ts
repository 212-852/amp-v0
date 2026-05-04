import 'server-only'

import { randomUUID } from 'crypto'

import type {
  chat_locale,
  welcome_bundle,
} from '@/lib/chat/message'

export function build_welcome_bundle(
  locale: chat_locale = 'ja',
): welcome_bundle {
  return {
    bundle_uuid: randomUUID(),
    bundle_type: 'welcome',
    sender: 'bot',
    version: 1,
    locale,
    content_key: 'initial.welcome',
    payload: {
      title: 'はじめまして',
      text: 'ペットタクシーわんだにゃーへようこそ',
    },
  }
}
