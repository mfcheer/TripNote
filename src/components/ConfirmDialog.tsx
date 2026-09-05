import { useEffect } from 'react'
import { useConfirmStore } from './confirmStore'

// 全局确认/提示弹窗：替代原生 confirm/alert
export default function ConfirmDialog() {
  const { open, title, message, danger, mode, close } = useConfirmStore()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(mode === 'confirm')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, mode, close])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && mode === 'confirm' && close(false)}
    >
      <div className="w-full max-w-[340px] rounded-xl border border-border bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
        <div className="text-[15px] font-semibold">{title}</div>
        {message && (
          <div className="mt-2 text-[13px] leading-relaxed text-text-muted">{message}</div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {mode === 'confirm' && (
            <button
              onClick={() => close(false)}
              className="rounded-md border border-border px-3.5 py-1.5 text-[13px] text-text-muted transition-colors hover:bg-surface"
            >
              取消
            </button>
          )}
          <button
            autoFocus
            onClick={() => close(true)}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors ${
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            {mode === 'confirm' ? '确认' : '知道了'}
          </button>
        </div>
      </div>
    </div>
  )
}
