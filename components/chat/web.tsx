'use client'

import Image from 'next/image'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { useUserChat } from '@/components/chat/context'
import { use_session_profile } from '@/components/session/profile'
import type { archived_message } from '@/lib/chat/archive'
import {
  chat_room_realtime_channel_name,
  chat_typing_is_fresh,
  cleanup_chat_room_realtime,
  send_chat_realtime_debug,
  subscribe_chat_room_realtime,
} from '@/lib/chat/realtime/client'
import {
  chat_action_to_archived_message,
  cleanup_chat_actions_realtime,
  emit_chat_action_realtime_rendered,
  subscribe_chat_actions_realtime,
} from '@/lib/chat/realtime/chat_actions'
import { end_user_should_see_room_action_log_bundle } from '@/lib/chat/rules'
import type {
  faq_bundle,
  how_to_use_bundle,
  initial_carousel_bundle,
  initial_carousel_card,
  quick_menu_bundle,
  text_bundle,
  welcome_bundle,
} from '@/lib/chat/message'
import type { chat_locale } from '@/lib/chat/message'
import type { room_mode } from '@/lib/chat/room'
import { create_browser_supabase } from '@/lib/db/browser'
import { handle_chat_message_toast } from '@/lib/output/toast'
import { resolve_realtime_message_subtitle_for_toast } from '@/lib/chat/realtime/toast_decision'

function post_presence(input: {
  room_uuid: string
  participant_uuid: string
  action: 'enter' | 'leave'
  last_channel?: 'web' | 'liff' | 'pwa' | 'line'
}) {
  void fetch('/api/chat/presence', {
    method: 'POST',
    credentials: 'include',
    keepalive: input.action === 'leave',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  }).catch(() => {})
}

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

function ChatCard({ bundle }: { bundle: initial_carousel_card }) {
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

function InitialCarouselBubble({
  bundle,
}: {
  bundle: initial_carousel_bundle
}) {
  return (
    <div className="overflow-x-auto px-5 pb-3">
      <div className="flex w-max gap-4">
        {bundle.cards.map((card) => (
          <ChatCard key={card.bundle_uuid} bundle={card} />
        ))}
      </div>
    </div>
  )
}

function TextBubble({ bundle }: { bundle: text_bundle }) {
  const body = bundle.payload?.text ?? ''
  const from_user = bundle.sender === 'user'

  return (
    <div
      className={[
        'flex px-5',
        from_user ? 'justify-end' : 'justify-start',
      ].join(' ')}
    >
      <div
        className={[
          'max-w-[86%] rounded-[20px] px-4 py-3 shadow-[0_2px_14px_rgba(42,29,24,0.06)]',
          from_user
            ? 'bg-[#c9a77d] text-white'
            : 'bg-white text-[#2a1d18]',
        ].join(' ')}
      >
        <p className="whitespace-pre-wrap text-[15px] font-medium leading-[1.55]">
          {body}
        </p>
      </div>
    </div>
  )
}

function SingleCardRow({ bundle }: { bundle: initial_carousel_card }) {
  return (
    <div className="overflow-x-auto px-5 pb-3">
      <div className="flex w-max gap-4">
        <ChatCard bundle={bundle} />
      </div>
    </div>
  )
}

function ActionLogBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-center px-5">
      <div className="max-w-[92%] rounded-full bg-[#f5efe8] px-4 py-1.5 text-center text-[12px] font-medium leading-[1.45] text-[#8a7568]">
        {text}
      </div>
    </div>
  )
}

function WebChatMessageRow({ message }: { message: archived_message }) {
  const bundle = message.bundle

  if (bundle.bundle_type === 'room_action_log') {
    if (!end_user_should_see_room_action_log_bundle(bundle)) {
      return null
    }

    const text =
      typeof bundle.payload.text === 'string' ? bundle.payload.text.trim() : ''

    if (!text) {
      return null
    }

    return <ActionLogBubble text={text} />
  }

  if (bundle.bundle_type === 'welcome') {
    return <WelcomeBubble bundle={bundle} />
  }

  if (bundle.bundle_type === 'initial_carousel') {
    return <InitialCarouselBubble bundle={bundle} />
  }

  if (
    bundle.bundle_type === 'quick_menu' ||
    bundle.bundle_type === 'how_to_use' ||
    bundle.bundle_type === 'faq'
  ) {
    return <SingleCardRow bundle={bundle} />
  }

  if (bundle.bundle_type === 'text') {
    return <TextBubble bundle={bundle} />
  }

  return null
}

export function WebChat({
  messages,
  room_uuid,
  participant_uuid,
  locale,
  mode,
}: {
  messages: archived_message[]
  room_uuid: string
  participant_uuid: string
  locale: chat_locale
  mode: room_mode
}) {
  if (typeof console !== 'undefined') {
    console.log('ADMIN_REAL_COMPONENT_RENDERED', 'components/chat/web.tsx')
  }

  const chat = useUserChat()
  const { session } = use_session_profile()
  const {
    hydrate_chat,
    append_realtime_message,
    set_scroll_container,
    scroll_to_bottom,
    get_message_list_near_bottom,
    room_uuid: active_room_uuid,
    messages: active_messages,
    is_chat_open,
    room_realtime_channel_ref: room_realtime_channelRef,
  } = chat
  const append_realtime_message_ref = useRef(append_realtime_message)

  const latest_room_uuid_ref = useRef(room_uuid)

  const self_participant_uuid_ref = useRef(participant_uuid)

  const web_rt_ctx_ref = useRef<{
    active_room_uuid: string | null
    participant_uuid: string
    user_uuid: string | null
    tier: string | null
    source_channel: 'web' | 'liff' | 'pwa' | 'line'
  }>({
    active_room_uuid: active_room_uuid ?? room_uuid,
    participant_uuid,
    user_uuid: session?.user_uuid ?? null,
    tier: session?.tier ?? null,
    source_channel: session?.source_channel ?? 'web',
  })

  const active_typing_identity_ref = useRef({
    user_uuid: null as string | null,
    participant_uuid: null as string | null,
    role: null as string | null,
  })

  const subscribed_room_uuid_ref = useRef<string | null>(null)
  const subscribed_chat_actions_room_ref = useRef<string | null>(null)
  const chat_actions_channel_ref = useRef<ReturnType<
    typeof subscribe_chat_actions_realtime
  > | null>(null)

  const did_initial_scroll_ref = useRef(false)
  const typing_rows_ref = useRef<
    Map<
      string,
      {
        participant_uuid: string
        role: string | null
        is_typing: boolean | null
        sent_at: string | null
      }
    >
  >(new Map())
  const [typing_banner, set_typing_banner] = useState<string | null>(null)

  useEffect(() => {
    append_realtime_message_ref.current = append_realtime_message
    latest_room_uuid_ref.current = room_uuid
    self_participant_uuid_ref.current = participant_uuid
    web_rt_ctx_ref.current = {
      active_room_uuid: is_chat_open ? active_room_uuid ?? room_uuid : null,
      participant_uuid,
      user_uuid: session?.user_uuid ?? null,
      tier: session?.tier ?? null,
      source_channel: session?.source_channel ?? 'web',
    }
    active_typing_identity_ref.current = {
      user_uuid: session?.user_uuid ?? null,
      participant_uuid,
      role: 'user',
    }
  }, [
    active_room_uuid,
    append_realtime_message,
    is_chat_open,
    participant_uuid,
    room_uuid,
    session?.source_channel,
    session?.tier,
    session?.user_uuid,
  ])

  const recompute_staff_typing_banner = useCallback(() => {
    const now = new Date()
    let has_other_staff = false
    const self = self_participant_uuid_ref.current

    for (const row of typing_rows_ref.current.values()) {
      if (row.participant_uuid === self) {
        continue
      }

      const role = row.role?.trim().toLowerCase() ?? ''

      if (
        (role === 'admin' ||
          role === 'concierge' ||
          role === 'bot') &&
        chat_typing_is_fresh({
          is_typing: row.is_typing === true,
          sent_at: row.sent_at ?? '',
          now,
        })
      ) {
        has_other_staff = true
        break
      }
    }

    set_typing_banner(has_other_staff ? 'スタッフが入力中...' : null)
  }, [])

  useEffect(() => {
    hydrate_chat({
      room_uuid,
      participant_uuid,
      locale,
      mode,
      messages,
    })
  }, [
    room_uuid,
    participant_uuid,
    locale,
    mode,
    messages,
    hydrate_chat,
  ])

  useEffect(() => {
    post_presence({
      room_uuid,
      participant_uuid,
      action: 'enter',
      last_channel: session?.source_channel ?? 'web',
    })

    return () => {
      post_presence({
        room_uuid,
        participant_uuid,
        action: 'leave',
      })
    }
  }, [participant_uuid, room_uuid, session?.source_channel])

  useEffect(() => {
    if (!room_uuid) {
      return
    }

    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const locked_room = room_uuid
    const ctx = web_rt_ctx_ref.current
    const messages_already_subscribed =
      subscribed_room_uuid_ref.current === locked_room &&
      room_realtime_channelRef.current
    const actions_already_subscribed =
      subscribed_chat_actions_room_ref.current === locked_room &&
      chat_actions_channel_ref.current

    if (!messages_already_subscribed) {
      send_chat_realtime_debug({
        event: 'chat_realtime_client_created',
        room_uuid: locked_room,
        active_room_uuid: ctx.active_room_uuid,
        participant_uuid: ctx.participant_uuid,
        user_uuid: ctx.user_uuid,
        role: 'user',
        tier: ctx.tier,
        source_channel: ctx.source_channel,
        channel_name: chat_room_realtime_channel_name(locked_room),
        phase: 'web_chat_create_browser_supabase',
      })
    } else {
      send_chat_realtime_debug({
        event: 'chat_realtime_subscribe_skipped',
        room_uuid: locked_room,
        active_room_uuid: ctx.active_room_uuid,
        participant_uuid: ctx.participant_uuid,
        user_uuid: ctx.user_uuid,
        role: 'user',
        tier: ctx.tier,
        source_channel: ctx.source_channel,
        channel_name: chat_room_realtime_channel_name(locked_room),
        cleanup_reason: 'duplicate_messages_subscribe',
        phase: 'web_chat_realtime_guard',
      })
    }

    let channel = room_realtime_channelRef.current

    if (!messages_already_subscribed) {
      channel = subscribe_chat_room_realtime({
      supabase,
      room_uuid: locked_room,
      active_room_uuid: ctx.active_room_uuid,
      participant_uuid: ctx.participant_uuid,
      user_uuid: ctx.user_uuid,
      role: 'user',
      tier: ctx.tier,
      source_channel: ctx.source_channel,
      active_typing_identity_ref,
      on_message: (message) => {
        if (!message) {
          return
        }

        if (
          message.bundle.bundle_type === 'room_action_log' &&
          !end_user_should_see_room_action_log_bundle(message.bundle)
        ) {
          return
        }

        const dbg = web_rt_ctx_ref.current
        const near_bottom_before = get_message_list_near_bottom()
        const update_result = append_realtime_message_ref.current(message)

        if (update_result.dedupe_hit) {
          return
        }

        handle_chat_message_toast({
          room_uuid: message.room_uuid,
          active_room_uuid: dbg.active_room_uuid,
          message_uuid: message.archive_uuid,
          sender_user_uuid: message.sender_user_uuid ?? null,
          sender_participant_uuid: message.sender_participant_uuid ?? null,
          sender_role: message.sender_role ?? message.bundle.sender ?? null,
          active_user_uuid: dbg.user_uuid,
          active_participant_uuid: dbg.participant_uuid,
          active_role: 'user',
          role: 'user',
          tier: dbg.tier,
          source_channel: dbg.source_channel,
          target_path: '/user',
          phase: 'web_chat_realtime_message',
          is_scrolled_to_bottom: near_bottom_before,
          subtitle: resolve_realtime_message_subtitle_for_toast(message, null),
          scroll_to_bottom: () => {
            scroll_to_bottom('smooth')
          },
        })

        send_chat_realtime_debug({
          event: 'chat_realtime_message_state_updated',
          room_uuid: locked_room,
          active_room_uuid: dbg.active_room_uuid,
          participant_uuid: dbg.participant_uuid,
          user_uuid: dbg.user_uuid,
          role: 'user',
          tier: dbg.tier,
          source_channel: dbg.source_channel,
          channel_name: chat_room_realtime_channel_name(locked_room),
          event_name: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_uuid=eq.${locked_room}`,
          payload_room_uuid: message.room_uuid,
          payload_message_uuid: message.archive_uuid,
          prev_message_count: update_result.prev_message_count,
          next_message_count: update_result.next_message_count,
          dedupe_hit: update_result.dedupe_hit,
          ignored_reason: update_result.dedupe_hit
            ? 'message_uuid_dedupe'
            : null,
          phase: 'web_chat_realtime_state_update',
        })
      },
      on_typing: (typing) => {
        typing_rows_ref.current.set(typing.participant_uuid, {
          participant_uuid: typing.participant_uuid,
          role: typing.role,
          is_typing: typing.is_typing,
          sent_at: typing.sent_at,
        })
        recompute_staff_typing_banner()

        window.setTimeout(recompute_staff_typing_banner, 3_100)

        const dbg = web_rt_ctx_ref.current

        send_chat_realtime_debug({
          event: 'chat_typing_state_updated',
          room_uuid: locked_room,
          active_room_uuid: dbg.active_room_uuid,
          participant_uuid: dbg.participant_uuid,
          user_uuid: dbg.user_uuid,
          role: 'user',
          tier: dbg.tier,
          source_channel: dbg.source_channel,
          channel_name: chat_room_realtime_channel_name(locked_room),
          event_name: 'typing',
          payload_room_uuid: typing.room_uuid,
          sender_user_uuid: typing.user_uuid ?? null,
          sender_participant_uuid: typing.participant_uuid,
          active_participant_uuid: dbg.participant_uuid,
          sender_role: typing.role,
          display_name: typing.display_name ?? null,
          is_typing: typing.is_typing,
          phase: 'web_chat_typing_state_update',
        })
      },
    })

      subscribed_room_uuid_ref.current = locked_room
      room_realtime_channelRef.current = channel
    }

    let actions_channel = chat_actions_channel_ref.current

    if (!actions_already_subscribed) {
      actions_channel = subscribe_chat_actions_realtime({
        supabase,
        room_uuid: locked_room,
        scope: 'user_active',
        source_channel: ctx.source_channel,
        on_action: (action, inserted_index) => {
          const archived = chat_action_to_archived_message(action)

          if (!end_user_should_see_room_action_log_bundle(archived.bundle)) {
            send_chat_realtime_debug({
              event: 'chat_action_realtime_ignored',
              room_uuid: locked_room,
              active_room_uuid: ctx.active_room_uuid,
              participant_uuid: ctx.participant_uuid,
              user_uuid: ctx.user_uuid,
              role: 'user',
              tier: ctx.tier,
              source_channel: ctx.source_channel,
              action_uuid: action.action_uuid,
              event_type: action.action_type,
              actor_name: action.actor_display_name,
              inserted_index,
              ignored_reason: 'not_visible_to_user',
              phase: 'web_chat_support_action',
            })

            return
          }

          const near_bottom_before = get_message_list_near_bottom()
          const update_result = append_realtime_message_ref.current(archived)

          if (update_result.dedupe_hit) {
            send_chat_realtime_debug({
              event: 'chat_action_realtime_ignored',
              room_uuid: locked_room,
              active_room_uuid: ctx.active_room_uuid,
              participant_uuid: ctx.participant_uuid,
              user_uuid: ctx.user_uuid,
              role: 'user',
              tier: ctx.tier,
              source_channel: ctx.source_channel,
              action_uuid: action.action_uuid,
              event_type: action.action_type,
              actor_name: action.actor_display_name,
              inserted_index,
              ignored_reason: 'action_uuid_dedupe',
              phase: 'web_chat_support_action',
            })

            return
          }

          emit_chat_action_realtime_rendered({
            room_uuid: locked_room,
            action,
            inserted_index,
            source_channel: ctx.source_channel,
            phase: 'web_chat_support_action',
          })

          if (near_bottom_before) {
            scroll_to_bottom('smooth')
          }
        },
      })

      subscribed_chat_actions_room_ref.current = locked_room
      chat_actions_channel_ref.current = actions_channel
    }

    return () => {
      const cleanup_reason =
        latest_room_uuid_ref.current !== locked_room
          ? 'room_uuid_changed'
          : 'unmount'
      const dbg = web_rt_ctx_ref.current

      if (channel) {
        cleanup_chat_room_realtime({
          supabase,
          channel,
          room_uuid: locked_room,
          active_room_uuid: dbg.active_room_uuid,
          participant_uuid: dbg.participant_uuid,
          user_uuid: dbg.user_uuid,
          role: 'user',
          tier: dbg.tier,
          source_channel: dbg.source_channel,
          cleanup_reason,
        })
      }

      if (actions_channel) {
        cleanup_chat_actions_realtime({
          supabase,
          channel: actions_channel,
          room_uuid: locked_room,
          scope: 'user_active',
          cleanup_reason,
        })
      }

      if (subscribed_room_uuid_ref.current === locked_room) {
        subscribed_room_uuid_ref.current = null
      }

      if (subscribed_chat_actions_room_ref.current === locked_room) {
        subscribed_chat_actions_room_ref.current = null
      }

      if (room_realtime_channelRef.current === channel) {
        room_realtime_channelRef.current = null
      }

      if (chat_actions_channel_ref.current === actions_channel) {
        chat_actions_channel_ref.current = null
      }
    }
  }, [room_uuid, scroll_to_bottom, get_message_list_near_bottom])

  const render_messages = active_room_uuid === room_uuid
    ? active_messages
    : messages

  const visible_messages = render_messages.filter((message) => {
    if (message.bundle.bundle_type === 'room_action_log') {
      return end_user_should_see_room_action_log_bundle(message.bundle)
    }

    return true
  })

  useEffect(() => {
    scroll_to_bottom('auto')
  }, [scroll_to_bottom])

  useEffect(() => {
    if (render_messages.length === 0) {
      return
    }

    if (!did_initial_scroll_ref.current) {
      scroll_to_bottom('auto')
      did_initial_scroll_ref.current = true
      return
    }

    scroll_to_bottom('smooth')
  }, [render_messages.length, scroll_to_bottom])

  useEffect(() => {
    if (!typing_banner) {
      return
    }

    scroll_to_bottom('smooth')
  }, [scroll_to_bottom, typing_banner])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-debug-component="components/chat/web.tsx"
    >
      <div data-debug-component="components/chat/web.tsx">
        DEBUG_ADMIN_CHAT_COMPONENT_components/chat/web.tsx
      </div>
      <div
        ref={set_scroll_container}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4"
      >
        <div className="flex flex-col gap-5">
          {visible_messages.map((message) => (
            <WebChatMessageRow
              key={message.archive_uuid}
              message={message}
            />
          ))}
        </div>
        {typing_banner ? (
          <div className="px-5 pb-2 pt-4 text-center text-[12px] font-medium text-[#8a7568]">
            {typing_banner}
          </div>
        ) : null}
        <div className="h-[260px] shrink-0" aria-hidden="true" />
      </div>
    </div>
  )
}
