import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const overlayPrimaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-md bg-action px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40'

export const overlaySecondaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text'

export function OverlayCloseButton({ onClick, label = '关闭' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[22px] leading-none text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
      aria-label={label}
    >
      ×
    </button>
  )
}

export function SheetHandle() {
  return <div className="mx-auto mb-2.5 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" aria-hidden="true" />
}

export function OverlayHeader({
  title,
  description,
  onClose,
  titleId,
}: {
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  titleId?: string
}) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/80 px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <div id={titleId} className="truncate text-[16px] font-semibold tracking-[-0.01em] text-text">{title}</div>
        {description && <div className="mt-1 text-[12px] leading-relaxed text-text-muted">{description}</div>}
      </div>
      <OverlayCloseButton onClick={onClose} />
    </header>
  )
}

const sizeClass = {
  sm: 'sm:max-w-[360px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[760px]',
}

export default function ModalShell({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  mobile = 'sheet',
  showClose = true,
  ariaLabel,
  bodyClassName = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
}: {
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof sizeClass
  mobile?: 'sheet' | 'fullscreen' | 'dialog'
  showClose?: boolean
  ariaLabel?: string
  bodyClassName?: string
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
}) {
  const titleId = useId()

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && closeOnEscape) onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [closeOnEscape, onClose])

  const overlayClass = mobile === 'sheet'
    ? 'items-end sm:items-center sm:justify-center sm:p-4'
    : mobile === 'fullscreen'
      ? 'items-stretch sm:items-center sm:justify-center sm:p-4'
      : 'items-center justify-center p-4'
  const surfaceClass = mobile === 'sheet'
    ? 'max-h-[88dvh] rounded-t-[22px] sm:max-h-[calc(100dvh-32px)] sm:rounded-xl'
    : mobile === 'fullscreen'
      ? 'h-[100dvh] sm:h-auto sm:max-h-[calc(100dvh-32px)] sm:rounded-xl'
      : 'max-h-[calc(100dvh-32px)] rounded-xl'

  return createPortal(
    <div
      className={`fixed inset-0 z-[1000] flex bg-black/30 backdrop-blur-[1.5px] ${overlayClass}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop) onClose()
      }}
    >
      <section className={`${mobile === 'fullscreen' ? 'mobile-safe-top ' : ''}mobile-safe-bottom flex w-full flex-col overflow-hidden border-border bg-white shadow-[0_18px_60px_rgba(25,34,42,0.2)] sm:border ${sizeClass[size]} ${surfaceClass}`}>
        {mobile === 'sheet' && <div className="pt-2.5 sm:hidden"><SheetHandle /></div>}
        {showClose ? (
          <OverlayHeader title={title} description={description} onClose={onClose} titleId={titleId} />
        ) : (
          <header className="shrink-0 px-5 pt-5">
            <div id={titleId} className="text-[16px] font-semibold tracking-[-0.01em] text-text">{title}</div>
            {description && <div className="mt-1.5 text-[12.5px] leading-relaxed text-text-muted">{description}</div>}
          </header>
        )}
        <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 ${bodyClassName}`}>{children}</div>
        {footer && <footer className="mobile-safe-bottom flex shrink-0 items-center justify-end gap-2 border-t border-border/80 bg-white px-4 py-3 sm:px-5">{footer}</footer>}
      </section>
    </div>,
    document.body,
  )
}
