'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import AdminReceptionRoomInterior from '@/components/admin/reception/room_interior'
import { use_admin_reception_support_presence } from '@/components/admin/reception/admin_support_presence'
import type { admin_reception_room_shell_props } from '@/components/admin/reception/room_props'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import {
  append_chat_action_to_admin_timeline,
  emit_chat_action_realtime_rendered,
  type chat_action_realtime_payload,
} from '@/lib/chat/realtime/chat_actions'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import {
  use_chat_realtime,
  type chat_realtime_hook_append_result,
} from '@/lib/chat/realtime/use_chat_realtime'
import {
  archived_message_to_timeline_message,
  merge_timeline_message_rows,
  type chat_room_timeline_message,
} from '@/lib/chat/timeline_display'
import { handle_chat_message_toast } from '@/lib/output/toast'
import { resolve_realtime_message_subtitle_for_toast } from '@/lib/chat/realtime/toast_decision'

import { use_support_lifecycle } from './use_support_lifecycle'

const component_file = 'components/admin/reception/live.tsx'

export type admin_reception_live_props = admin_reception_room_shell_props

export default function AdminReceptionLive(props: admin_reception_live_props) {
  const live_mounted_room_ref = useRef<string | null>(null)
  const room_uuid = (props.room?.room_uuid ?? props.room_uuid ?? '').trim()
  const [live_messages, set_live_messages] = useState<chat_room_timeline_message[]>(
    () => props.messages,
  )
  const [external_support_action, set_external_support_action] =
    useState<chat_action_realtime_payload | null>(null)
  const realtime_messages_channel_ref = useRef<RealtimeChannel | null>(null)
  const room_display_title_ref = useRef(props.customer_display_name)

  if (room_uuid && live_mounted_room_ref.current !== room_uuid) {
    live_mounted_room_ref.current = room_uuid

    send_admin_chat_debug({
      event: 'admin_reception_live_mounted',
      room_uuid,
      active_room_uuid: room_uuid,
      admin_user_uuid: props.admin_user_uuid.trim() || null,
      admin_participant_uuid: props.admin_participant_uuid.trim() || null,
      component_file,
      phase: 'admin_reception_live',
    })
  }

  useEffect(() => {
    room_display_title_ref.current = props.customer_display_name
  }, [props.customer_display_name])

  useEffect(() => {
    set_live_messages(
      merge_timeline_message_rows([], props.messages, 'initial_fetch').rows,
    )
  }, [props.messages, props.room_uuid])

  useEffect(() => {
    if (!external_support_action) {
      return
    }

    if (external_support_action.room_uuid.trim() !== room_uuid) {
      return
    }

    set_live_messages((previous) => {
      const merged = append_chat_action_to_admin_timeline(
        previous,
        external_support_action,
      )

      if (merged.appended) {
        emit_chat_action_realtime_rendered({
          room_uuid: external_support_action.room_uuid,
          action: external_support_action,
          inserted_index: merged.rows.length - 1,
          source_channel: 'admin',
          phase: 'admin_reception_live_support_action',
        })
      }

      return merged.appended ? merged.rows : previous
    })
  }, [external_support_action, room_uuid])

  const handle_support_action = useCallback(
    (action: chat_action_realtime_payload) => {
      set_external_support_action(action)
    },
    [],
  )

  const handle_realtime_message = useCallback(
    (archived: realtime_archived_message) => {
      const active_room_focus = room_uuid
      const mapped = archived_message_to_timeline_message({
        archive_uuid: archived.archive_uuid,
        room_uuid: archived.room_uuid,
        sequence: archived.sequence,
        created_at: archived.created_at,
        bundle: archived.bundle,
      })

      let update_result = {
        prev_count: 0,
        next_count: 0,
        dedupe_hit: false,
      }

      set_live_messages((previous) => {
        const merged = merge_timeline_message_rows(
          previous,
          [mapped],
          'realtime',
        )

        update_result = {
          prev_count: previous.length,
          next_count: merged.rows.length,
          dedupe_hit: merged.duplicates_skipped.length > 0,
        }

        return merged.rows
      })

      if (!update_result.dedupe_hit) {
        handle_chat_message_toast({
          room_uuid: archived.room_uuid,
          active_room_uuid: active_room_focus,
          message_uuid: archived.archive_uuid,
          sender_user_uuid: archived.sender_user_uuid ?? null,
          sender_participant_uuid: archived.sender_participant_uuid ?? null,
          sender_role: archived.sender_role ?? archived.bundle.sender ?? null,
          active_user_uuid: props.staff_user_uuid,
          active_participant_uuid: props.staff_participant_uuid,
          active_role: 'admin',
          role: 'admin',
          tier: props.staff_tier,
          source_channel: 'admin',
          target_path: `/admin/reception/${archived.room_uuid}`,
          phase: 'admin_reception_room_realtime_message',
          is_scrolled_to_bottom: true,
          subtitle: resolve_realtime_message_subtitle_for_toast(
            archived,
            room_display_title_ref.current,
          ),
          scroll_to_bottom: () => {},
        })
      }

      return update_result
    },
    [
      room_uuid,
      props.staff_participant_uuid,
      props.staff_tier,
      props.staff_user_uuid,
    ],
  )

  const handle_realtime_action = useCallback(
    (action: chat_action_realtime_payload, inserted_index: number) => {
      let update_result = {
        prev_count: 0,
        next_count: 0,
        dedupe_hit: false,
        appended: false,
      }

      set_live_messages((previous) => {
        const merged = append_chat_action_to_admin_timeline(previous, action)

        update_result = {
          prev_count: previous.length,
          next_count: merged.rows.length,
          dedupe_hit: !merged.appended,
          appended: merged.appended,
        }

        return merged.appended ? merged.rows : previous
      })

      if (update_result.appended) {
        emit_chat_action_realtime_rendered({
          room_uuid: action.room_uuid,
          action,
          inserted_index,
          source_channel: 'admin',
          phase: 'admin_reception_live_realtime_action',
        })
      }

      return update_result
    },
    [],
  )

  const append_live_timeline_messages = useCallback(
    (addition: chat_room_timeline_message[]) => {
      set_live_messages((previous) =>
        merge_timeline_message_rows(previous, addition, 'realtime').rows,
      )
    },
    [],
  )

  const lifecycle = use_support_lifecycle({
    room_uuid,
    admin_user_uuid: props.admin_user_uuid,
    admin_participant_uuid: props.admin_participant_uuid,
    on_support_action: handle_support_action,
  })

  use_chat_realtime({
    owner: 'admin',
    room_uuid,
    active_room_uuid: room_uuid,
    enabled: Boolean(room_uuid),
    participant_uuid: props.staff_participant_uuid,
    user_uuid: props.staff_user_uuid,
    role: 'admin',
    tier: props.staff_tier,
    source_channel: 'admin',
    receiver_participant_uuid: props.staff_participant_uuid,
    export_messages_channel_ref: realtime_messages_channel_ref,
    on_message: handle_realtime_message,
    on_action: handle_realtime_action,
  })

  use_admin_reception_support_presence({
    room_uuid,
    staff_participant_uuid: props.staff_participant_uuid,
    staff_user_uuid: props.staff_user_uuid,
    staff_tier: props.staff_tier,
    enabled: lifecycle.owner_registered,
    support_session_ref: lifecycle.support_session_ref,
    on_support_action: handle_support_action,
    on_recover_enter: () => {
      void lifecycle.run_enter_support_room('visibility_focus')
    },
  })

  return (
    <AdminReceptionRoomInterior
      {...props}
      room_uuid={room_uuid}
      live_messages={live_messages}
      realtime_messages_channel_ref={realtime_messages_channel_ref}
      append_live_timeline_messages={append_live_timeline_messages}
    />
  )
}
