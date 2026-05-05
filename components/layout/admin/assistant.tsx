import Image from 'next/image'

type AdminAssistantProps = {
  display_name: string | null
}

export default function AdminAssistant({
  display_name,
}: AdminAssistantProps) {
  const operator_name = display_name?.trim() || 'Admin'

  return (
    <section className="w-full bg-white px-4 py-3">
      <div className="mx-auto flex max-w-[1120px] items-center gap-3 rounded-lg border border-gray-300 bg-gray-50 p-3 shadow-sm">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-300 bg-white">
          <Image
            src="/images/RoboNeko.svg"
            alt="RoboNeko"
            width={58}
            height={58}
            priority
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight text-black">
            AI Assistant
          </div>
          <div className="mt-1 truncate text-xs font-medium leading-tight text-gray-600">
            {operator_name}
          </div>
        </div>

        <div className="h-2 w-2 shrink-0 rounded-full bg-black" />
      </div>
    </section>
  )
}
