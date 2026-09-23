import { CalendarIcon, HeartIcon, PlusIcon } from './Icons'

type MobilePlanDockProps = {
  mode: 'timeline' | 'places'
  unscheduledCount: number
  onOpenPlaces: () => void
  onPrimaryAction: () => void
}

/**
 * 手机上的行程与想去共用同一条底部操作栏。
 * 只切换操作语义，不切换尺寸、字重、圆角或安全区，避免跨页面时视觉跳动。
 */
export default function MobilePlanDock({
  mode,
  unscheduledCount,
  onOpenPlaces,
  onPrimaryAction,
}: MobilePlanDockProps) {
  const isTimeline = mode === 'timeline'

  return (
    <nav className="mobile-plan-dock shrink-0" aria-label={isTimeline ? '当天行程操作' : '想去操作'}>
      <button
        type="button"
        onClick={onOpenPlaces}
        className="mobile-plan-dock__secondary"
        aria-current={isTimeline ? undefined : 'page'}
      >
        <HeartIcon size={17} />
        <span>想去</span>
        <span className="mobile-plan-dock__count">{unscheduledCount}</span>
      </button>
      <button type="button" onClick={onPrimaryAction} className="mobile-plan-dock__primary">
        {isTimeline ? <PlusIcon size={18} /> : <CalendarIcon size={18} />}
        {isTimeline ? '添加安排' : '返回行程'}
      </button>
    </nav>
  )
}
