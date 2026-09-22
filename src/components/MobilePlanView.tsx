import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { activitiesByDay, displayDate, useActiveTrip, useTripStore } from '../store'
import { HeartIcon, MapIcon, PlusIcon, WalletIcon } from './Icons'
import MapView from './MapView'
import TimelineView, { BudgetDrawer } from './TimelineView'

function dayDate(day: { date: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return day.date === '待定' ? '待定' : day.date
  return displayDate(day.date).split(' ')[0]
}

const MOBILE_MAP_HEIGHT_KEY = 'tripnote-mobile-map-height-v1'
const MOBILE_MAP_COLLAPSED_KEY = 'tripnote-mobile-map-collapsed-v1'
const MOBILE_MAP_MIN_HEIGHT = 148
const MOBILE_MAP_COLLAPSE_THRESHOLD = 116

function readMobileMapHeight() {
  const saved = Number(localStorage.getItem(MOBILE_MAP_HEIGHT_KEY))
  return Number.isFinite(saved) ? Math.max(MOBILE_MAP_MIN_HEIGHT, Math.min(360, saved)) : 194
}

function readMobileMapCollapsed() {
  return localStorage.getItem(MOBILE_MAP_COLLAPSED_KEY) === 'true'
}

// 手机端以“看路线 → 编排当天 → 补充地点”为单一连续任务，地图不再是需要跳转的独立页面。
export default function MobilePlanView({ onOpenFullMap }: { onOpenFullMap: () => void }) {
  const trip = useActiveTrip()
  const { activeDayId, setActiveDay, selectActivity, setPlanTab } = useTripStore()
  const [quickAddRequest, setQuickAddRequest] = useState(0)
  const [budgetDrawerOpen, setBudgetDrawerOpen] = useState(false)
  const [mapHeight, setMapHeight] = useState(readMobileMapHeight)
  const [mapCollapsed, setMapCollapsed] = useState(readMobileMapCollapsed)
  const railRef = useRef<HTMLDivElement>(null)
  const activeDay = trip.days.find((day) => day.id === activeDayId) ?? trip.days[0]
  const items = useMemo(() => activeDay ? activitiesByDay(trip, activeDay.id) : [], [activeDay, trip.activities])
  const unscheduledCount = trip.wishPlaces.filter((place) => {
    const ids = [...(place.scheduledActivityIds ?? []), ...(place.scheduledActivityId ? [place.scheduledActivityId] : [])]
    return !ids.some((id) => trip.activities.some((activity) => activity.id === id))
  }).length
  const totalCost = trip.activities.reduce(
    (sum, activity) => sum + activity.costs.reduce((costSum, cost) => costSum + cost.amount, 0),
    0,
  )

  useEffect(() => {
    localStorage.setItem(MOBILE_MAP_HEIGHT_KEY, String(Math.round(mapHeight)))
  }, [mapHeight])

  useEffect(() => {
    localStorage.setItem(MOBILE_MAP_COLLAPSED_KEY, String(mapCollapsed))
  }, [mapCollapsed])

  function selectDay(id: string) {
    setActiveDay(id)
    selectActivity(null)
    requestAnimationFrame(() => railRef.current?.querySelector<HTMLButtonElement>(`[data-day-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }))
  }

  function startMapResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const startY = event.clientY
    const startHeight = mapHeight
    let nextHeight = startHeight
    const onMove = (moveEvent: PointerEvent) => {
      const maxHeight = Math.max(MOBILE_MAP_MIN_HEIGHT, Math.min(360, window.innerHeight - 280))
      nextHeight = Math.max(72, Math.min(maxHeight, startHeight + moveEvent.clientY - startY))
      setMapHeight(nextHeight)
    }
    const onEnd = () => {
      if (nextHeight <= MOBILE_MAP_COLLAPSE_THRESHOLD) {
        setMapCollapsed(true)
        setMapHeight(Math.max(MOBILE_MAP_MIN_HEIGHT, startHeight))
      } else {
        setMapHeight(Math.max(MOBILE_MAP_MIN_HEIGHT, nextHeight))
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd, { once: true })
  }

  if (!activeDay) return null

  return (
    <div className="mobile-plan-root flex h-full min-h-0 flex-col bg-bg">
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

      {!mapCollapsed ? <>
      <section className="relative shrink-0 overflow-hidden border-b border-border bg-surface" style={{ height: mapHeight }}>
        <MapView key={activeDay.id} initialDayId={activeDay.id} compact />
        <div className="pointer-events-none absolute top-3 left-3 z-[600] rounded-md border border-white/80 bg-white/92 px-2.5 py-1.5 text-[11.5px] font-semibold text-text shadow-[0_3px_12px_rgba(32,40,46,0.11)] backdrop-blur">
          {activeDay.label}{activeDay.place ? ` · ${activeDay.place}` : ''} · {items.length} 项
        </div>
        <button
          onClick={() => setBudgetDrawerOpen(true)}
          className="absolute bottom-3 left-3 z-[600] inline-flex min-h-9 items-center gap-1.5 rounded-md border border-white/85 bg-white/94 px-2.5 py-1.5 text-[11px] font-medium text-text-muted shadow-[0_3px_12px_rgba(32,40,46,0.12)] backdrop-blur active:bg-surface"
          title="查看并设置旅行总预算"
        >
          <WalletIcon size={13} /> 预算 ¥{totalCost.toLocaleString()}{trip.totalBudget ? ` / ¥${trip.totalBudget.toLocaleString()}` : ''}
        </button>
        <button onClick={onOpenFullMap} className="absolute right-3 bottom-3 z-[600] inline-flex items-center gap-1.5 rounded-md border border-white/85 bg-white/94 px-2.5 py-1.5 text-[11px] font-medium text-text-muted shadow-[0_3px_12px_rgba(32,40,46,0.12)] backdrop-blur active:bg-surface" title="查看完整行程地图">
          <MapIcon size={13} /> 全程地图
        </button>
      </section>
      <div
        role="separator"
        aria-label="调整地图高度"
        aria-orientation="horizontal"
        onPointerDown={startMapResize}
        className="group -mt-1 flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center bg-bg"
      >
        <span className="h-1 w-10 rounded-full bg-border transition-colors group-active:bg-accent" />
      </div>
      </> : (
        <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border/80 bg-white/90 px-3 shadow-[0_2px_8px_rgba(32,40,46,0.035)]">
          <button
            onClick={() => setMapCollapsed(false)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-2 text-left text-[11.5px] font-medium text-text-muted active:bg-surface"
            aria-label="展开当天地图"
          >
            <MapIcon size={15} className="shrink-0 text-accent" />
            <span className="truncate">地图 · {activeDay.label}{activeDay.place ? ` · ${activeDay.place}` : ''}</span>
            <span className="ml-auto shrink-0 text-[10.5px] text-text-faint">展开</span>
          </button>
          <button
            onClick={onOpenFullMap}
            className="shrink-0 rounded-md px-2 py-1.5 text-[10.5px] font-medium text-text-muted active:bg-surface"
          >
            全程
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <TimelineView onOpenFullMap={onOpenFullMap} mobilePresentation quickAddRequest={quickAddRequest} />
      </div>

      <nav className="mobile-plan-dock mobile-safe-bottom shrink-0 border-t border-border/80 bg-white/96 px-3 pt-2 shadow-[0_-4px_18px_rgba(32,40,46,0.06)]" aria-label="当天行程操作">
        <button onClick={() => setPlanTab('places')} className="mobile-plan-dock__secondary">
          <HeartIcon size={17} /> 想去 {unscheduledCount}
        </button>
        <button onClick={() => setQuickAddRequest((request) => request + 1)} className="mobile-plan-dock__primary">
          <PlusIcon size={18} /> 添加安排
        </button>
      </nav>
      {budgetDrawerOpen && <BudgetDrawer trip={trip} onClose={() => setBudgetDrawerOpen(false)} />}
    </div>
  )
}
