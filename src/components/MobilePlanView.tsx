import { useMemo, useRef, useState } from 'react'
import { activitiesByDay, displayDate, useActiveTrip, useTripStore } from '../store'
import { HeartIcon, MapIcon, PlusIcon } from './Icons'
import MapView from './MapView'
import TimelineView from './TimelineView'

function dayDate(day: { date: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return day.date === '待定' ? '待定' : day.date
  return displayDate(day.date).split(' ')[0]
}

// 手机端以“看路线 → 编排当天 → 补充地点”为单一连续任务，地图不再是需要跳转的独立页面。
export default function MobilePlanView({ onOpenFullMap }: { onOpenFullMap: () => void }) {
  const trip = useActiveTrip()
  const { activeDayId, setActiveDay, selectActivity, setPlanTab } = useTripStore()
  const [quickAddRequest, setQuickAddRequest] = useState(0)
  const railRef = useRef<HTMLDivElement>(null)
  const activeDay = trip.days.find((day) => day.id === activeDayId) ?? trip.days[0]
  const items = useMemo(() => activeDay ? activitiesByDay(trip, activeDay.id) : [], [activeDay, trip.activities])
  const unscheduledCount = trip.wishPlaces.filter((place) => {
    const ids = [...(place.scheduledActivityIds ?? []), ...(place.scheduledActivityId ? [place.scheduledActivityId] : [])]
    return !ids.some((id) => trip.activities.some((activity) => activity.id === id))
  }).length

  function selectDay(id: string) {
    setActiveDay(id)
    selectActivity(null)
    requestAnimationFrame(() => railRef.current?.querySelector<HTMLButtonElement>(`[data-day-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }))
  }

  if (!activeDay) return null

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div ref={railRef} className="mobile-day-rail shrink-0 border-b border-border/75 bg-white/86 px-3 py-2">
        <div className="flex w-max min-w-full items-stretch gap-1.5">
          {trip.days.map((day) => {
            const active = day.id === activeDay.id
            return (
              <button
                key={day.id}
                data-day-id={day.id}
                onClick={() => selectDay(day.id)}
                className={`mobile-day-chip ${active ? 'is-active' : ''}`}
              >
                <span>{dayDate(day)}</span>
                <strong>{day.label}</strong>
              </button>
            )
          })}
        </div>
      </div>

      <section className="relative h-[194px] shrink-0 overflow-hidden border-b border-border bg-surface">
        <MapView key={activeDay.id} initialDayId={activeDay.id} compact />
        <div className="pointer-events-none absolute top-3 left-3 z-[600] rounded-md border border-white/80 bg-white/92 px-2.5 py-1.5 text-[11.5px] font-semibold text-text shadow-[0_3px_12px_rgba(32,40,46,0.11)] backdrop-blur">
          {activeDay.label}{activeDay.place ? ` · ${activeDay.place}` : ''} · {items.length} 项
        </div>
        <button onClick={onOpenFullMap} className="absolute right-3 bottom-3 z-[600] inline-flex items-center gap-1.5 rounded-md border border-white/85 bg-white/94 px-2.5 py-1.5 text-[11px] font-medium text-text-muted shadow-[0_3px_12px_rgba(32,40,46,0.12)] backdrop-blur active:bg-surface" title="查看完整行程地图">
          <MapIcon size={13} /> 全程地图
        </button>
      </section>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <TimelineView onOpenFullMap={onOpenFullMap} mobilePresentation quickAddRequest={quickAddRequest} />
      </div>

      <nav className="mobile-plan-dock mobile-safe-bottom shrink-0 border-t border-border/80 bg-white/96 px-3 pt-2 shadow-[0_-4px_18px_rgba(32,40,46,0.06)]" aria-label="当天行程操作">
        <button onClick={() => setPlanTab('places')} className="mobile-plan-dock__secondary">
          <HeartIcon size={17} /> 待安排 {unscheduledCount}
        </button>
        <button onClick={() => setQuickAddRequest((request) => request + 1)} className="mobile-plan-dock__primary">
          <PlusIcon size={18} /> 添加安排
        </button>
        <button onClick={onOpenFullMap} className="mobile-plan-dock__secondary">
          <MapIcon size={17} /> 全程地图
        </button>
      </nav>
    </div>
  )
}
