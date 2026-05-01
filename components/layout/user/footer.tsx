'use client'

import {
  ChevronLeft,
  Edit3,
  Menu,
} from 'lucide-react'

import { useState } from 'react'
import { FaPaw } from 'react-icons/fa'

import PawIcon from '@/components/icons/paw'
import { get_copyright_text } from '@/lib/config/site'

type footer_mode = 'nav' | 'input'

export default function UserFooter() {
  const [mode, set_mode] = useState<footer_mode>('nav')
  const [flip_rotation, set_flip_rotation] = useState(0)
  const [card_scale, set_card_scale] = useState(1)
  const is_input_mode = mode === 'input'

  function open_input() {
    set_mode('input')
    set_card_scale(0.98)
    set_flip_rotation((current_rotation) => current_rotation + 180)
    window.setTimeout(() => set_card_scale(1), 40)
  }

  function close_input() {
    set_mode('nav')
    set_card_scale(0.98)
    set_flip_rotation((current_rotation) => current_rotation + 180)
    window.setTimeout(() => set_card_scale(1), 40)
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50">
      <div className="relative bg-transparent pb-[calc(env(safe-area-inset-bottom)+4px)] pt-6">

        {/* top curve */}
        <div className="absolute bottom-0 left-0 z-0 h-[86px] w-full drop-shadow-[0_-1px_8px_rgba(42,29,24,0.05)]">
          <svg
            viewBox="0 0 400 96"
            preserveAspectRatio="none"
            className="h-full w-full fill-[#EBD5C0]"
          >
            <path
              d="
                M0,0
                L118,0
                C145,0 150,68 200,68
                C250,68 255,0 282,0
                L400,0
                L400,96
                L0,96
                Z
              "
            />
          </svg>
        </div>

        <div
          className="relative z-10 h-[82px]"
          style={{ perspective: '900px' }}
        >
          <div
            className="
              relative h-full w-full
              transition-transform duration-[450ms]
              ease-[cubic-bezier(0.22,1,0.36,1)]
            "
            style={{
              transform: `rotateY(${flip_rotation}deg) scale(${card_scale})`,
              transformStyle: 'preserve-3d',
            }}
          >
            <div
              className={`
                absolute inset-0
                ${is_input_mode ? 'pointer-events-none' : 'pointer-events-auto'}
              `}
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(0deg)',
              }}
            >
              {/* open input */}
              <button
                type="button"
                aria-label="open message input"
                onClick={open_input}
                className="
                  absolute left-[22px] top-[-15px] z-20
                  flex h-[48px] w-[48px]
                  -translate-y-1/2
                  items-center justify-center
                  rounded-full
                  bg-white
                  text-[#2a1d18]
                  shadow-[0_2px_8px_rgba(42,29,24,0.06)]
                "
              >
                <Edit3
                  className="h-[20px] w-[20px]"
                  strokeWidth={2.2}
                />
              </button>

              {/* center paw */}
              <button
                type="button"
                aria-label="toggle view"
                className="
                  absolute left-1/2 top-[-18px] z-20
                  flex h-[74px] w-[74px]
                  -translate-x-1/2 -translate-y-1/2
                  items-center justify-center
                  rounded-full
                  border-2 border-[#cfe0ff]
                  bg-white
                  shadow-[0_2px_8px_rgba(42,29,24,0.06)]
                "
              >
                <div className="p-[9px]">
                  <PawIcon className="h-[26px] w-[26px] text-[#b56f69]" />
                </div>
              </button>

              {/* content */}
              <div className="relative flex h-[52px] items-end justify-between px-5">

                {/* left */}
                <button
                  type="button"
                  className="flex w-[60px] translate-y-[16px] flex-col items-center text-[#2a1d18]"
                >
                  <FaPaw
                    className="
                      h-[30px] w-[30px]
                      text-[#2a1d18]
                    "
                  />

                  <span className="mt-1 whitespace-nowrap text-[10px] font-medium leading-[1.35] text-[#5c4f47]">
                    マイページ
                  </span>
                </button>

                {/* switch */}
                <div
                  className="
                    absolute bottom-[-5px] left-1/2
                    flex h-[38px] w-[255px]
                    -translate-x-1/2
                    items-center
                    rounded-full
                    bg-[#d5bd9f]
                    p-[3px]
                    shadow-inner
                  "
                >
                  <button
                    type="button"
                    className="
                      h-full flex-1 rounded-full
                      bg-white
                      text-[10px] font-medium
                      tracking-wide
                      text-[#2a1d18]
                      shadow-[0_1px_4px_rgba(42,29,24,0.07)]
                    "
                  >
                    BOT
                  </button>

                  <button
                    type="button"
                    className="
                      h-full flex-1 rounded-full
                      text-[10px] font-medium
                      tracking-wide
                      text-[#8a7467]
                    "
                  >
                    コンシェルジュ
                  </button>
                </div>

                {/* right */}
                <button
                  type="button"
                  className="flex w-[60px] translate-y-[16px] flex-col items-center text-[#2a1d18]"
                >
                  <Menu
                    className="h-[32px] w-[32px]"
                    strokeWidth={2.4}
                  />

                  <span className="mt-1 whitespace-nowrap text-[10px] font-medium leading-[1.35] text-[#5c4f47]">
                    メニュー
                  </span>
                </button>
              </div>

              {/* copyright */}
              <div className="relative z-10 mt-3 text-center text-[11px] font-normal leading-[1.55] text-[#b8a89c]">
                {get_copyright_text()}
              </div>
            </div>

            <div
              className={`
                absolute inset-0
                ${is_input_mode ? 'pointer-events-auto' : 'pointer-events-none'}
              `}
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <div className="relative z-10 flex translate-y-[18px] items-center gap-3 px-4">

                {/* back */}
                <button
                  type="button"
                  aria-label="back"
                  onClick={close_input}
                  className="
                    flex h-[48px] w-[48px]
                    items-center justify-center
                    rounded-full
                    bg-white
                    text-[#2a1d18]
                    shadow-[0_2px_8px_rgba(42,29,24,0.06)]
                  "
                >
                  <ChevronLeft
                    className="h-[22px] w-[22px]"
                    strokeWidth={2.4}
                  />
                </button>

                {/* input */}
                <input
                  id="user_footer_message"
                  name="user_footer_message"
                  type="text"
                  placeholder="メッセージを入力"
                  className="
                    h-[48px] min-w-0 flex-1
                    rounded-full
                    border-none
                    bg-white
                    px-5
                    text-[15px]
                    leading-[1.65]
                    text-[#2a1d18]
                    outline-none
                    placeholder:text-[#a9968a]
                    shadow-[0_2px_8px_rgba(42,29,24,0.05)]
                  "
                />

                {/* send */}
                <button
                  type="button"
                  aria-label="send"
                  className="
                    flex h-[48px] w-[48px]
                    items-center justify-center
                    rounded-full
                    bg-[#f3ebe2]
                    shadow-[0_2px_8px_rgba(42,29,24,0.06)]
                  "
                >
                  <FaPaw
                    className="
                      h-[19px] w-[19px]
                      text-[#9b6b4b]
                    "
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
