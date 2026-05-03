type LoadingProps = {
  text?: string
  full_screen?: boolean
}

export default function Loading({
  text = 'LOADING...',
  full_screen = false,
}: LoadingProps) {
  const root_class_name = full_screen
    ? 'fixed inset-0 z-[2147483647] flex items-center justify-center bg-black px-6 text-white'
    : 'flex items-center justify-center px-6 py-10 text-current'

  return (
    <div className={root_class_name} role="status" aria-live="polite">
      <div className="flex scale-100 animate-pulse flex-col items-center gap-5">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 rounded-full border border-current opacity-20" />
          <div className="absolute inset-0 animate-spin rounded-full border border-transparent border-t-current" />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
        </div>

        <p className="text-[11px] font-medium uppercase leading-none tracking-[0.32em] opacity-85">
          {text}
        </p>
      </div>
    </div>
  )
}
