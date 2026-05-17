import Link from 'next/link'

import DriverEntryActions from '@/components/driver/entry_actions'
import type { entry_redirect_reason } from '@/lib/driver/rules'

const content = {
  title: 'ドライバー募集',
  overview:
    'ペットの送迎・同伴サポートを担うドライバー募集ページです。LINE連携後に応募フォームへ進み、審査・書類確認を経て登録となります。',
  requirements_title: '応募条件',
  requirements: [
    '普通自動車免許（AT可）をお持ちの方',
    'ペットへの接客・配慮ができる方',
    'スマートフォンでの連絡・ナビ利用ができる方',
  ],
  work_style_title: 'お仕事のスタイル',
  work_style: [
    '希望シフトに応じた送迎・同伴サポート',
    '案件ごとの案内とサポート',
    '登録後はドライバー専用ページから確認',
  ],
  flow_title: '応募の流れ',
  flow_steps: [
    'LINE連携',
    '応募フォーム',
    'AI/運営審査',
    '書類確認',
    '登録',
  ],
  no_line_message:
    '応募にはLINE連携が必要です。LINE連携後に応募フォームへ進んでください。',
  cta_apply: '応募フォームへ進む',
  cta_line: 'LINE連携する',
} as const

type DriverEntryContentProps = {
  reason: entry_redirect_reason
}

export default function DriverEntryContent({ reason }: DriverEntryContentProps) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Driver recruitment
        </p>
        <h1 className="text-2xl font-semibold leading-tight text-black">
          {content.title}
        </h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          {content.overview}
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <h2 className="text-sm font-semibold text-black">
          {content.requirements_title}
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
          {content.requirements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <h2 className="text-sm font-semibold text-black">
          {content.work_style_title}
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
          {content.work_style.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <h2 className="text-sm font-semibold text-black">{content.flow_title}</h2>
        <ol className="flex flex-col gap-3">
          {content.flow_steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-sm text-neutral-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
                {index + 1}
              </span>
              <span className="pt-0.5 font-medium text-black">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {reason === 'no_line' ? (
        <p
          role="status"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-relaxed text-amber-900"
        >
          {content.no_line_message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <DriverEntryActions />
        <Link
          href="/apply"
          className="inline-flex h-12 items-center justify-center rounded-full bg-black px-6 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
        >
          {content.cta_apply}
        </Link>
      </div>
    </div>
  )
}
