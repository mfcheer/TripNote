import { useEffect, useMemo, useState, type DragEvent as NativeDragEvent } from 'react'
import { searchPlaces, type GeoResult } from '../api/geocode'
import { activitiesByDay, displayDate, nextActivityTime, useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS, HeartIcon, MapIcon, PlusIcon, SettingsIcon } from './Icons'
import { CATEGORY_META, type WishPlace } from '../types'
import MapView from './MapView'
import TimelineView from './TimelineView'
import { useToastStore } from './toastStore'

const WISH_DRAG_TYPE = 'application/x-tripnote-wish-id'

function plannedIds(place: WishPlace) {
  return [...(place.scheduledActivityIds ?? []), ...(place.scheduledActivityId ? [place.scheduledActivityId] : [])]
}

function dayCost(trip: ReturnType<typeof useActiveTrip>, dayId: string) {
  return activitiesByDay(trip, dayId).reduce((sum, activity) => sum + activity.costs.reduce((subtotal, cost) => subtotal + cost.amount, 0), 0)
}

function PlaceLibrary() {
  const trip = useActiveTrip()
  const { addWishPlace, scheduleWishPlace, amapWebServiceKey } = useTripStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const activeDayId = useTripStore((state) => state.activeDayId)

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        setResults(await searchPlaces(term, ctrl.signal, amapWebServiceKey))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 360)
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [amapWebServiceKey, query])

  const places = useMemo(() => {
    const unscheduled: WishPlace[] = []
    const scheduled: WishPlace[] = []
    for (const place of trip.wishPlaces) {
      const isScheduled = plannedIds(place).some((id) => trip.activities.some((activity) => activity.id === id))
      ;(isScheduled ? scheduled : unscheduled).push(place)
    }
    return { unscheduled, scheduled }
  }, [trip.activities, trip.wishPlaces])

  function addResult(result: GeoResult) {
    const title = result.label.split(',')[0]
    const exists = trip.wishPlaces.some((place) => place.title === title && place.geo && Math.abs(place.geo.lat - result.lat) < 0.00001 && Math.abs(place.geo.lng - result.lng) < 0.00001)
    if (exists) {
      useToastStore.getState().show('这个地点已在地点库中')
      return
    }
    const id = addWishPlace({ title, category: 'sight', location: result.label, geo: { lat: result.lat, lng: result.lng } })
    setSelectedId(id)
    setQuery('')
    setResults([])
    useToastStore.getState().show(`已加入地点库：${title}`)
  }

  function addPlainPlace() {
    const title = query.trim()
    if (!title) return
    const id = addWishPlace({ title, category: 'sight' })
    setSelectedId(id)
    setQuery('')
    useToastStore.getState().show(`已加入地点库：${title}`)
  }

  function schedule(place: WishPlace) {
    const day = trip.days.find((item) => item.id === activeDayId)
    if (!day) return
    const id = scheduleWishPlace(place.id, day.id, {
      time: nextActivityTime(trip, day.id),
      title: place.title,
      category: place.category,
      location: place.location,
      note: place.note,
      geo: place.geo,
    })
    if (id) useToastStore.getState().show(`已安排「${place.title}」到 ${day.label}`)
  }

  function dragStart(event: NativeDragEvent<HTMLElement>, place: WishPlace) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(WISH_DRAG_TYPE, place.id)
    setSelectedId(place.id)
  }

  function renderPlace(place: WishPlace, muted = false) {
    const meta = CATEGORY_META[place.category]
    const Icon = CATEGORY_ICONS[place.category]
    const selected = selectedId === place.id
    return <div
      key={place.id}
      draggable={!muted}
      onDragStart={(event) => !muted && dragStart(event, place)}
      className={`group flex items-center gap-2 border-b border-border/60 px-3 py-2.5 last:border-b-0 ${selected ? 'bg-action-soft/45' : 'hover:bg-surface/70'} ${muted ? 'opacity-62' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: meta.soft, color: meta.color }}><Icon size={14} /></span>
      <button onClick={() => setSelectedId(selected ? null : place.id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[12.5px] font-medium text-text">{place.title}</span>
        <span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{place.location || '未补充位置'}</span>
      </button>
      {!muted && <button onClick={() => schedule(place)} className="rounded px-1.5 py-1 text-[11px] text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white hover:text-accent" title="安排到当前日期">＋</button>}
    </div>
  }

  return <aside className="flex min-h-0 w-[286px] shrink-0 flex-col border-r border-border/80 bg-[#fbfcfc]">
    <div className="border-b border-border/70 px-4 pt-4 pb-3">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold text-text">地点库</div>
        <span className="rounded-full bg-action-soft px-2 py-0.5 text-[11px] font-medium text-accent-hover">{places.unscheduled.length}</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-text-faint">搜索、手动记录或在地图选点；拖入当天日程即可安排。</p>
      <div className="relative mt-3">
        <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && results.length === 0 && addPlainPlace()} placeholder="添加想去的地点" className="w-full rounded-md border border-border bg-white px-3 py-2 text-[12px] outline-none focus:border-accent" />
        {loading && <span className="absolute top-2.5 right-3 text-[10.5px] text-text-faint">搜索中</span>}
        {results.length > 0 && <div className="absolute inset-x-0 top-[calc(100%+5px)] z-[800] max-h-[220px] overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-[0_10px_28px_rgba(32,40,46,0.14)]">
          {results.map((result) => <button key={`${result.lat}-${result.lng}`} onClick={() => addResult(result)} className="block w-full px-3 py-2 text-left hover:bg-surface"><span className="block truncate text-[12px] font-medium">{result.label.split(',')[0]}</span><span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{result.label}</span></button>)}
        </div>}
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5"><span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-faint">待安排</span><span className="text-[10.5px] text-text-faint">{places.unscheduled.length} 个</span></div>
      <div>{places.unscheduled.length ? places.unscheduled.map((place) => renderPlace(place)) : <p className="px-4 py-5 text-[11.5px] leading-relaxed text-text-faint">地点都已安排完。也可以从地图右上角选点收藏。</p>}</div>
      {places.scheduled.length > 0 && <details className="mt-2 border-t border-border/70" open>
        <summary className="cursor-pointer list-none px-4 py-3 text-[10.5px] font-semibold tracking-[0.12em] text-text-faint [&::-webkit-details-marker]:hidden">已安排 · {places.scheduled.length}</summary>
        <div>{places.scheduled.map((place) => renderPlace(place, true))}</div>
      </details>}
    </div>
    <div className="border-t border-border/70 px-4 py-3 text-[10.5px] leading-relaxed text-text-faint"><HeartIcon size={12} className="mr-1 inline" />安排后仍保留在地点库，方便多天使用。</div>
  </aside>
}

function DayRail() {
  const trip = useActiveTrip()
  const { activeDayId, setActiveDay, addDay, copyDay } = useTripStore()
  return <footer className="shrink-0 border-t border-border/80 bg-white/96 px-4 py-3">
    <div className="mb-2 flex items-center justify-between px-1"><span className="text-[11.5px] font-semibold text-text">行程日期</span><span className="text-[10.5px] text-text-faint">选择一天后在中间编辑</span></div>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(148px,1fr))] gap-2">
      {trip.days.map((day) => {
        const active = activeDayId === day.id
        const items = activitiesByDay(trip, day.id)
        const cost = dayCost(trip, day.id)
        return <button key={day.id} onClick={() => setActiveDay(day.id)} className={`min-w-0 rounded-lg border px-3 py-2.5 text-left transition-colors ${active ? 'border-action/45 bg-action-soft/50' : 'border-border/80 bg-white hover:border-accent/40'}`}>
          <span className="flex items-center justify-between gap-1"><span className="text-[11.5px] font-semibold text-text">{day.label} · {day.place || '待定'}</span><span className="text-[10px] text-text-faint">{items.length} 项</span></span>
          <span className="mt-1 block text-[10.5px] text-text-muted">{displayDate(day.date)}</span>
          <span className="mt-1 block truncate text-[10.5px] text-text-faint">{items.slice(0, 2).map((item) => item.title).join(' · ') || '尚未安排'}{cost > 0 ? ` · ¥${cost.toLocaleString()}` : ''}</span>
        </button>
      })}
      <button onClick={() => addDay(trip.days.at(-1)?.id)} className="flex min-h-[76px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface/45 text-[11px] text-text-muted hover:border-accent/50 hover:text-accent"><PlusIcon size={15} /><span className="mt-1">添加一天</span></button>
    </div>
    {trip.days.length > 0 && <button onClick={() => copyDay(activeDayId)} className="mt-2 inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10.5px] text-text-faint hover:bg-surface hover:text-text-muted">复制当前天</button>}
  </footer>
}

export default function WorkspaceView({ onExport, exporting, onOpenFullMap }: { onExport: () => void; exporting: boolean; onOpenFullMap: () => void }) {
  const trip = useActiveTrip()
  const { trips, activeTripId, switchTrip, createTrip, setView, scheduleWishPlace, activeDayId } = useTripStore()
  const totalCost = trip.activities.reduce((sum, activity) => sum + activity.costs.reduce((subtotal, cost) => subtotal + cost.amount, 0), 0)

  function scheduleDrop(event: NativeDragEvent<HTMLElement>) {
    event.preventDefault()
    const placeId = event.dataTransfer.getData(WISH_DRAG_TYPE)
    const place = trip.wishPlaces.find((item) => item.id === placeId)
    const day = trip.days.find((item) => item.id === activeDayId)
    if (!place || !day) return
    const id = scheduleWishPlace(place.id, day.id, { time: nextActivityTime(trip, day.id), title: place.title, category: place.category, location: place.location, note: place.note, geo: place.geo })
    if (id) useToastStore.getState().show(`已安排「${place.title}」到 ${day.label}`)
  }

  return <div className="flex h-full min-w-0 flex-col bg-bg">
    <header className="flex h-[58px] shrink-0 items-center gap-3 border-b border-border/80 bg-white/92 px-5">
      <MapIcon size={19} className="shrink-0 text-accent" />
      <select value={activeTripId} onChange={(event) => switchTrip(event.target.value)} className="min-w-0 max-w-[280px] truncate bg-transparent text-[14px] font-semibold outline-none">
        {trips.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <span className="hidden text-[11.5px] text-text-faint xl:inline">{trip.days.length} 天 · {trip.days[0] ? `${displayDate(trip.days[0].date)} 起` : '待定日期'}</span>
      <button onClick={() => { const name = window.prompt('旅程名称', '新旅程'); if (name?.trim()) createTrip(name.trim()) }} className="rounded px-2 py-1 text-[11.5px] text-text-muted hover:bg-surface">＋ 新旅行</button>
      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={onOpenFullMap} className="hidden items-center gap-1 rounded-md px-2.5 py-1.5 text-[11.5px] text-text-muted hover:bg-surface lg:flex"><MapIcon size={13} /> 全程地图</button>
        <button onClick={() => setView('settings')} className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface" title="数据与设置"><SettingsIcon size={15} /></button>
        <button onClick={onExport} disabled={exporting} className="rounded-md border border-border bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-text-muted hover:border-accent/40 disabled:opacity-60">{exporting ? '生成中…' : '导出行程卡片'}</button>
        <span className="hidden rounded-md bg-surface px-2 py-1 text-[10.5px] text-text-faint xl:inline">预算 ¥{totalCost.toLocaleString()}{trip.totalBudget ? ` / ¥${trip.totalBudget.toLocaleString()}` : ''}</span>
      </div>
    </header>
    <div className="flex min-h-0 flex-1">
      <PlaceLibrary />
      <main onDragOver={(event) => event.preventDefault()} onDrop={scheduleDrop} className="min-w-[420px] flex-[1.15] overflow-y-auto border-r border-border/80 bg-white/56">
        <TimelineView workspace onOpenFullMap={onOpenFullMap} />
      </main>
      <aside className="min-w-[360px] flex-1"><MapView key={activeDayId} initialDayId={activeDayId} compact /></aside>
    </div>
    <DayRail />
  </div>
}
