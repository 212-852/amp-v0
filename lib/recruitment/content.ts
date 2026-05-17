export type recruitment_card_key =
  | 'hero'
  | 'overview'
  | 'requirements'
  | 'compensation'
  | 'flow'

export type recruitment_card = {
  key: recruitment_card_key
  title: string
  subtitle?: string
  image?: {
    src: string
    alt: string
  }
  items: string[]
}

export const recruitment_image_path = '/images/LINE---recruit.jpg'
export const recruitment_apply_path = '/apply'
export const recruitment_entry_path = '/entry'
export const recruitment_cta_label = '応募フォームへ'

export const driver_recruitment_cards: recruitment_card[] = [
  {
    key: 'hero',
    title: 'ドライバー募集',
    subtitle: 'ペットタクシーわんだにゃー',
    image: {
      src: recruitment_image_path,
      alt: 'ドライバー募集',
    },
    items: [],
  },
  {
    key: 'overview',
    title: '案件概要',
    items: [
      'ペット送迎、接客、車両清掃、安全管理',
      '1日1〜3件',
      '神奈川県、東京、周辺エリア、長距離',
    ],
  },
  {
    key: 'requirements',
    title: '応募資格',
    items: [
      '軽貨物車両または黒ナンバー車両',
      '個人事業主',
      'ペットへの配慮ができる方',
      'スマートフォンで連絡・ナビ利用ができる方',
    ],
  },
  {
    key: 'compensation',
    title: '報酬',
    items: [
      '案件・シフトに応じて報酬をお支払い',
      '詳細はエントリー後に案内',
    ],
  },
  {
    key: 'flow',
    title: 'エントリー導線',
    items: ['LINE連携', '応募フォーム入力', '審査', '書類確認', '登録'],
  },
]

export const driver_recruitment_content = {
  image_path: recruitment_image_path,
  apply_path: recruitment_apply_path,
  entry_path: recruitment_entry_path,
  cta_label: recruitment_cta_label,
  cards: driver_recruitment_cards,
} as const
