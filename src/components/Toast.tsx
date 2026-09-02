import { useToastStore } from './toastStore'

// 底部轻提示，可带"撤销"
export default function Toast() {
  const { open, message, undo, undoFn } = useToastStore()
  if (!open) return null
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[1100] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-[#1f2937] px-4 py-2.5 text-[13px] text-white shadow-[0_6px_24px_rgba(0,0,0,0.25)]">
        <span>{message}</span>
        {undoFn && (
          <button onClick={undo} className="rounded font-medium text-[#5eead4] transition-colors hover:text-white">
            撤销
          </button>
        )}
      </div>
    </div>
  )
}
