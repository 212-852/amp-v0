import Image from 'next/image'

import type { archived_message } from '@/lib/chat/archive'
import type {
  faq_bundle,
  how_to_use_bundle,
  message_bundle,
  quick_menu_bundle,
  welcome_bundle,
} from '@/lib/chat/message'

function text_for(content: string | { ja?: string } | undefined) {
  if (typeof content === 'string') {
    return content
  }

  return content?.ja ?? ''
}

function WelcomeBubble({ bundle }: { bundle: welcome_bundle }) {
  return (
    <div className="flex justify-center px-5">
      <div className="max-w-[86%] rounded-[22px] bg-white px-5 py-4 shadow-[0_2px_14px_rgba(42,29,24,0.06)]">
        <p className="text-center text-[13px] font-semibold leading-[1.45] text-[#9c7d5d]">
          {text_for(bundle.payload.title)}
        </p>
        <p className="mt-1 text-left text-[17px] font-semibold leading-[1.65] text-[#2a1d18]">
          {text_for(bundle.payload.text)}
        </p>
      </div>
    </div>
  )
}

function QuickMenuCard({ bundle }: { bundle: quick_menu_bundle }) {
  return (
    <article className="w-[292px] shrink-0 overflow-hidden rounded-[24px] bg-white shadow-[0_3px_18px_rgba(42,29,24,0.08)]">
      <Image
        src={bundle.payload.image.src}
        alt={text_for(bundle.payload.image.alt)}
        width={584}
        height={360}
        className="h-[178px] w-full object-cover"
        priority
      />
      <div className="flex flex-col items-center gap-4 px-5 pb-5 pt-4">
        <div className="w-full max-w-[252px] text-center">
          <h2 className="text-[18px] font-semibold leading-[1.45] text-[#2a1d18]">
            {text_for(bundle.payload.title)}
          </h2>
          {bundle.payload.subtitle ? (
            <p className="mt-1.5 text-[13px] font-medium leading-[1.45] text-[#9c7d5d]">
              {text_for(bundle.payload.subtitle)}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col items-center gap-2.5">
          {bundle.payload.items.map((item) => (
            <button
              key={item.key}
              className="w-full max-w-[248px] rounded-[18px] bg-[#c9a77d] px-4 py-3 text-center text-[14px] font-semibold leading-[1.45] text-white shadow-[0_2px_8px_rgba(42,29,24,0.07)]"
              type="button"
            >
              {text_for(item.label)}
            </button>
          ))}
        </div>
        {bundle.payload.support_heading ||
        bundle.payload.support_body ||
        (bundle.payload.links && bundle.payload.links.length > 0) ? (
          <div className="w-full max-w-[252px] border-t border-[#f0e6dc] pt-4">
            {bundle.payload.support_heading || bundle.payload.support_body ? (
              <div className="space-y-2 text-left">
                {bundle.payload.support_heading ? (
                  <p className="text-[13px] font-semibold leading-[1.45] text-[#2a1d18]">
                    {text_for(bundle.payload.support_heading)}
                  </p>
                ) : null}
                {bundle.payload.support_body ? (
                  <p className="whitespace-pre-line text-[12px] leading-[1.55] text-[#7f6a59]">
                    {text_for(bundle.payload.support_body)}
                  </p>
                ) : null}
              </div>
            ) : null}
            {bundle.payload.links && bundle.payload.links.length > 0 ? (
              <div className="flex flex-col items-center gap-1.5 pt-3 text-center">
                {bundle.payload.links.map((link) => (
                  <button
                    key={link.key}
                    className="text-[13px] font-semibold leading-[1.45] text-[#c9a77d] underline decoration-[#c9a77d]/50 underline-offset-2"
                    type="button"
                  >
                    {text_for(link.label)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function HowToUseCard({ bundle }: { bundle: how_to_use_bundle }) {
  return (
    <article className="w-[292px] shrink-0 overflow-hidden rounded-[24px] bg-white shadow-[0_3px_18px_rgba(42,29,24,0.08)]">
      <Image
        src={bundle.payload.image.src}
        alt={text_for(bundle.payload.image.alt)}
        width={584}
        height={360}
        className="h-[178px] w-full object-cover"
      />
      <div className="flex flex-col items-center gap-4 px-5 pb-5 pt-4">
        <h2 className="w-full max-w-[252px] text-center text-[18px] font-semibold leading-[1.45] text-[#2a1d18]">
          {text_for(bundle.payload.title)}
        </h2>
        <div className="flex w-full flex-col items-center gap-2.5">
          {bundle.payload.steps.map((step) => (
            <button
              key={step.key}
              className="w-full max-w-[248px] rounded-[18px] border border-[#eadccc] bg-white px-4 py-3 text-left text-[#2a1d18] shadow-[0_1px_4px_rgba(42,29,24,0.04)]"
              type="button"
            >
              <span className="block text-[14px] font-semibold leading-[1.45]">
                {text_for(step.title)}
              </span>
              {text_for(step.description).trim() ? (
                <span className="mt-1 block text-[12px] leading-[1.55] text-[#7f6a59]">
                  {text_for(step.description)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {bundle.payload.notice_heading || bundle.payload.notice_body ? (
          <div className="w-full max-w-[252px] space-y-2 border-t border-[#f0e6dc] pt-4 text-left">
            {bundle.payload.notice_heading ? (
              <p className="text-[13px] font-semibold leading-[1.45] text-[#2a1d18]">
                {text_for(bundle.payload.notice_heading)}
              </p>
            ) : null}
            {bundle.payload.notice_body ? (
              <p className="whitespace-pre-line text-[12px] leading-[1.55] text-[#7f6a59]">
                {text_for(bundle.payload.notice_body)}
              </p>
            ) : null}
          </div>
        ) : null}
        {bundle.payload.footer_link_label ? (
          <div className="flex w-full justify-center text-center">
            <button
              className="text-[13px] font-semibold leading-[1.45] text-[#c9a77d] underline decoration-[#c9a77d]/50 underline-offset-2"
              type="button"
            >
              {text_for(bundle.payload.footer_link_label)}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function FaqCard({ bundle }: { bundle: faq_bundle }) {
  return (
    <article className="w-[292px] shrink-0 overflow-hidden rounded-[24px] bg-white shadow-[0_3px_18px_rgba(42,29,24,0.08)]">
      <Image
        src={bundle.payload.image.src}
        alt={text_for(bundle.payload.image.alt)}
        width={584}
        height={360}
        className="h-[178px] w-full object-cover"
      />
      <div className="flex flex-col items-center gap-4 px-5 pb-5 pt-4">
        <h2 className="w-full max-w-[252px] text-center text-[18px] font-semibold leading-[1.45] text-[#2a1d18]">
          {text_for(bundle.payload.title)}
        </h2>
        <div className="flex w-full flex-col items-center gap-2.5">
          {bundle.payload.items.map((item) => (
            <button
              key={item.key}
              className="w-full max-w-[248px] rounded-[18px] border border-[#eadccc] bg-white px-4 py-3 text-left shadow-[0_1px_4px_rgba(42,29,24,0.04)]"
              type="button"
            >
              <span className="block text-center text-[14px] font-semibold leading-[1.45] text-[#2a1d18]">
                {text_for(item.question)}
              </span>
              {text_for(item.answer).trim() ? (
                <span className="mt-1 block text-left text-[12px] leading-[1.55] text-[#7f6a59]">
                  {text_for(item.answer)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {bundle.payload.primary_cta_label ? (
          <button
            className="w-full max-w-[248px] rounded-[18px] bg-[#c9a77d] px-4 py-3 text-center text-[14px] font-semibold leading-[1.45] text-white shadow-[0_2px_8px_rgba(42,29,24,0.07)]"
            type="button"
          >
            {text_for(bundle.payload.primary_cta_label)}
          </button>
        ) : null}
      </div>
    </article>
  )
}

function ChatCard({ bundle }: { bundle: message_bundle }) {
  if (bundle.bundle_type === 'quick_menu') {
    return <QuickMenuCard bundle={bundle} />
  }

  if (bundle.bundle_type === 'how_to_use') {
    return <HowToUseCard bundle={bundle} />
  }

  if (bundle.bundle_type === 'faq') {
    return <FaqCard bundle={bundle} />
  }

  return null
}

export function WebChat({ messages }: { messages: archived_message[] }) {
  const welcome_messages = messages.filter(
    (message) => message.bundle.bundle_type === 'welcome',
  )
  const card_messages = messages.filter((message) =>
    ['quick_menu', 'how_to_use', 'faq'].includes(message.bundle.bundle_type),
  )

  return (
    <section className="space-y-5 pt-4">
      {welcome_messages.map((message) => (
        <WelcomeBubble
          key={message.archive_uuid}
          bundle={message.bundle as welcome_bundle}
        />
      ))}

      {card_messages.length > 0 ? (
        <div className="overflow-x-auto px-5 pb-3">
          <div className="flex w-max gap-4">
            {card_messages.map((message) => (
              <ChatCard
                key={message.archive_uuid}
                bundle={message.bundle}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
