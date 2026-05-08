/**
 * Cross-locale keyword dictionaries used by `decide_bot_action`.
 *
 * Single source of truth for non-switch-mode triggers.
 * Do not duplicate these lists in UI / API routes / webhook code.
 *
 * Switch-mode keywords live in lib/chat/rules.ts (`switch_mode_words`)
 * and are reused via `detect_switch_mode`.
 */

import type { bot_intent } from './types'

type intent_keyword_set = Exclude<bot_intent, 'switch_mode' | 'unknown'>

export const bot_intent_words: Record<intent_keyword_set, string[]> = {
  cancel_request: [
    'キャンセル',
    'キャンセルしたい',
    '取り消し',
    '取消',
    'cancel',
    'cancellation',
    'cancelar',
  ],
  handoff_request: [
    '緊急',
    '至急',
    '助けて',
    'たすけて',
    '困っています',
    'urgent',
    'help',
    'sos',
    'emergencia',
  ],
  booking_request: [
    '予約',
    '予約したい',
    '配車',
    '配車したい',
    '手配',
    'book',
    'booking',
    'reserve',
    'reservation',
    'reserva',
  ],
  availability_check: [
    '空き',
    '空車',
    '空き状況',
    '空いていますか',
    'availability',
    'available',
    'open slot',
    'disponibilidad',
  ],
  price_question: [
    '料金',
    '値段',
    '価格',
    'いくら',
    'price',
    'cost',
    'fare',
    'precio',
  ],
  airport_transfer: [
    '空港',
    '羽田',
    '成田',
    'airport',
    'haneda',
    'narita',
    'aeropuerto',
  ],
  hospital_transfer: [
    '病院',
    '動物病院',
    '通院',
    'hospital',
    'vet',
    'clinic',
    'veterinary',
    'veterinaria',
  ],
}

/**
 * Optional simple phrase patterns per non-switch intent.
 * Anchored at both ends after normalization.
 */
export const bot_intent_phrases: Partial<Record<intent_keyword_set, RegExp[]>> = {
  cancel_request: [/^(予約|配車).*?(キャンセル|取り消し|取消)$/, /^cancel\s+(my\s+)?(booking|reservation|trip)$/],
  handoff_request: [/^(オペレーター|担当者).*?(繋いで|つないで|呼んで)$/],
  booking_request: [
    /^(予約|配車).*?(したい|お願い|頼みたい|したい)$/,
    /^(book|reserve)\s+(a\s+)?(ride|car|trip)$/,
  ],
  availability_check: [
    /^(空き|空車).*?(ありますか|教えて|確認)$/,
    /^(is|are)\s+(there|you)\s+available\??$/,
  ],
  price_question: [
    /^(料金|値段|価格).*?(教えて|いくら|知りたい)$/,
    /^how\s+much\s+(does\s+it\s+cost|is\s+it)\??$/,
  ],
  airport_transfer: [
    /^(空港|羽田|成田).*?(送迎|まで|行き|送り)$/,
    /^(to|from)\s+(haneda|narita|the\s+airport)$/,
  ],
  hospital_transfer: [
    /^(動物病院|病院).*?(送迎|連れて|まで|送り)$/,
    /^to\s+(the\s+)?(vet|hospital|clinic)$/,
  ],
}
