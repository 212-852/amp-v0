'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { driver_application_record } from '@/lib/driver/action'

const content = {
  title: 'ドライバー応募フォーム',
  description:
    '以下の内容をご入力ください。送信後、AI/運営による審査と書類確認を行います。',
  submit: '応募する',
  pending: '送信中...',
  success: '応募を受け付けました。審査結果は後日ご連絡します。',
  error: '送信に失敗しました。入力内容をご確認のうえ再度お試しください。',
  fields: {
    full_name: 'お名前',
    phone: '電話番号',
    residence_area: 'お住まいのエリア',
    experience_years: '送迎・ドライバー経験年数',
    availability: '稼働可能な曜日・時間帯',
    message: 'メッセージ（任意）',
  },
} as const

type DriverApplyFormProps = {
  initial_application: driver_application_record | null
}

export default function DriverApplyForm({
  initial_application,
}: DriverApplyFormProps) {
  const router = useRouter()
  const [full_name, set_full_name] = useState(initial_application?.full_name ?? '')
  const [phone, set_phone] = useState(initial_application?.phone ?? '')
  const [residence_area, set_residence_area] = useState(
    initial_application?.residence_area ?? '',
  )
  const [experience_years, set_experience_years] = useState(
    initial_application?.experience_years ?? '',
  )
  const [availability, set_availability] = useState(
    initial_application?.availability ?? '',
  )
  const [message, set_message] = useState(initial_application?.message ?? '')
  const [is_pending, set_is_pending] = useState(false)
  const [status_message, set_status_message] = useState<string | null>(
    initial_application ? content.success : null,
  )
  const [error_message, set_error_message] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (is_pending) {
      return
    }

    set_is_pending(true)
    set_error_message(null)
    set_status_message(null)

    try {
      const response = await fetch('/api/driver/apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name,
          phone,
          residence_area,
          experience_years,
          availability,
          message,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean }
        | null

      if (!response.ok || !payload?.ok) {
        set_error_message(content.error)
        return
      }

      set_status_message(content.success)
      router.refresh()
    } catch {
      set_error_message(content.error)
    } finally {
      set_is_pending(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event)
      }}
      className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-10"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold leading-tight text-black">
          {content.title}
        </h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          {content.description}
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-black">
          {content.fields.full_name}
          <input
            required
            value={full_name}
            onChange={(event) => set_full_name(event.target.value)}
            className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-black"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-black">
          {content.fields.phone}
          <input
            required
            value={phone}
            onChange={(event) => set_phone(event.target.value)}
            className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-black"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-black">
          {content.fields.residence_area}
          <input
            required
            value={residence_area}
            onChange={(event) => set_residence_area(event.target.value)}
            className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-black"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-black">
          {content.fields.experience_years}
          <input
            value={experience_years}
            onChange={(event) => set_experience_years(event.target.value)}
            className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-black"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-black">
          {content.fields.availability}
          <textarea
            required
            rows={3}
            value={availability}
            onChange={(event) => set_availability(event.target.value)}
            className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-black"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-black">
          {content.fields.message}
          <textarea
            rows={4}
            value={message}
            onChange={(event) => set_message(event.target.value)}
            className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-black"
          />
        </label>
      </div>

      {status_message ? (
        <p
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          {status_message}
        </p>
      ) : null}

      {error_message ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error_message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={is_pending}
        className="inline-flex h-12 items-center justify-center rounded-full bg-black px-6 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {is_pending ? content.pending : content.submit}
      </button>
    </form>
  )
}
