import Image from 'next/image'
import Link from 'next/link'

import type { entry_redirect_reason } from '@/lib/driver/rules'
import { driver_recruitment_content } from '@/lib/recruitment/content'

const content = {
  no_line_message:
    '応募にはLINE連携が必要です。LINE連携を開始できない場合は、時間をおいて再度お試しください。',
} as const

type DriverEntryContentProps = {
  reason: entry_redirect_reason
}

function RecruitmentCard(input: {
  card: (typeof driver_recruitment_content.cards)[number]
}) {
  const card = input.card
  const is_hero = card.key === 'hero'

  return (
    <article className="flex h-[420px] w-[82vw] max-w-[330px] shrink-0 snap-center flex-col overflow-hidden rounded-[30px] bg-white text-[#201714] shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
      {is_hero && card.image ? (
        <div className="relative h-[290px] w-full overflow-hidden">
          <Image
            src={card.image.src}
            alt={card.image.alt}
            width={900}
            height={900}
            priority
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        </div>
      ) : null}
      <div
        className={[
          'flex flex-1 flex-col px-6 py-6',
          is_hero ? 'justify-center' : 'justify-between',
        ].join(' ')}
      >
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-normal text-[#201714]">
            {card.title}
          </h1>
          {card.subtitle ? (
            <p className="mt-3 text-[15px] font-semibold leading-relaxed text-[#806750]">
              {card.subtitle}
            </p>
          ) : null}
        </div>
        {card.items.length > 0 ? (
          <ul className="mt-6 flex flex-col gap-3">
            {card.items.map((item) => (
              <li
                key={item}
                className="rounded-[18px] bg-[#f6f0e9] px-4 py-3 text-[14px] font-semibold leading-relaxed text-[#4a3c33]"
              >
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  )
}

export default function DriverEntryContent({ reason }: DriverEntryContentProps) {
  return (
    <main className="min-h-screen bg-[#090807] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-0 py-8">
        <div className="px-6 pb-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#c9a77d]">
            Pet Taxi Wandanya
          </p>
          <h2 className="mt-2 text-[22px] font-bold leading-tight">
            {driver_recruitment_content.cards[0]?.title}
          </h2>
        </div>

        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-[9vw] pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {driver_recruitment_content.cards.map((card) => (
            <RecruitmentCard key={card.key} card={card} />
          ))}
        </div>

        {reason === 'no_line' ? (
          <p
            role="status"
            className="mx-6 mt-1 rounded-[20px] border border-amber-300/30 bg-amber-50/95 px-4 py-3 text-[13px] font-semibold leading-relaxed text-amber-950"
          >
            {content.no_line_message}
          </p>
        ) : null}

        <div className="sticky bottom-0 mt-3 bg-gradient-to-t from-[#090807] via-[#090807] to-transparent px-6 pb-3 pt-8">
          <Link
            href={driver_recruitment_content.apply_path}
            className="flex h-14 w-full items-center justify-center rounded-full bg-[#06C755] px-6 text-[16px] font-bold text-white shadow-[0_12px_28px_rgba(6,199,85,0.26)] transition-transform active:scale-[0.98]"
          >
            {driver_recruitment_content.cta_label}
          </Link>
        </div>
      </div>
    </main>
  )
}
