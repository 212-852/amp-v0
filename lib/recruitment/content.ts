export type recruitment_card_key =
  | 'recruitment'
  | 'work'
  | 'requirements'
  | 'style'
  | 'flow'

export type recruitment_card = {
  key: recruitment_card_key
  title: string
  body: string
}

export const recruitment_image_path = '/images/LINE---recruit.jpg'
export const recruitment_apply_path = '/apply'
export const recruitment_entry_path = '/entry'
export const recruitment_cta_label = '応募フォームへ'

export const driver_recruitment_page = {
  title: 'ペットタクシードライバー募集',
  subtitle: 'ペットとご家族の移動を、やさしく支えるお仕事です。',
  intro:
    '未経験でも、ペットへの思いやりと安全運転を大切にできる方を歓迎します。',
  no_line_message:
    '応募にはLINE連携が必要です。ボタンから連携後、そのまま応募フォームへ進めます。',
} as const

export const driver_recruitment_cards: recruitment_card[] = [
  {
    key: 'recruitment',
    title: 'ドライバー募集',
    body: 'ペットとご家族の移動を支えるパートナーを募集しています。',
  },
  {
    key: 'work',
    title: 'お仕事内容',
    body: 'ペット送迎、同乗サポート、車内清掃、安全確認など。',
  },
  {
    key: 'requirements',
    title: '応募しやすい条件',
    body: '普通免許とスマートフォンがあれば応募できます。ペットにやさしく接する気持ちを大切にしています。',
  },
  {
    key: 'style',
    title: '働き方',
    body: '案件ごとに相談しながら進めます。無理のない範囲でスタートできます。',
  },
  {
    key: 'flow',
    title: '応募の流れ',
    body: 'LINE連携後、応募フォームに進みます。内容確認後、担当者よりご案内します。',
  },
]

export const driver_recruitment_content = {
  image_path: recruitment_image_path,
  apply_path: recruitment_apply_path,
  entry_path: recruitment_entry_path,
  cta_label: recruitment_cta_label,
  page: driver_recruitment_page,
  cards: driver_recruitment_cards,
} as const
