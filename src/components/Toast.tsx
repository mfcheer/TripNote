import { useToastStore } from './toastStore'
import { AlertCircleIcon, CheckCircleIcon } from './Icons'

// 底部轻提示，可带"撤销"
export default function Toast() {
  const { open, message, tone, undo, undoFn } = useToastStore()
  if (!open) return null
  const Icon = tone === 'error' ? AlertCircleIcon : CheckCircleIcon
  return (
    <div className="pointer-events-none fixed bottom-[76px] left-1/2 z-[1100] w-[calc(100%-24px)] -translate-x-1/2 md:bottom-6 md:w-auto">
      <div role="status" aria-live="polite" className="pointer-events-auto flex min-h-10 items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-[#30393e]/96 px-3.5 py-2.5 text-[13px] text-white shadow-[0_10px_30px_rgba(32,40,46,0.2)] backdrop-blur-md">
        <Icon size={15} className={tone === 'error' ? 'text-[#f3a294]' : tone === 'neutral' ? 'text-white/70' : 'text-[#c9ded7]'} aria-hidden="true" />
        <span className="leading-snug">{message}</span>
        {undoFn && (
          <button onClick={undo} className="ml-1 rounded-md bg-white/10 px-2 py-1 font-medium text-white transition-colors hover:bg-white/18">
            撤销
          </button>
        )}
      </div>
    </div>
  )
}
