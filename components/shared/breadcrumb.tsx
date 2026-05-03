import { Fragment } from 'react'

import Link from 'next/link'

import type { breadcrumb_item } from '@/lib/breadcrumb'

export type { breadcrumb_item }

type breadcrumb_props = {
  items: breadcrumb_item[]
}

export default function Breadcrumb(props: breadcrumb_props) {
  const { items } = props

  if (items.length === 0) {
    return null
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="mt-1.5 flex min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-hidden text-[12px] font-medium leading-[1.6] text-[#6d5c52]"
    >
      {items.map((item, index) => {
        const is_last = index === items.length - 1

        return (
          <Fragment key={`${item.href}-${index}`}>
            {index > 0 ? (
              <span
                aria-hidden
                className="shrink-0 select-none text-[#b49b8a]"
              >
                {'>'}
              </span>
            ) : null}

            {is_last ? (
              <span className="min-w-0 flex-1 basis-0 truncate text-[#2a1d18]">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="shrink-0 text-[#6d5c52] transition-opacity hover:opacity-80"
              >
                {item.label}
              </Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
