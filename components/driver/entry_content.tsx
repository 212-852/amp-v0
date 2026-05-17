import Image from 'next/image'
import Link from 'next/link'

import DriverEntryActions from '@/components/driver/entry_actions'
import type { entry_redirect_reason } from '@/lib/driver/rules'
import {
  resolve_recruitment_apply_url,
  resolve_recruitment_entry_url,
} from '@/lib/recruitment/rules'

const content = {
  eyebrow: 'Driver recruitment',
  title: 'ドライバー募集',
  summary:
    'ペットタクシーわんだにゃーでは、大切なペットとご家族をお迎え・お届けするドライバー様を募集しています。',
  overview_title: '案件概要',
  overview_body:
    '愛犬・愛猫の送迎・同伴サポート\n案件ごとの案内とサポート\nスマートフォンでの連絡・ナビ利用',
  requirements_title: '応募資格',
  requirements_body:
    '普通自動車免許（AT可）をお持ちの方\nペットへの接客・配慮ができる方\nスマートフォンでの連絡・ナビ利用ができる方',
  compensation_title: '報酬',
  compensation_body:
    '案件・シフトに応じた報酬をお支払いします。詳細はエントリー後にご案内いたします。',
  flow_title: 'エントリー導線',
  flow_steps: [
    'エントリーフォームで基本情報を送信',
    'LINE連携で本人確認',
    '応募フォームで詳細を入力',
    '審査・書類確認のち登録',
  ],
  no_line_message:
    '応募にはLINE連携が必要です。LINE連携後に応募フォームへ進んでください。',
  cta_entry: 'エントリーフォームへ',
  cta_apply: '応募フォームへ進む',
} as const

type DriverEntryContentProps = {
  reason: entry_redirect_reason
}

function SectionCard(input: {
  title: string
  body: string
  dark?: boolean
}) {
  return (
    <section
      className={[
        'flex flex-col gap-3 rounded-[24px] px-5 py-5 shadow-[0_3px_18px_rgba(42,29,24,0.08)]',
        input.dark
          ? 'bg-[#1a1411] text-white'
          : 'border border-[#f0e6dc] bg-white text-[#2a1d18]',
      ].join(' ')}
    >
      <h2
        className={[
          'text-sm font-semibold tracking-wide',
          input.dark ? 'text-[#e8d5c4]' : 'text-[#9c7d5d]',
        ].join(' ')}
      >
        {input.title}
      </h2>
      <p
        className={[
          'whitespace-pre-line text-sm leading-relaxed',
          input.dark ? 'text-white/90' : 'text-[#5f4f43]',
        ].join(' ')}
      >
        {input.body}
      </p>
    </section>
  )
}

export default function DriverEntryContent({ reason }: DriverEntryContentProps) {
  const entry_url = resolve_recruitment_entry_url()
  const apply_url = resolve_recruitment_apply_url()

  return (
    <div className="min-h-screen bg-[#120e0c] pb-12">
      <div className="mx-auto flex w-full max-w-lg flex-col">
        <div className="relative overflow-hidden">
          <Image
            src="/images/LINE---recruit.jpg"
            alt={content.title}
            width={1200}
            height={780}
            priority
            className="h-[220px] w-full object-cover sm:h-[260px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#120e0c] via-[#120e0c]/35 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d4b896]">
              {content.eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight text-white">
              {content.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/85">
              {content.summary}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 pt-6">
          <SectionCard title={content.overview_title} body={content.overview_body} />
          <SectionCard
            title={content.requirements_title}
            body={content.requirements_body}
          />
          <SectionCard
            title={content.compensation_title}
            body={content.compensation_body}
            dark
          />

          <section className="flex flex-col gap-4 rounded-[24px] border border-[#f0e6dc] bg-white px-5 py-5 shadow-[0_3px_18px_rgba(42,29,24,0.08)]">
            <h2 className="text-sm font-semibold text-[#9c7d5d]">
              {content.flow_title}
            </h2>
            <ol className="flex flex-col gap-3">
              {content.flow_steps.map((step, index) => (
                <li
                  key={step}
                  className="flex items-start gap-3 text-sm text-[#5f4f43]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#c9a77d] text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="pt-1 font-medium text-[#2a1d18]">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {reason === 'no_line' ? (
            <p
              role="status"
              className="rounded-[20px] border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm font-medium leading-relaxed text-amber-950"
            >
              {content.no_line_message}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 pt-1">
            <a
              href={entry_url}
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#c9a77d] px-6 text-sm font-semibold text-white shadow-[0_2px_10px_rgba(42,29,24,0.18)] transition-transform active:scale-[0.98]"
            >
              {content.cta_entry}
            </a>
            <DriverEntryActions />
            <Link
              href={apply_url}
              className="inline-flex h-12 items-center justify-center rounded-full border border-[#c9a77d] bg-white px-6 text-sm font-semibold text-[#9c7d5d] transition-transform active:scale-[0.98]"
            >
              {content.cta_apply}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
