'use client'

import {
  ChevronLeft,
  Edit3,
  Menu,
} from 'lucide-react'

import { useEffect, useState } from 'react'
import { FaPaw } from 'react-icons/fa'

import { useUserChat } from '@/components/chat/context'
import PawIcon from '@/components/icons/paw'
import MenuModal from '@/components/modal/menu'
import MypageModal from '@/components/modal/mypage'
import QuickModal from '@/components/modal/quick'
import OverlayRoot from '@/components/overlay/root'
import type {
  quick_menu_item,
  quick_menu_item_key,
} from '@/components/shared/quick/cards'
import { get_copyright_text } from '@/lib/config/site'
import type { locale_key } from '@/lib/locale/action'
import type { archived_message } from '@/lib/chat/archive'
import type { room_mode } from '@/lib/chat/room'
import {
  get_locale,
  subscribe_locale,
} from '@/lib/locale/state'

type footer_mode = 'nav' | 'input'

const content = {
  mypage: {
    ja: 'マイページ',
    en: 'My Page',
    es: 'Mi página',
  },
  bot: {
    ja: 'BOT',
    en: 'BOT',
    es: 'BOT',
  },
  concierge: {
    ja: 'コンシェルジュ',
    en: 'Concierge',
    es: 'Concierge',
  },
  menu: {
    ja: 'メニュー',
    en: 'Menu',
    es: 'Menú',
  },
  message: {
    ja: 'メッセージを入力',
    en: 'Type a message',
    es: 'Escribe un mensaje',
  },
}

const quick_menu_items: quick_menu_item[] = [
  {
    key: 'availability',
    title: {
      ja: '空き状況の確認',
      en: 'Check Availability',
      es: 'Ver disponibilidad',
    },
    description: {
      ja: '日時とエリアから空き状況を確認します',
      en: 'Check open slots by date, time, and area.',
      es: 'Consulta horarios disponibles por fecha, hora y zona.',
    },
    label: {
      ja: '確認する',
      en: 'Check',
      es: 'Consultar',
    },
  },
  {
    key: 'dispatch',
    title: {
      ja: '配車の手配',
      en: 'Arrange Dispatch',
      es: 'Solicitar traslado',
    },
    description: {
      ja: '出発地・到着地・ペット情報を入力します',
      en: 'Enter pickup, destination, and pet details.',
      es: 'Ingresa origen, destino y datos de la mascota.',
    },
    label: {
      ja: '手配する',
      en: 'Arrange',
      es: 'Solicitar',
    },
  },
  {
    key: 'reservation',
    title: {
      ja: '予約の確認',
      en: 'Check Reservation',
      es: 'Ver reserva',
    },
    description: {
      ja: '現在の予約内容を確認します',
      en: 'Review your current reservation details.',
      es: 'Revisa los detalles de tu reserva actual.',
    },
    label: {
      ja: '確認する',
      en: 'View',
      es: 'Ver',
    },
  },
]

type room_mode_segment = 'bot' | 'concierge'

const switch_message_text: Record<
  room_mode_segment,
  Record<locale_key, string>
> = {
  bot: {
    ja: 'ボット',
    en: 'BOT',
    es: 'BOT',
  },
  concierge: {
    ja: 'コンシェルジュ',
    en: 'Concierge',
    es: 'Concierge',
  },
}

function is_switch_mode_incoming_message(message: archived_message) {
  const bundle = message.bundle

  if (bundle.bundle_type !== 'text' || bundle.sender !== 'user') {
    return false
  }

  const metadata =
    bundle.metadata && typeof bundle.metadata === 'object'
      ? (bundle.metadata as { intent?: string })
      : null

  return metadata?.intent === 'switch_mode'
}

function create_optimistic_switch_message(input: {
  room_uuid: string
  mode: room_mode_segment
  locale: locale_key
}): archived_message {
  const optimistic_uuid = `optimistic:${crypto.randomUUID()}`

  return {
    archive_uuid: optimistic_uuid,
    room_uuid: input.room_uuid,
    sequence: Number.MAX_SAFE_INTEGER,
    created_at: new Date().toISOString(),
    bundle: {
      bundle_uuid: optimistic_uuid,
      bundle_type: 'text',
      sender: 'user',
      version: 1,
      locale: input.locale,
      content_key: `room.mode.switch.${input.mode}`,
      metadata: {
        intent: 'switch_mode',
        mode: input.mode,
      },
      payload: {
        text: switch_message_text[input.mode][input.locale],
      },
    },
  }
}

export default function UserFooter() {
  const chat = useUserChat()
  const [mounted, set_mounted] = useState(false)
  const [locale, set_locale] = useState<locale_key>('ja')
  const [pending_switch_mode, set_pending_switch_mode] =
    useState<room_mode_segment | null>(null)
  const [mode, set_mode] = useState<footer_mode>('nav')
  const [flip_rotation, set_flip_rotation] = useState(0)
  const [card_scale, set_card_scale] = useState(1)
  const [is_mypage_open, set_is_mypage_open] = useState(false)
  const [is_menu_open, set_is_menu_open] = useState(false)
  const [is_quick_menu_open, set_is_quick_menu_open] = useState(false)
  const [is_paw_pressed, set_is_paw_pressed] = useState(false)
  const is_input_mode = mode === 'input'
  const render_locale = mounted ? locale : 'ja'
  const room_mode_segment = chat.mode

  useEffect(() => {
    const mounted_timer = window.setTimeout(() => {
      set_mounted(true)
      set_locale(get_locale())
    }, 0)
    const unsubscribe_locale = subscribe_locale(set_locale)

    return () => {
      window.clearTimeout(mounted_timer)
      unsubscribe_locale()
    }
  }, [])

  function open_input() {
    set_is_mypage_open(false)
    set_is_menu_open(false)
    set_is_quick_menu_open(false)
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

  function handle_paw_click() {
    set_is_mypage_open(false)
    set_is_menu_open(false)
    set_is_paw_pressed(true)
    set_is_quick_menu_open((current) => !current)

    window.setTimeout(() => {
      set_is_paw_pressed(false)
    }, 220)
  }

  function handle_quick_menu_item_click(_item_key: quick_menu_item_key) {
    void _item_key
  }

  async function post_room_mode_action(next_mode: room_mode_segment) {
    if (
      pending_switch_mode ||
      !chat.room_uuid ||
      !chat.participant_uuid
    ) {
      return
    }

    const previous_mode = chat.mode
    chat.set_mode(next_mode as room_mode)
    const optimistic_message = create_optimistic_switch_message({
      room_uuid: chat.room_uuid,
      mode: next_mode,
      locale: render_locale,
    })
    chat.append_message(optimistic_message)
    set_pending_switch_mode(next_mode)

    try {
      const response = await fetch('/api/chat/mode', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          room_uuid: chat.room_uuid,
          participant_uuid: chat.participant_uuid,
          locale: render_locale,
          mode: next_mode,
        }),
      })

      if (!response.ok) {
        chat.set_mode(previous_mode)
        chat.remove_message(optimistic_message.archive_uuid)
        return
      }

      const payload = (await response.json()) as {
        ok?: boolean
        mode?: room_mode_segment
        messages?: archived_message[]
      }

      if (payload.ok !== false && payload.mode) {
        chat.set_mode(payload.mode as room_mode)

        const returned_messages = payload.messages ?? []
        const incoming_message = returned_messages.find(
          is_switch_mode_incoming_message,
        )
        const outgoing_messages = returned_messages.filter(
          (message) => !is_switch_mode_incoming_message(message),
        )

        if (incoming_message) {
          chat.replace_message(
            optimistic_message.archive_uuid,
            incoming_message,
          )
        } else {
          chat.remove_message(optimistic_message.archive_uuid)
        }

        chat.append_messages(outgoing_messages)
      } else {
        chat.set_mode(previous_mode)
        chat.remove_message(optimistic_message.archive_uuid)
      }
    } catch (error) {
      console.error('[chat] switch_api_failed', error)
      chat.set_mode(previous_mode)
      chat.remove_message(optimistic_message.archive_uuid)
    } finally {
      set_pending_switch_mode(null)
      // Network errors: leave toggle unchanged.
    }
  }

  function handle_select_bot() {
    if (room_mode_segment === 'concierge') {
      void post_room_mode_action('bot')
    }
  }

  function handle_select_concierge() {
    if (room_mode_segment === 'bot') {
      void post_room_mode_action('concierge')
    }
  }

  return (
    <>
      <OverlayRoot
        open={is_mypage_open}
        on_close={() => set_is_mypage_open(false)}
        variant="bottom"
        motion="bottom"
      >
        <MypageModal
          locale={render_locale}
          on_close={() => set_is_mypage_open(false)}
        />
      </OverlayRoot>

      <OverlayRoot
        open={is_menu_open}
        on_close={() => set_is_menu_open(false)}
        variant="left"
        motion="left"
        panel_class_name="h-full min-h-dvh"
      >
        <MenuModal
          locale={render_locale}
          on_close={() => set_is_menu_open(false)}
        />
      </OverlayRoot>

      <OverlayRoot
        open={is_quick_menu_open}
        on_close={() => set_is_quick_menu_open(false)}
        variant="center"
        panel_class_name="translate-y-[120px]"
      >
        <QuickModal
          locale={render_locale}
          items={quick_menu_items}
          on_close={() => set_is_quick_menu_open(false)}
          on_select={handle_quick_menu_item_click}
        />
      </OverlayRoot>

      <footer className="fixed bottom-0 left-0 right-0 z-50 w-screen bg-transparent pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto w-full max-w-[430px]">
        <div className="relative bg-transparent pb-1 pt-6">

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
                aria-label="Toggle quick menu"
                onClick={handle_paw_click}
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
                <div
                  className={[
                    'p-[9px]',
                    is_paw_pressed ? 'paw_puyo' : '',
                  ].join(' ')}
                >
                  <PawIcon className="h-[26px] w-[26px] text-[#b56f69]" />
                </div>
              </button>

              {/* content */}
              <div className="relative flex h-[52px] items-end justify-between px-5">

                {/* left */}
                <button
                  type="button"
                  onClick={() => {
                    set_is_quick_menu_open(false)
                    set_is_menu_open(false)
                    set_is_mypage_open(true)
                  }}
                  className="flex w-[60px] translate-y-[16px] flex-col items-center text-[#2a1d18]"
                >
                  <FaPaw
                    className="
                      h-[30px] w-[30px]
                      text-[#2a1d18]
                    "
                  />

                  <span className="mt-1 whitespace-nowrap text-[10px] font-medium leading-[1.35] text-[#5c4f47]">
                    {content.mypage[render_locale]}
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
                    onClick={handle_select_bot}
                    disabled={Boolean(pending_switch_mode)}
                    className={[
                      'h-full flex-1 rounded-full',
                      'text-[10px] font-medium tracking-wide',
                      pending_switch_mode === 'bot' ? 'opacity-60' : '',
                      room_mode_segment === 'bot'
                        ? 'bg-white text-[#2a1d18] shadow-[0_1px_4px_rgba(42,29,24,0.07)]'
                        : 'text-[#8a7467]',
                    ].join(' ')}
                  >
                    {content.bot[render_locale]}
                  </button>

                  <button
                    type="button"
                    onClick={handle_select_concierge}
                    disabled={Boolean(pending_switch_mode)}
                    className={[
                      'h-full flex-1 rounded-full',
                      'text-[10px] font-medium tracking-wide',
                      pending_switch_mode === 'concierge'
                        ? 'opacity-60'
                        : '',
                      room_mode_segment === 'concierge'
                        ? 'bg-white text-[#2a1d18] shadow-[0_1px_4px_rgba(42,29,24,0.07)]'
                        : 'text-[#8a7467]',
                    ].join(' ')}
                  >
                    {content.concierge[render_locale]}
                  </button>
                </div>

                {/* right */}
                <button
                  type="button"
                  onClick={() => {
                    set_is_quick_menu_open(false)
                    set_is_mypage_open(false)
                    set_is_menu_open(true)
                  }}
                  className="flex w-[60px] translate-y-[16px] flex-col items-center text-[#2a1d18]"
                >
                  <Menu
                    className="h-[32px] w-[32px]"
                    strokeWidth={2.4}
                  />

                  <span className="mt-1 whitespace-nowrap text-[10px] font-medium leading-[1.35] text-[#5c4f47]">
                    {content.menu[render_locale]}
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
                  placeholder={content.message[render_locale]}
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
      </div>
      </footer>
    </>
  )
}
