'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import type { entry_redirect_reason } from '@/lib/driver/rules'
import {
  driver_recruitment_content,
  type recruitment_card,
} from '@/lib/recruitment/content'

const content = {
  cta_pending: '準備中...',
} as const

type DriverEntryViewProps = {
  reason: entry_redirect_reason
  line_linked: boolean
}

function RecruitmentCard({
  card,
  index,
}: {
  card: recruitment_card
  index: number
}) {
  return (
    <article
      data-card-index={index}
      className="flex h-[390px] w-[82vw] max-w-[320px] shrink-0 snap-center flex-col overflow-hidden rounded-[24px] border border-neutral-200 bg-white text-neutral-900 shadow-sm"
    >
      {card.image ? (
        <div className="h-[184px] w-full overflow-hidden bg-neutral-100">
          <Image
            src={card.image.src}
            alt={card.image.alt}
            width={900}
            height={700}
            priority={index === 0}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col justify-between px-6 py-6">
        <h2 className="text-[22px] font-semibold leading-tight tracking-normal">
          {card.title}
        </h2>
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-neutral-600">
          {card.body}
        </p>
      </div>
    </article>
  )
}

function PageDots({
  count,
  active_index,
}: {
  count: number
  active_index: number
}) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      aria-label="Card position"
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={[
            'h-2 w-2 rounded-full transition-colors',
            index === active_index ? 'bg-black' : 'bg-neutral-300',
          ].join(' ')}
          aria-hidden={index !== active_index}
        />
      ))}
    </div>
  )
}

export default function DriverEntryView({
  reason,
  line_linked,
}: DriverEntryViewProps) {
  const router = useRouter()
  const scroll_ref = useRef<HTMLDivElement>(null)
  const [active_index, set_active_index] = useState(0)
  const [is_pending, set_is_pending] = useState(false)

  const cards = driver_recruitment_content.cards
  const page = driver_recruitment_content.page

  useEffect(() => {
    const root = scroll_ref.current

    if (!root) {
      return
    }

    const targets = root.querySelectorAll('[data-card-index]')

    if (targets.length === 0) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

        if (!best?.target || !(best.target instanceof HTMLElement)) {
          return
        }

        const index = Number(best.target.dataset.cardIndex)

        if (!Number.isNaN(index)) {
          set_active_index(index)
        }
      },
      {
        root,
        threshold: [0.45, 0.6, 0.75],
      },
    )

    targets.forEach((target) => observer.observe(target))

    return () => observer.disconnect()
  }, [])

  async function handle_apply_click() {
    if (is_pending) {
      return
    }

    if (line_linked) {
      router.push(driver_recruitment_content.apply_path)
      return
    }

    set_is_pending(true)
    window.location.assign(
      `/auth/link/line?return_path=${encodeURIComponent(
        driver_recruitment_content.apply_path,
      )}`,
    )
  }

  return (
    <main className="min-h-screen bg-neutral-100 text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-0 pb-8 pt-10">
        <header className="px-6 pb-6">
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-neutral-500">
            Driver entry
          </p>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight text-black">
            {page.title}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-700">
            {page.subtitle}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-neutral-500">
            {page.intro}
          </p>
        </header>

        <div
          ref={scroll_ref}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-[9vw] pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((card, index) => (
            <RecruitmentCard key={card.key} card={card} index={index} />
          ))}
        </div>

        <div className="px-6 pt-2">
          <PageDots count={cards.length} active_index={active_index} />
        </div>

        {reason === 'no_line' ? (
          <p
            role="status"
            className="mx-6 mt-5 rounded-[16px] border border-neutral-300 bg-white px-4 py-3 text-[13px] leading-relaxed text-neutral-700"
          >
            {page.no_line_message}
          </p>
        ) : null}

        <div className="sticky bottom-0 mt-auto px-6 pb-4 pt-8">
          <button
            type="button"
            disabled={is_pending}
            onClick={() => {
              void handle_apply_click()
            }}
            className="flex h-14 w-full items-center justify-center rounded-full bg-black px-6 text-[16px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {is_pending
              ? content.cta_pending
              : driver_recruitment_content.cta_label}
          </button>
        </div>
      </div>
    </main>
  )
}
