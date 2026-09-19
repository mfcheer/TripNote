import { useEffect, useMemo, useState, type CSSProperties, type DragEvent as NativeDragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { searchPlaces, type GeoResult } from '../api/geocode'
import { activitiesByDay, displayDate, nextActivityTime, useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS, HeartIcon, LogoIcon, MapIcon, PlusIcon, SettingsIcon, TrashIcon } from './Icons'
import { CATEGORY_META, type WishPlace } from '../types'
import MapView from './MapView'
import TimelineView, { BudgetDrawer } from './TimelineView'
import { useToastStore } from './toastStore'
import ModalShell from './OverlayShell'
import SettingsView from './SettingsView'
import { useConfirmStore } from './confirmStore'

const WISH_DRAG_TYPE = 'application/x-tripnote-wish-id'
const ACTIVITY_DRAG_TYPE = 'application/x-tripnote-activity-id'

function plannedIds(place: WishPlace) {
  return [...(place.scheduledActivityIds ?? []), ...(place.scheduledActivityId ? [place.scheduledActivityId] : [])]
}

function dayCost(trip: ReturnType<typeof useActiveTrip>, dayId: string) {
  return activitiesByDay(trip, dayId).reduce((sum, activity) => sum + activity.costs.reduce((subtotal, cost) => subtotal + cost.amount, 0), 0)
}

function PlaceLibrary({ onStartMapPick, recentlyScheduledPlaceId, selectedWishPlaceId, onSelectWishPlace, onScheduleSuccess }: { onStartMapPick: () => void; recentlyScheduledPlaceId: string | null; selectedWishPlaceId: string | null; onSelectWishPlace: (placeId: string | null) => void; onScheduleSuccess: (activityId: string, placeId: string) => void }) {
  const trip = useActiveTrip()
  const { addWishPlace, removeWishPlace, scheduleWishPlace, amapWebServiceKey, placeSearchProvider } = useTripStore()
  const askConfirm = useConfirmStore((state) => state.ask)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [loading, setLoading] = useState(false)
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
        setResults(await searchPlaces(term, ctrl.signal, amapWebServiceKey, placeSearchProvider))
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
  }, [amapWebServiceKey, placeSearchProvider, query])

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
      useToastStore.getState().show('这个地点已在想去中')
      return
    }
    const id = addWishPlace({ title, category: 'sight', location: result.label, geo: { lat: result.lat, lng: result.lng } })
    onSelectWishPlace(id)
    setQuery('')
    setResults([])
    useToastStore.getState().show(`已加入想去：${title}`)
  }

  function addPlainPlace() {
    const title = query.trim()
    if (!title) return
    const id = addWishPlace({ title, category: 'sight' })
    onSelectWishPlace(id)
    setQuery('')
    useToastStore.getState().show(`已加入想去：${title}`)
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
    if (id) {
      onScheduleSuccess(id, place.id)
      useToastStore.getState().show(`已安排「${place.title}」到 ${day.label}`)
    }
  }

  function dragStart(event: NativeDragEvent<HTMLElement>, place: WishPlace) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(WISH_DRAG_TYPE, place.id)
    onSelectWishPlace(place.id)
  }

  function removePlace(place: WishPlace, scheduled: boolean) {
    askConfirm({
      title: `移除「${place.title}」？`,
      message: scheduled ? '这只会将地点移出想去，已经安排进日程的事项会保留。' : '移除后不会影响其他行程。',
      onConfirm: () => {
        const { trips, activeTripId } = useTripStore.getState()
        removeWishPlace(place.id)
        onSelectWishPlace(null)
        useToastStore.getState().show(`已移除「${place.title}」`, {
          undo: () => useTripStore.getState().restoreTrips(trips, activeTripId),
        })
      },
    })
  }

  function renderPlace(place: WishPlace, scheduled = false) {
    const meta = CATEGORY_META[place.category]
    const Icon = CATEGORY_ICONS[place.category]
    const selected = selectedWishPlaceId === place.id
    return <div
      key={place.id}
      draggable
      onDragStart={(event) => dragStart(event, place)}
      className={`group flex items-center gap-2 border-b border-border/60 px-3 py-2.5 last:border-b-0 ${selected ? 'bg-action-soft/45' : 'hover:bg-surface/70'} ${scheduled ? 'bg-surface/25' : ''} ${recentlyScheduledPlaceId === place.id ? 'wish-place-complete' : ''} cursor-grab active:cursor-grabbing`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: meta.soft, color: meta.color }}><Icon size={14} /></span>
      <button onClick={() => onSelectWishPlace(selected ? null : place.id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[12.5px] font-medium text-text">{place.title}</span>
        <span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{place.location || '未补充位置'}</span>
      </button>
      <button onClick={() => schedule(place)} className="rounded px-1.5 py-1 text-[11px] text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white hover:text-accent" title="安排到当前日期">＋</button>
      <button onClick={() => removePlace(place, scheduled)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-faint/70 transition-colors hover:bg-red-50 hover:text-red-500" title="从想去移除" aria-label={`从想去移除 ${place.title}`}><TrashIcon size={12} /></button>
    </div>
  }

  return <aside className="flex min-h-0 shrink-0 flex-col border-r border-border/80 bg-[#fbfcfc]" style={{ width: 'var(--workspace-library-width)' }}>
    <div className="border-b border-border/70 px-4 pt-4 pb-3">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold text-text">想去</div>
        <span className="rounded-full bg-action-soft px-2 py-0.5 text-[11px] font-medium text-accent-hover">{places.unscheduled.length}</span>
      </div>
      <p className="mt-1 text-[11px] text-text-faint">搜索、选点后拖入日程。</p>
      <div className="mt-2.5 flex gap-2">
        <div className="relative min-w-0 flex-1">
        <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && results.length === 0 && addPlainPlace()} placeholder="搜索或添加地点" className="w-full rounded-md border border-border bg-white px-3 py-2 text-[12px] outline-none focus:border-accent" />
        {loading && <span className="absolute top-2.5 right-3 text-[10.5px] text-text-faint">搜索中</span>}
        {results.length > 0 && <div className="absolute inset-x-0 top-[calc(100%+5px)] z-[800] max-h-[220px] overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-[0_10px_28px_rgba(32,40,46,0.14)]">
          {results.map((result) => <button key={`${result.lat}-${result.lng}`} onClick={() => addResult(result)} className="block w-full px-3 py-2 text-left hover:bg-surface"><span className="block truncate text-[12px] font-medium">{result.label.split(',')[0]}</span><span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{result.label}</span></button>)}
        </div>}
        </div>
        <button onClick={onStartMapPick} className="shrink-0 rounded-md border border-border bg-white px-2.5 text-[11px] font-medium text-text-muted hover:border-accent/40 hover:text-accent" title="在右侧地图选择地点"><MapIcon size={14} /></button>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5"><span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-faint">待安排</span><span className="text-[10.5px] text-text-faint">{places.unscheduled.length} 个</span></div>
      <div>{places.unscheduled.length ? places.unscheduled.map((place) => renderPlace(place)) : <p className="px-4 py-5 text-[11.5px] leading-relaxed text-text-faint">地点都已安排完，可以用上方地图按钮继续收藏。</p>}</div>
      {places.scheduled.length > 0 && <details className="mt-2 border-t border-border/70" open>
        <summary className="cursor-pointer list-none px-4 py-3 text-[10.5px] font-semibold tracking-[0.12em] text-text-faint [&::-webkit-details-marker]:hidden">已安排 · {places.scheduled.length} <span className="font-normal tracking-normal">（可再次安排）</span></summary>
        <div>{places.scheduled.map((place) => renderPlace(place, true))}</div>
      </details>}
    </div>
    <div className="border-t border-border/70 px-4 py-3 text-[10.5px] leading-relaxed text-text-faint"><HeartIcon size={12} className="mr-1 inline" />安排后仍保留在清单中，方便多天使用。</div>
  </aside>
}

function DayRail({ showAllDays, onShowAllDays, onSelectDay }: { showAllDays: boolean; onShowAllDays: () => void; onSelectDay: (dayId: string) => void }) {
  const trip = useActiveTrip()
  const { activeDayId, setActiveDay, addDay, copyDay, moveDay, scheduleWishPlace, reorderActivity } = useTripStore()
  const [draggingDayId, setDraggingDayId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  function moveDayTo(dayId: string, targetDayId: string) {
    const fromIndex = trip.days.findIndex((day) => day.id === dayId)
    const toIndex = trip.days.findIndex((day) => day.id === targetDayId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    const direction = fromIndex < toIndex ? 1 : -1
    for (let index = 0; index < Math.abs(toIndex - fromIndex); index++) moveDay(dayId, direction)
  }

  function dragKind(event: NativeDragEvent<HTMLElement>) {
    if (event.dataTransfer.types.includes(WISH_DRAG_TYPE)) return 'wish'
    if (event.dataTransfer.types.includes(ACTIVITY_DRAG_TYPE)) return 'activity'
    if (event.dataTransfer.types.includes('application/x-tripnote-day-id')) return 'day'
    return null
  }

  function dropOnDay(event: NativeDragEvent<HTMLElement>, dayId: string) {
    event.preventDefault()
    const day = trip.days.find((item) => item.id === dayId)
    const wishId = event.dataTransfer.getData(WISH_DRAG_TYPE)
    const activityId = event.dataTransfer.getData(ACTIVITY_DRAG_TYPE)
    const sourceDayId = event.dataTransfer.getData('application/x-tripnote-day-id')
    if (wishId && day) {
      const place = trip.wishPlaces.find((item) => item.id === wishId)
      if (place) {
        const id = scheduleWishPlace(place.id, day.id, { time: nextActivityTime(trip, day.id), title: place.title, category: place.category, location: place.location, note: place.note, geo: place.geo })
        if (id) {
          setActiveDay(day.id)
          useToastStore.getState().show(`已安排「${place.title}」到 ${day.label}`)
        }
      }
    } else if (activityId && day) {
      const activity = trip.activities.find((item) => item.id === activityId)
      if (activity && activity.dayId !== day.id) {
        reorderActivity(activity.id, day.id, activitiesByDay(trip, day.id).length)
        setActiveDay(day.id)
        useToastStore.getState().show(`已将「${activity.title}」移到 ${day.label}`)
      }
    } else if (sourceDayId) {
      moveDayTo(sourceDayId, dayId)
    }
    setDraggingDayId(null)
    setDropTargetId(null)
  }

  return <footer className="shrink-0 border-t border-border/60 bg-[#fbfcfc]/92 px-4 py-2 backdrop-blur-sm">
    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button onClick={onShowAllDays} className={`flex h-[43px] w-[56px] shrink-0 flex-col items-center justify-center rounded-md text-[10.5px] font-medium transition-colors ${showAllDays ? 'bg-action-soft/72 text-accent-hover shadow-[0_1px_3px_rgba(120,73,60,0.06)]' : 'text-text-muted hover:bg-white hover:text-text'}`} title="查看全部日期">全部<span className="mt-0.5 text-[9.5px] font-normal text-text-faint">{trip.days.length}天</span></button>
      {trip.days.map((day) => {
        const active = !showAllDays && activeDayId === day.id
        const items = activitiesByDay(trip, day.id)
        const cost = dayCost(trip, day.id)
        const isDragTarget = dropTargetId === day.id && draggingDayId !== day.id
        return <button key={day.id} data-workspace-day-id={day.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-tripnote-day-id', day.id); setDraggingDayId(day.id) }} onDragEnd={() => { setDraggingDayId(null); setDropTargetId(null) }} onDragOver={(event) => { const kind = dragKind(event); if (kind) { event.preventDefault(); event.dataTransfer.dropEffect = kind === 'wish' ? 'copy' : 'move'; setDropTargetId(day.id) } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetId(null) }} onDrop={(event) => dropOnDay(event, day.id)} onClick={() => onSelectDay(day.id)} className={`w-[138px] shrink-0 rounded-md px-2.5 py-1.5 text-left transition-[background-color,transform] ${active ? 'bg-action-soft/72 text-text shadow-[0_1px_3px_rgba(120,73,60,0.06)]' : 'text-text-muted hover:bg-white'} ${isDragTarget ? 'bg-accent-soft/70 ring-1 ring-dashed ring-accent/45' : ''} ${draggingDayId === day.id ? 'scale-[0.98] opacity-55' : 'cursor-grab active:cursor-grabbing'}`}>
          <span className="flex items-center gap-1"><span className="truncate text-[11px] font-semibold">{day.label}{day.place ? ` · ${day.place}` : ''}</span><span className="ml-auto shrink-0 text-[9.5px] text-text-faint">{items.length}项</span></span>
          <span className="mt-0.5 block truncate text-[10px] text-text-faint">{displayDate(day.date)}{cost > 0 ? ` · ¥${cost.toLocaleString()}` : ''}</span>
        </button>
      })}
      <button onClick={() => addDay(trip.days.at(-1)?.id)} className="flex h-[43px] w-[68px] shrink-0 items-center justify-center gap-1 rounded-md text-[10.5px] text-text-faint hover:bg-white hover:text-accent" title="添加一天"><PlusIcon size={14} /> 添加</button>
      {trip.days.length > 0 && <button onClick={() => copyDay(activeDayId)} className="flex h-[43px] w-[54px] shrink-0 items-center justify-center rounded-md text-[10px] text-text-faint hover:bg-white hover:text-text-muted" title="复制当前天">复制</button>}
    </div>
  </footer>
}

export default function WorkspaceView({ onExport, exporting, onOpenFullMap }: { onExport: () => void; exporting: boolean; onOpenFullMap: () => void }) {
  const trip = useActiveTrip()
  const { trips, activeTripId, switchTrip, createTrip, deleteTrip, scheduleWishPlace, activeDayId, setActiveDay } = useTripStore()
  const askConfirm = useConfirmStore((state) => state.ask)
  const totalCost = trip.activities.reduce((sum, activity) => sum + activity.costs.reduce((subtotal, cost) => subtotal + cost.amount, 0), 0)
  const [tripMenuOpen, setTripMenuOpen] = useState(false)
  const [createTripOpen, setCreateTripOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [budgetDrawerOpen, setBudgetDrawerOpen] = useState(false)
  const [mapPickRequest, setMapPickRequest] = useState(0)
  const [isWishDropTarget, setIsWishDropTarget] = useState(false)
  const [introducedActivityId, setIntroducedActivityId] = useState<string | null>(null)
  const [recentlyScheduledPlaceId, setRecentlyScheduledPlaceId] = useState<string | null>(null)
  const [selectedWishPlaceId, setSelectedWishPlaceId] = useState<string | null>(null)
  const [showAllDays, setShowAllDays] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const [newTripName, setNewTripName] = useState('')
  const [newTripDestination, setNewTripDestination] = useState('')
  const [newTripStart, setNewTripStart] = useState(today)
  const [newTripEnd, setNewTripEnd] = useState(today)
  const [libraryWidth, setLibraryWidth] = useState(() => {
    const saved = Number(localStorage.getItem('tripnote-workspace-library-width-v1'))
    return Number.isFinite(saved) ? Math.max(220, Math.min(380, saved)) : 286
  })
  const [mapWidth, setMapWidth] = useState(() => {
    const saved = Number(localStorage.getItem('tripnote-workspace-map-width-v1'))
    return Number.isFinite(saved) ? Math.max(360, Math.min(620, saved)) : 440
  })

  useEffect(() => localStorage.setItem('tripnote-workspace-library-width-v1', String(Math.round(libraryWidth))), [libraryWidth])
  useEffect(() => localStorage.setItem('tripnote-workspace-map-width-v1', String(Math.round(mapWidth))), [mapWidth])
  useEffect(() => setSelectedWishPlaceId(null), [activeDayId])
  useEffect(() => {
    if (!introducedActivityId && !recentlyScheduledPlaceId) return
    const timer = window.setTimeout(() => {
      setIntroducedActivityId(null)
      setRecentlyScheduledPlaceId(null)
    }, 760)
    return () => window.clearTimeout(timer)
  }, [introducedActivityId, recentlyScheduledPlaceId])

  function startResize(event: ReactPointerEvent<HTMLDivElement>, edge: 'library' | 'map') {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = edge === 'library' ? libraryWidth : mapWidth
    const update = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      if (edge === 'library') {
        const max = Math.max(220, Math.min(380, window.innerWidth - mapWidth - 380))
        setLibraryWidth(Math.max(220, Math.min(max, startWidth + delta)))
      } else {
        const max = Math.max(360, Math.min(620, window.innerWidth - libraryWidth - 380))
        setMapWidth(Math.max(360, Math.min(max, startWidth - delta)))
      }
    }
    const finish = () => {
      window.removeEventListener('pointermove', update)
      window.removeEventListener('pointerup', finish)
    }
    window.addEventListener('pointermove', update)
    window.addEventListener('pointerup', finish, { once: true })
  }

  function scheduleDrop(event: NativeDragEvent<HTMLElement>) {
    event.preventDefault()
    setIsWishDropTarget(false)
    const placeId = event.dataTransfer.getData(WISH_DRAG_TYPE)
    const place = trip.wishPlaces.find((item) => item.id === placeId)
    const day = trip.days.find((item) => item.id === activeDayId)
    if (!place || !day) return
    const id = scheduleWishPlace(place.id, day.id, { time: nextActivityTime(trip, day.id), title: place.title, category: place.category, location: place.location, note: place.note, geo: place.geo })
    if (id) {
      setIntroducedActivityId(id)
      setRecentlyScheduledPlaceId(place.id)
      useToastStore.getState().show(`已安排「${place.title}」到 ${day.label}`)
    }
  }

  function handleWishDragOver(event: NativeDragEvent<HTMLElement>) {
    event.preventDefault()
    if (event.dataTransfer.types.includes(WISH_DRAG_TYPE)) setIsWishDropTarget(true)
  }

  function handleWishDragLeave(event: NativeDragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsWishDropTarget(false)
  }

  function handleScheduleSuccess(activityId: string, placeId: string) {
    setIntroducedActivityId(activityId)
    setRecentlyScheduledPlaceId(placeId)
  }

  const selectedWishPlace = trip.wishPlaces.find((place) => place.id === selectedWishPlaceId) ?? null

  function submitNewTrip() {
    if (newTripEnd < newTripStart) {
      useToastStore.getState().show('返程日期不能早于出发日期')
      return
    }
    createTrip({ name: newTripName.trim() || undefined, destination: newTripDestination.trim() || undefined, startDate: newTripStart, endDate: newTripEnd })
    setCreateTripOpen(false)
    setNewTripName('')
    setNewTripDestination('')
    useToastStore.getState().show('已创建新旅行，可以先在想去中收集地点')
  }

  function confirmDeleteTrip(item: typeof trip) {
    askConfirm({
      title: `删除旅行「${item.name}」？`,
      message: '其全部行程、地点和花费将一并删除。',
      onConfirm: () => {
        const { trips: previousTrips, activeTripId: previousActiveTripId } = useTripStore.getState()
        deleteTrip(item.id)
        setTripMenuOpen(false)
        useToastStore.getState().show(`已删除旅行「${item.name}」`, {
          undo: () => useTripStore.getState().restoreTrips(previousTrips, previousActiveTripId),
        })
      },
    })
  }

  return <div className="flex h-full min-w-0 flex-col bg-bg" style={{ '--workspace-library-width': `${libraryWidth}px`, '--workspace-map-width': `${mapWidth}px` } as CSSProperties}>
    <header className="flex h-[58px] shrink-0 items-center gap-3 border-b border-border/80 bg-white/92 px-5">
      <LogoIcon size={28} className="shrink-0 shadow-[0_2px_7px_rgba(31,48,63,0.16)]" alt="北向" />
      <div className="relative min-w-0">
        <button onClick={() => setTripMenuOpen((open) => !open)} className="flex max-w-[300px] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface">
          <span className="truncate text-[14px] font-semibold">{trip.name}</span><span className="text-[10px] text-text-faint">⌄</span>
        </button>
        {tripMenuOpen && <div className="absolute top-[calc(100%+7px)] left-0 z-[900] w-[280px] overflow-hidden rounded-lg border border-border bg-white py-1.5 shadow-[0_14px_34px_rgba(32,40,46,0.16)]">
          <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-text-faint">我的旅行</div>
          {trips.map((item) => <div key={item.id} className={`group flex items-center gap-1 px-3 py-1.5 ${item.id === activeTripId ? 'bg-action-soft/50 text-accent-hover' : 'hover:bg-surface'}`}>
            <button onClick={() => { switchTrip(item.id); setTripMenuOpen(false) }} className="flex min-w-0 flex-1 items-center justify-between gap-2 py-0.5 text-left"><span className="truncate text-[12.5px] font-medium">{item.name}</span><span className="shrink-0 text-[10.5px] text-text-faint">{item.days.length} 天</span></button>
            {trips.length > 1 && <button onClick={() => confirmDeleteTrip(item)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 focus:opacity-100" title={`删除「${item.name}」`} aria-label={`删除旅行「${item.name}」`}><TrashIcon size={12} /></button>}
          </div>)}
          <div className="mt-1 border-t border-border/70 pt-1"><button onClick={() => { setTripMenuOpen(false); setCreateTripOpen(true) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-text-muted hover:bg-surface hover:text-text"><PlusIcon size={13} /> 创建新旅行</button></div>
        </div>}
      </div>
      <span className="hidden text-[11.5px] text-text-faint xl:inline">{trip.days.length} 天 · {trip.days[0] ? `${displayDate(trip.days[0].date)} 起` : '待定日期'}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={onOpenFullMap} className="hidden items-center gap-1 rounded-md px-2.5 py-1.5 text-[11.5px] text-text-muted hover:bg-surface lg:flex"><MapIcon size={13} /> 全程地图</button>
        <button onClick={() => setSettingsOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface" title="数据与设置"><SettingsIcon size={15} /></button>
        <button onClick={onExport} disabled={exporting} className="rounded-md border border-border bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-text-muted hover:border-accent/40 disabled:opacity-60">{exporting ? '生成中…' : '导出行程卡片'}</button>
        <button onClick={() => setBudgetDrawerOpen(true)} className="inline-flex rounded-md bg-surface px-2 py-1 text-[10.5px] text-text-faint transition-colors hover:bg-accent-soft hover:text-accent-hover" title="查看并设置旅行总预算">预算 ¥{totalCost.toLocaleString()}{trip.totalBudget ? ` / ¥${trip.totalBudget.toLocaleString()}` : ''}</button>
      </div>
    </header>
    <div className="flex min-h-0 flex-1">
      <PlaceLibrary onStartMapPick={() => setMapPickRequest((request) => request + 1)} recentlyScheduledPlaceId={recentlyScheduledPlaceId} selectedWishPlaceId={selectedWishPlaceId} onSelectWishPlace={setSelectedWishPlaceId} onScheduleSuccess={handleScheduleSuccess} />
      <div role="separator" aria-label="调整想去宽度" aria-orientation="vertical" onPointerDown={(event) => startResize(event, 'library')} className="group -ml-1 flex w-2 shrink-0 cursor-col-resize touch-none items-center justify-center bg-white/80"><span className="h-9 w-px bg-border group-hover:bg-accent" /></div>
      <main onDragOver={handleWishDragOver} onDragLeave={handleWishDragLeave} onDrop={scheduleDrop} className={`relative min-w-[380px] flex-1 overflow-y-auto bg-white/56 transition-colors ${isWishDropTarget ? 'bg-action-soft/35' : ''}`}>
        {isWishDropTarget && <div className="pointer-events-none sticky top-3 z-20 mx-3 flex items-center justify-center rounded-lg border border-dashed border-action/55 bg-white/88 px-3 py-2 text-[12px] font-medium text-action-hover shadow-[0_4px_14px_rgba(175,105,89,0.10)]">松开即可安排到 {trip.days.find((day) => day.id === activeDayId)?.label ?? '当前天'}</div>}
        <TimelineView workspace showAllDays={showAllDays} hideQuickAdd introducedActivityId={introducedActivityId} onOpenFullMap={onOpenFullMap} />
      </main>
      <div role="separator" aria-label="调整地图宽度" aria-orientation="vertical" onPointerDown={(event) => startResize(event, 'map')} className="group flex w-2 shrink-0 cursor-col-resize touch-none items-center justify-center bg-white/80"><span className="h-9 w-px bg-border group-hover:bg-accent" /></div>
      <aside className="min-w-[360px] shrink-0 border-l border-border/80" style={{ width: 'var(--workspace-map-width)' }}><MapView key={showAllDays ? 'all' : activeDayId} initialDayId={showAllDays ? 'all' : activeDayId} compact mapPickRequest={mapPickRequest} highlightWishPlace={selectedWishPlace} wishOverview={!!selectedWishPlace} /></aside>
    </div>
    <DayRail showAllDays={showAllDays} onShowAllDays={() => setShowAllDays(true)} onSelectDay={(dayId) => { setActiveDay(dayId); setShowAllDays(false) }} />
    {budgetDrawerOpen && <BudgetDrawer trip={trip} onClose={() => setBudgetDrawerOpen(false)} />}
    {createTripOpen && <ModalShell title="创建新旅行" description="先确定目的地和日期，之后在想去中慢慢补齐安排。" onClose={() => setCreateTripOpen(false)} size="md" footer={<><button onClick={() => setCreateTripOpen(false)} className="rounded-md px-3 py-2 text-[12px] text-text-muted hover:bg-surface">取消</button><button onClick={submitNewTrip} className="rounded-md bg-action px-4 py-2 text-[12px] font-medium text-white hover:bg-action-hover">创建旅行</button></>}>
      <div className="grid gap-3"><label className="text-[12px] font-medium text-text-muted">旅行名称 <span className="font-normal text-text-faint">（可选）</span><input value={newTripName} onChange={(event) => setNewTripName(event.target.value)} placeholder="例如：日本关西之旅" className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] font-normal outline-none focus:border-accent" /></label><label className="text-[12px] font-medium text-text-muted">主要目的地<input value={newTripDestination} onChange={(event) => setNewTripDestination(event.target.value)} placeholder="例如：大阪、京都、奈良" className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] font-normal outline-none focus:border-accent" /></label><div className="grid grid-cols-2 gap-3"><label className="text-[12px] font-medium text-text-muted">出发日期<input type="date" value={newTripStart} onChange={(event) => { setNewTripStart(event.target.value); if (newTripEnd < event.target.value) setNewTripEnd(event.target.value) }} className="mt-1.5 w-full rounded-md border border-border px-2 py-2 text-[12px] font-normal outline-none focus:border-accent" /></label><label className="text-[12px] font-medium text-text-muted">返程日期<input type="date" min={newTripStart} value={newTripEnd} onChange={(event) => setNewTripEnd(event.target.value)} className="mt-1.5 w-full rounded-md border border-border px-2 py-2 text-[12px] font-normal outline-none focus:border-accent" /></label></div></div>
    </ModalShell>}
    {settingsOpen && <ModalShell title="数据与设置" description="备份、导入、高德地图与路线配置都在这里。" onClose={() => setSettingsOpen(false)} size="lg" bodyClassName="px-0 py-0"><SettingsView embedded /></ModalShell>}
  </div>
}
