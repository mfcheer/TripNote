import { useEffect } from 'react'
import { useConfirmStore } from './confirmStore'
import ModalShell, { overlayPrimaryButtonClass, overlaySecondaryButtonClass } from './OverlayShell'

// 全局确认/提示弹窗：替代原生 confirm/alert
export default function ConfirmDialog() {
  const { open, title, message, danger, mode, close } = useConfirmStore()

  useEffect(() => {
    if (!open) return
    function confirmOnEnter(event: KeyboardEvent) {
      if (event.key === 'Enter') close(mode === 'confirm')
    }
    window.addEventListener('keydown', confirmOnEnter)
    return () => window.removeEventListener('keydown', confirmOnEnter)
  }, [close, mode, open])

  if (!open) return null

  return (
    <ModalShell
      title={title}
      description={message}
      onClose={() => close(false)}
      closeOnBackdrop={mode === 'confirm'}
      size="sm"
      mobile="dialog"
      showClose={false}
      bodyClassName="hidden"
      footer={<>
        {mode === 'confirm' && (
          <button onClick={() => close(false)} className={overlaySecondaryButtonClass}>取消</button>
        )}
        <button
          autoFocus
          onClick={() => close(true)}
          className={`${overlayPrimaryButtonClass} ${danger ? '!bg-red-600 hover:!bg-red-700' : ''}`}
        >
          {mode === 'confirm' ? '确认' : '知道了'}
        </button>
      </>}
    >
      <span />
    </ModalShell>
  )
}
