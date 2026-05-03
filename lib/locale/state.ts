'use client'

import {
  normalize_locale,
  save_locale,
  type locale_key,
} from './action'

const locale_storage_key = 'amp_locale'
const locale_event_name = 'amp_locale_changed'

type locale_event = CustomEvent<{
  locale: locale_key
}>

export function get_locale() {
  if (typeof window === 'undefined') {
    return 'ja'
  }

  return normalize_locale(window.localStorage.getItem(locale_storage_key))
}

function notify_locale(locale: locale_key) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent(locale_event_name, {
      detail: {
        locale,
      },
    }),
  )
}

export function set_locale(locale: locale_key) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(locale_storage_key, locale)
  }

  notify_locale(locale)
  void save_locale(locale)
}

export function subscribe_locale(callback: (locale: locale_key) => void) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const listener = (event: Event) => {
    const locale_event = event as locale_event

    callback(normalize_locale(locale_event.detail?.locale))
  }

  window.addEventListener(locale_event_name, listener)

  return () => {
    window.removeEventListener(locale_event_name, listener)
  }
}
