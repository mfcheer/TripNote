import { useToastStore } from './toastStore'

// 底部轻提示，可带"撤销"
export default function Toast() {
  const { open, message, undo, undoFn } = useToastStore()
  if (!open) return null
  return (
    <div className="pointer-events-none fixed bottom-[76px] left-1/2 z-[1100] w-[calc(100%-24px)] -translate-x-1/2 md:bottom-6 md:w-auto">
      <div className="pointer-events-auto flex items-center justify-center gap-3 rounded-lg bg-[#26313b] px-4 py-2.5 text-[13px] text-white shadow-[0_6px_24px_rgba(38,49,59,0.24)]">
        <span>{message}</span>
        {undoFn && (
          <button onClick={undo} className="rounded font-medium text-[#d9e6ef] transition-colors hover:text-white">
            撤销
          </button>
        )}
      </div>
    </div>
  )
}
