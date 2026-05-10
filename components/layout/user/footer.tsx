'use client'

import {
  ChevronLeft,
  Edit3,
  Menu,
} from 'lucide-react'

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { can_switch_to_concierge } from '@/lib/chat/rules'
import {
  get_locale,
  subscribe_locale,
} from '@/lib/locale/state'
import { use_session_profile } from '@/components/session/profile'

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
  link_required_title: {
    ja: '連携が必要です',
    en: 'Account linking required',
    es: 'Se requiere conexion',
  },
  link_required_body: {
    ja: 'コンシェルジュに相談するには連携が必要です',
    en: 'Account linking is required to contact the concierge.',
    es: 'Necesitas vincular tu cuenta para consultar al concierge.',
  },
  link_required_action: {
    ja: '連携する',
    en: 'Link account',
    es: 'Vincular cuenta',
  },
  close: {
    ja: '閉じる',
    en: 'Close',
    es: 'Cerrar',
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
type presence_action = 'typing_start' | 'typing_stop'

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
  const { session } = use_session_profile()
  const input_ref = useRef<HTMLInputElement | null>(null)
  const typing_timer_ref = useRef<number | null>(null)
  const typing_active_ref = useRef(false)
  const [mounted, set_mounted] = useState(false)
  const [locale, set_locale] = useState<locale_key>('ja')
  const [pending_switch_mode, set_pending_switch_mode] =
    useState<room_mode_segment | null>(null)
  const [is_sending_text, set_is_sending_text] = useState(false)
  const [flip_rotation, set_flip_rotation] = useState(0)
  const [card_scale, set_card_scale] = useState(1)
  const [is_mypage_open, set_is_mypage_open] = useState(false)
  const [is_menu_open, set_is_menu_open] = useState(false)
  const [is_quick_menu_open, set_is_quick_menu_open] = useState(false)
  const [is_link_required_open, set_is_link_required_open] = useState(false)
  const [is_paw_pressed, set_is_paw_pressed] = useState(false)
  const is_input_mode = chat.is_chat_open
  const render_locale = mounted ? locale : 'ja'
  const room_mode_segment = chat.mode
  const flip_rotation_value = is_input_mode
    ? flip_rotation + 180
    : flip_rotation

  const post_typing_presence = useCallback(
    (action: presence_action) => {
      if (!chat.room_uuid || !chat.participant_uuid) {
        return
      }

      if (action === 'typing_start' && typing_active_ref.current) {
        return
      }

      typing_active_ref.current = action === 'typing_start'

      void fetch('/api/chat/presence', {
        method: 'POST',
        credentials: 'include',
        keepalive: action === 'typing_stop',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          room_uuid: chat.room_uuid,
          participant_uuid: chat.participant_uuid,
          action,
        }),
      }).catch(() => {})
    },
    [chat.participant_uuid, chat.room_uuid],
  )

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

  useEffect(() => {
    const scale_timer = window.setTimeout(() => set_card_scale(0.98), 0)
    const restore_timer = window.setTimeout(() => set_card_scale(1), 40)

    if (is_input_mode) {
      const focus_timer = window.setTimeout(() => {
        input_ref.current?.focus()
      }, 220)

      return () => {
        window.clearTimeout(scale_timer)
        window.clearTimeout(restore_timer)
        window.clearTimeout(focus_timer)
      }
    }

    return () => {
      window.clearTimeout(scale_timer)
      window.clearTimeout(restore_timer)
    }
  }, [is_input_mode])

  function open_input() {
    set_is_mypage_open(false)
    set_is_menu_open(false)
    set_is_quick_menu_open(false)
    chat.open_chat()
    set_flip_rotation((current_rotation) => current_rotation + 360)
  }

  function close_input() {
    post_typing_presence('typing_stop')
    chat.close_chat()
    set_flip_rotation((current_rotation) => current_rotation + 360)
  }

  function schedule_typing_stop() {
    if (typing_timer_ref.current !== null) {
      window.clearTimeout(typing_timer_ref.current)
    }

    typing_timer_ref.current = window.setTimeout(() => {
      typing_timer_ref.current = null
      post_typing_presence('typing_stop')
    }, 5_000)
  }

  function handle_message_input_change() {
    const has_text = Boolean(input_ref.current?.value.trim())

    if (!has_text) {
      post_typing_presence('typing_stop')
      return
    }

    post_typing_presence('typing_start')
    schedule_typing_stop()
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
        if (response.status === 403) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string
          } | null

          if (payload?.error === 'link_required') {
            set_is_link_required_open(true)
          }
        }

        chat.set_mode(previous_mode)
        chat.remove_message(optimistic_message.archive_uuid)
        return
      }

      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
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
        if (payload.error === 'link_required') {
          set_is_link_required_open(true)
        }

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
      if (
        !can_switch_to_concierge({
          role: session?.role ?? null,
          tier: session?.tier ?? null,
        })
      ) {
        set_is_link_required_open(true)
        return
      }

      void post_room_mode_action('concierge')
    }
  }

  function open_connect_modal() {
    set_is_link_required_open(false)
    window.dispatchEvent(new Event('amp_open_connect_modal'))
  }

  function reset_input_field() {
    if (input_ref.current) {
      input_ref.current.value = ''
    }
  }

  function build_optimistic_user_text_message(input: {
    room_uuid: string
    text: string
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
        payload: {
          text: input.text,
        },
      },
    }
  }

  async function submit_chat_text(raw_text: string) {
    const text = raw_text.trim()

    if (
      !text ||
      is_sending_text ||
      pending_switch_mode ||
      !chat.room_uuid ||
      !chat.participant_uuid
    ) {
      return
    }

    const previous_mode = chat.mode
    const optimistic_message = build_optimistic_user_text_message({
      room_uuid: chat.room_uuid,
      text,
      locale: render_locale,
    })

    set_is_sending_text(true)
    chat.append_message(optimistic_message)
    reset_input_field()
    post_typing_presence('typing_stop')

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          room_uuid: chat.room_uuid,
          participant_uuid: chat.participant_uuid,
          locale: render_locale,
          text,
        }),
      })

      if (!response.ok) {
        if (response.status === 403) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string
          } | null

          if (payload?.error === 'link_required') {
            set_is_link_required_open(true)
          }
        }

        chat.remove_message(optimistic_message.archive_uuid)
        return
      }

      const payload = (await response.json()) as
        | {
            ok: true
            kind: 'switch_mode'
            mode: room_mode
            messages: archived_message[]
          }
        | {
            ok: true
            kind: 'plain_text'
            messages: archived_message[]
          }
        | { ok: false; error: string; reason?: string }

      if (!payload.ok) {
        if (payload.error === 'link_required') {
          set_is_link_required_open(true)
        }

        chat.remove_message(optimistic_message.archive_uuid)
        return
      }

      const returned_messages = payload.messages ?? []
      const echoed_user_message =
        returned_messages.find(is_switch_mode_incoming_message) ??
        returned_messages.find(
          (message) => message.bundle.sender === 'user',
        ) ??
        null
      const remaining_messages = echoed_user_message
        ? returned_messages.filter(
            (message) => message !== echoed_user_message,
          )
        : returned_messages

      if (echoed_user_message) {
        chat.replace_message(
          optimistic_message.archive_uuid,
          echoed_user_message,
        )
      } else {
        chat.remove_message(optimistic_message.archive_uuid)
      }

      if (remaining_messages.length > 0) {
        chat.append_messages(remaining_messages)
      }

      if (payload.kind === 'switch_mode') {
        chat.set_mode(payload.mode)
      } else if (chat.mode !== previous_mode) {
        chat.set_mode(previous_mode)
      }
    } catch (error) {
      console.error('[chat] submit_chat_text_failed', error)
      chat.remove_message(optimistic_message.archive_uuid)
    } finally {
      set_is_sending_text(false)
    }
  }

  function handle_chat_text_submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit_chat_text(input_ref.current?.value ?? '')
  }

  useEffect(() => {
    return () => {
      if (typing_timer_ref.current !== null) {
        window.clearTimeout(typing_timer_ref.current)
      }

      post_typing_presence('typing_stop')
    }
  }, [post_typing_presence])

  function handle_send_click() {
    void submit_chat_text(input_ref.current?.value ?? '')
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

      <OverlayRoot
        open={is_link_required_open}
        on_close={() => set_is_link_required_open(false)}
        variant="center"
      >
        <div className="w-[92%] max-w-[360px] rounded-[26px] bg-white px-6 py-6 text-center shadow-[0_12px_40px_rgba(42,29,24,0.14)]">
          <h2 className="text-[18px] font-semibold text-[#2a1d18]">
            {content.link_required_title[render_locale]}
          </h2>
          <p className="mt-3 text-[14px] leading-[1.7] text-[#6d5c52]">
            {content.link_required_body[render_locale]}
          </p>
          <button
            type="button"
            className="mt-5 w-full rounded-full bg-[#2a1d18] px-5 py-3 text-[14px] font-semibold text-white"
            onClick={open_connect_modal}
          >
            {content.link_required_action[render_locale]}
          </button>
          <button
            type="button"
            className="mt-3 text-[12px] font-medium text-[#8a7568]"
            onClick={() => set_is_link_required_open(false)}
          >
            {content.close[render_locale]}
          </button>
        </div>
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
              transform: `rotateY(${flip_rotation_value}deg) scale(${card_scale})`,
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
              <form
                className="relative z-10 flex translate-y-[18px] items-center gap-3 px-4"
                onSubmit={handle_chat_text_submit}
              >

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
                  ref={input_ref}
                  id="user_footer_message"
                  name="user_footer_message"
                  type="text"
                  autoComplete="off"
                  placeholder={content.message[render_locale]}
                  disabled={is_sending_text}
                  onChange={handle_message_input_change}
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
                    disabled:opacity-60
                  "
                />

                {/* send */}
                <button
                  type="submit"
                  aria-label="send"
                  onClick={handle_send_click}
                  disabled={is_sending_text}
                  className="
                    flex h-[48px] w-[48px]
                    items-center justify-center
                    rounded-full
                    bg-[#f3ebe2]
                    shadow-[0_2px_8px_rgba(42,29,24,0.06)]
                    disabled:opacity-60
                  "
                >
                  <FaPaw
                    className="
                      h-[19px] w-[19px]
                      text-[#9b6b4b]
                    "
                  />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
      </div>
      </footer>
    </>
  )
}
