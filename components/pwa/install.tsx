'use client'

import { Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  is_standalone_pwa,
  post_pwa_debug,
  register_push_subscription,
  register_pwa_service_worker,
  set_pwa_source_channel_cookie,
  type pwa_before_install_prompt_event,
} from '@/lib/pwa/client'

type PwaInstallButtonProps = {
  can_install: boolean
  user_uuid: string | null
  participant_uuid: string | null
  room_uuid: string | null
  role: string | null
  tier: string | null
  label: string
}

function initial_pwa_installed_state() {
  if (typeof window === 'undefined') {
    return false
  }

  return is_standalone_pwa()
}

export default function PwaInstallButton(props: PwaInstallButtonProps) {
  const prompt_ref = useRef<pwa_before_install_prompt_event | null>(null)
  const [installed, set_installed] = useState(initial_pwa_installed_state)
  const [prompt_available, set_prompt_available] = useState(false)
  const [is_busy, set_is_busy] = useState(false)

  useEffect(() => {
    const standalone = is_standalone_pwa()

    if (standalone) {
      set_pwa_source_channel_cookie()
      void register_pwa_service_worker()
    }
  }, [])

  useEffect(() => {
    function handle_before_install_prompt(event: Event) {
      event.preventDefault()
      prompt_ref.current = event as pwa_before_install_prompt_event
      set_prompt_available(true)

      post_pwa_debug({
        event: 'pwa_install_prompt_available',
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        role: props.role,
        tier: props.tier,
        source_channel: 'web',
        room_uuid: props.room_uuid,
        app_visibility_state: document.visibilityState,
        phase: 'beforeinstallprompt',
      })
    }

    function handle_app_installed() {
      set_installed(true)
      set_prompt_available(false)
      set_pwa_source_channel_cookie()

      post_pwa_debug({
        event: 'pwa_install_succeeded',
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        role: props.role,
        tier: props.tier,
        source_channel: 'pwa',
        room_uuid: props.room_uuid,
        app_visibility_state: document.visibilityState,
        phase: 'appinstalled',
      })

      void register_push_subscription({
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        room_uuid: props.room_uuid,
        role: props.role,
        tier: props.tier,
      })
    }

    window.addEventListener('beforeinstallprompt', handle_before_install_prompt)
    window.addEventListener('appinstalled', handle_app_installed)

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handle_before_install_prompt,
      )
      window.removeEventListener('appinstalled', handle_app_installed)
    }
  }, [
    props.participant_uuid,
    props.role,
    props.room_uuid,
    props.tier,
    props.user_uuid,
  ])

  if (!props.can_install || installed || !prompt_available) {
    return null
  }

  async function handle_click() {
    const prompt = prompt_ref.current

    if (!prompt || is_busy) {
      return
    }

    set_is_busy(true)

    post_pwa_debug({
      event: 'pwa_install_started',
      user_uuid: props.user_uuid,
      participant_uuid: props.participant_uuid,
      role: props.role,
      tier: props.tier,
      source_channel: 'web',
      room_uuid: props.room_uuid,
      app_visibility_state: document.visibilityState,
      phase: 'install_prompt',
    })

    try {
      await prompt.prompt()
      const choice = await prompt.userChoice

      if (choice.outcome !== 'accepted') {
        throw new Error('install_prompt_dismissed')
      }

      set_pwa_source_channel_cookie()
      set_installed(true)
      set_prompt_available(false)

      post_pwa_debug({
        event: 'pwa_install_succeeded',
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        role: props.role,
        tier: props.tier,
        source_channel: 'pwa',
        room_uuid: props.room_uuid,
        app_visibility_state: document.visibilityState,
        phase: 'install_prompt',
      })

      await register_push_subscription({
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        room_uuid: props.room_uuid,
        role: props.role,
        tier: props.tier,
      })
    } catch (error) {
      post_pwa_debug({
        event: 'pwa_install_failed',
        user_uuid: props.user_uuid,
        participant_uuid: props.participant_uuid,
        role: props.role,
        tier: props.tier,
        source_channel: 'web',
        room_uuid: props.room_uuid,
        app_visibility_state: document.visibilityState,
        error_message: error instanceof Error ? error.message : String(error),
        phase: 'install_prompt',
      })
    } finally {
      prompt_ref.current = null
      set_is_busy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handle_click}
      disabled={is_busy}
      className="mt-auto flex w-full items-center gap-3 rounded-2xl border border-[#eadfd7] bg-white px-4 py-3 text-left text-[14px] font-semibold text-[#2a1d18] shadow-[0_2px_10px_rgba(42,29,24,0.04)] disabled:opacity-60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3ebe2] text-[#9b6b4b]">
        <Download className="h-4.5 w-4.5" strokeWidth={2.2} />
      </span>
      <span>{props.label}</span>
    </button>
  )
}
