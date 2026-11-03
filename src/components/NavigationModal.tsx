import { useEffect } from 'react'
import { useNavigationStore } from './navigationStore'
import {
  copyCoordinatesToClipboard,
  NAVIGATION_SERVICES,
  openExternalNavigation,
} from '../utils/navigation'
import { useToastStore } from './toastStore'
import {
  CopyIcon,
  ExternalLinkIcon,
  NavigateIcon,
  PinIcon,
} from './Icons'

export default function NavigationModal() {
  const { target, close } = useNavigationStore()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  if (!target) return null

  function handleCopyCoords() {
    if (!target) return
    copyCoordinatesToClipboard(target).then((ok) => {
      if (ok) {
        useToastStore
          .getState()
          .show(`已复制坐标：${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`)
      }
    })
  }

  function handleCopyTitle() {
    if (!target) return
    navigator.clipboard.writeText(target.title).then(() => {
      useToastStore.getState().show(`已复制地点：${target.title}`)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="apple-modal-backdrop fixed inset-0 z-[1200] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={close}
    >
      <div
        className="apple-modal-surface flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-start justify-between border-b border-border/70 p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-accent">
              <NavigateIcon size={12} />
              <span>外部地图导航</span>
            </div>
            <h3 className="mt-1 truncate text-[16px] font-semibold text-text">
              {target.title}
            </h3>
            <p className="mt-0.5 truncate text-[12px] text-text-muted">
              {target.location || `${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="ml-3 shrink-0 rounded-full p-1.5 text-text-faint transition-colors hover:bg-surface-2 hover:text-text"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 导航方式列表 */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-5">
          <div className="text-[11.5px] font-medium text-text-faint">
            选择要调用的地图应用：
          </div>

          <div className="grid gap-2">
            {NAVIGATION_SERVICES.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => {
                  openExternalNavigation(target, service.id)
                  close()
                }}
                className="flex items-center justify-between rounded-xl border border-border/80 bg-white/80 p-3 text-left transition-all hover:border-accent/60 hover:bg-white hover:shadow-sm active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white font-bold text-[13px] shadow-sm"
                    style={{ background: service.iconColor }}
                  >
                    {service.name.slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-[13.5px] font-medium text-text">
                      {service.name}
                    </div>
                    <div className="text-[11px] text-text-faint">
                      {service.subtitle}
                    </div>
                  </div>
                </div>
                <ExternalLinkIcon size={14} className="text-text-faint" />
              </button>
            ))}
          </div>

          {/* 辅助工具：复制坐标与地名 */}
          <div className="mt-3.5 flex gap-2 border-t border-border/60 pt-3.5">
            <button
              type="button"
              onClick={handleCopyCoords}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[12px] font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <CopyIcon size={12} />
              <span>复制坐标</span>
            </button>
            <button
              type="button"
              onClick={handleCopyTitle}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[12px] font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <PinIcon size={12} />
              <span>复制地名</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
