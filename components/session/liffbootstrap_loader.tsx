'use client'

import dynamic from 'next/dynamic'

const LiffBootstrap = dynamic(
  () => import('@/components/session/liffbootstrap'),
  { ssr: false, loading: () => null },
)

export default function LiffBootstrapLoader() {
  return <LiffBootstrap />
}
