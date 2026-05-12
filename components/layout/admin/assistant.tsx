'use client'

import { useState } from 'react'

import AdminAssistantNekoSvg from './neko'

type AdminAssistantProps = {
  display_name: string | null
}

function AdminAssistantNeko() {
  return (
    <div className="admin_neko_frame">
      <AdminAssistantNekoSvg />
    </div>
  )
}

export default function AdminAssistant({
  display_name,
}: AdminAssistantProps) {
  void display_name
  const [is_open, set_is_open] = useState(false)

  return (
    <>
      <style>
        {`
          .admin_assistant_card_entry {
            animation: admin_assistant_card_in 360ms ease-out both;
          }

          .admin_assistant_overlay {
            animation: admin_assistant_overlay_in 220ms ease-out both;
          }

          .admin_assistant_modal {
            animation: admin_assistant_modal_in 260ms ease-out both;
          }

          .admin_assistant_modal_neko {
            position: relative;
            width: 72px;
            height: 84px;
            flex: 0 0 72px;
            overflow: hidden;
            border-radius: 22px;
            background: #f5f5f5;
          }

          .admin_assistant_modal_neko .admin_neko_frame {
            position: absolute;
            left: 0;
            bottom: -2px;
            width: 72px;
            height: 84px;
            flex: 0 0 72px;
          }

          .admin_assistant_modal_neko .admin_neko_image {
            width: 72px;
            height: 84px;
          }

          @keyframes admin_assistant_card_in {
            from {
              opacity: 0;
              transform: translateY(18px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes admin_assistant_overlay_in {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes admin_assistant_modal_in {
            from {
              opacity: 0;
              transform: translateY(36px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>

      <div
        className="pointer-events-none fixed left-0 right-0 z-[110] flex w-screen justify-center"
        style={{
          bottom: 0,
        }}
      >
        <section
          className="pointer-events-auto w-full max-w-[480px]"
          aria-label="AI Assistant"
        >
          <div className="admin_assistant_card admin_assistant_card_entry flex items-center gap-[14px] bg-white px-5 py-[18px] shadow-[0_-10px_36px_rgba(0,0,0,0.10)] ring-1 ring-black/[0.04]">
            <div className="admin_neko_peek">
              <AdminAssistantNeko />
            </div>

            <div className="admin_assistant_text min-w-0 flex-1">
              <div className="whitespace-nowrap text-base font-semibold leading-tight text-black">
                AI Assistant
              </div>
              <div className="mt-1 text-sm font-medium leading-tight text-neutral-500">
                Admin support
              </div>
            </div>

            <div className="relative flex shrink-0 items-center">
              <button
                type="button"
                className="w-[72px] rounded-full bg-black py-2.5 text-sm font-semibold text-white shadow-sm transition-transform active:scale-[0.98]"
                onClick={() => set_is_open(true)}
              >
                Call
              </button>
              <span
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                aria-hidden
              />
            </div>
          </div>
        </section>
      </div>

      {is_open ? (
        <div className="fixed inset-0 z-[140] flex justify-center">
          <button
            type="button"
            aria-label="Close AI Assistant"
            className="admin_assistant_overlay absolute inset-0 bg-black/40 backdrop-blur-[3px]"
            onClick={() => set_is_open(false)}
          />

          <section
            className="admin_assistant_modal fixed bottom-0 top-24 z-[141] flex h-auto w-full max-w-[480px] flex-col overflow-hidden rounded-t-[30px] bg-white shadow-[0_-24px_80px_rgba(0,0,0,0.24)]"
            aria-label="AI Assistant chat"
          >
            <div className="flex justify-center pt-3">
              <div className="h-1.5 w-11 rounded-full bg-neutral-300" />
            </div>

            <header className="flex items-center gap-3 border-b border-black/[0.06] px-5 pb-4 pt-4">
              <div className="admin_assistant_modal_neko">
                <AdminAssistantNeko />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold leading-tight text-black">
                  AI Assistant
                </div>
                <div className="mt-1 text-sm font-medium leading-tight text-neutral-500">
                  Admin support
                </div>
              </div>

              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-xl leading-none text-black shadow-sm transition-colors hover:bg-neutral-50 active:scale-[0.98]"
                aria-label="Close"
                onClick={() => set_is_open(false)}
              >
                x
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-neutral-50 px-5 py-5">
              <div className="max-w-[84%] rounded-[22px] rounded-tl-md bg-white px-4 py-3 text-sm font-medium leading-relaxed text-black shadow-sm ring-1 ring-black/[0.04]">
                Today&apos;s admin checks are ready. What would you like to review
                first?
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-black shadow-sm"
                >
                  View today&apos;s summary
                </button>
                <button
                  type="button"
                  className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-black shadow-sm"
                >
                  Check messages
                </button>
                <button
                  type="button"
                  className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-black shadow-sm"
                >
                  Review alerts
                </button>
              </div>

              <div className="ml-auto max-w-[78%] rounded-[22px] rounded-tr-md bg-black px-4 py-3 text-sm font-semibold leading-relaxed text-white shadow-sm">
                Show today&apos;s urgent items
              </div>

              <div className="max-w-[86%] rounded-[22px] rounded-tl-md bg-white px-4 py-3 text-sm font-medium leading-relaxed text-black shadow-sm ring-1 ring-black/[0.04]">
                Priority order is new messages, unresolved alerts, and pending
                admin checks.
              </div>
            </div>

            <form
              className="flex items-center gap-2 border-t border-black/[0.06] bg-white px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-4"
              onSubmit={(event) => event.preventDefault()}
            >
              <input
                type="text"
                placeholder="Ask AI..."
                className="min-w-0 flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium text-black outline-none placeholder:text-neutral-400 focus:border-black"
              />
              <button
                type="button"
                className="h-11 w-16 rounded-full bg-black text-sm font-semibold text-white shadow-sm active:scale-[0.98]"
              >
                Send
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}
