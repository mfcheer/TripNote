import type { ReactNode } from 'react'
import { AlertCircleIcon, CheckCircleIcon } from './Icons'

export type FeedbackTone = 'neutral' | 'success' | 'warning' | 'error'

const toneClass: Record<FeedbackTone, string> = {
  neutral: 'border-border/80 bg-surface text-text-muted',
  success: 'border-emerald-200/80 bg-emerald-50/70 text-emerald-800',
  warning: 'border-amber-200/80 bg-amber-50/75 text-amber-800',
  error: 'border-red-200/80 bg-red-50/75 text-red-700',
}

export function InlineStatus({
  children,
  loading = false,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  loading?: boolean
  tone?: FeedbackTone
  className?: string
}) {
  const Icon = tone === 'success' ? CheckCircleIcon : tone === 'neutral' ? null : AlertCircleIcon
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] leading-snug ${toneClass[tone]} ${className}`}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : Icon ? <Icon size={13} aria-hidden="true" /> : null}
      <span>{children}</span>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className = '',
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div className={`ui-empty-state ${compact ? 'is-compact' : ''} ${className}`}>
      <span className="ui-empty-state__icon" aria-hidden="true">{icon}</span>
      <div className="ui-empty-state__title">{title}</div>
      {description && <p className="ui-empty-state__description">{description}</p>}
      {action && <div className="ui-empty-state__action">{action}</div>}
    </div>
  )
}
