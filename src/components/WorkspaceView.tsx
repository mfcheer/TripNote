import { useEffect, useMemo, useState, type CSSProperties, type DragEvent as NativeDragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { findSavedPlace, parsePlaceSnippet, splitPlaceResults, type GeoResult } from '../api/geocode'
import { usePlaceSearch } from '../hooks/usePlaceSearch'
import PlaceSearchFeedback from './PlaceSearchFeedback'
import { displayDate, nextActivityTime, useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS, EditIcon, HeartIcon, LogoIcon, MapIcon, NavigateIcon, PlusIcon, SettingsIcon, TrashIcon } from './Icons'
import { CATEGORY_META, type WishPlace } from '../types'
import MapView from './MapView'
import TimelineView, { BudgetDrawer } from './TimelineView'
import { useToastStore } from './toastStore'
import ModalShell from './OverlayShell'
import SettingsView from './SettingsView'
import { useConfirmStore } from './confirmStore'
import TripTrashDialog from './TripTrashDialog'
import DataSafetyStatus from './DataSafetyStatus'
import { tripDateRange, tripPlanningProgress, tripTagline } from '../utils/tripPresentation'
import TripInfoDialog from './TripInfoDialog'
import { openNavigation } from './navigationStore'

const WISH_DRAG_TYPE = 'application/x-tripnote-wish-id'

function plannedIds(place: WishPlace) {
  return [...(place.scheduledActivityIds ?? []), ...(place.scheduledActivityId ? [place.scheduledActivityId] : [])]
}


function PlaceLibrary({ onStartMapPick, recentlyScheduledPlaceId, selectedWishPlaceId, onSelectWishPlace, onScheduleSuccess }: { onStartMapPick: () => void; recentlyScheduledPlaceId: string | null; selectedWishPlaceId: string | null; onSelectWishPlace: (placeId: string | null) => void; onScheduleSuccess: (activityId: string, placeId: string) => void }) {
  const trip = useActiveTrip()
  const { addWishPlace, removeWishPlace, scheduleWishPlace } = useTripStore()
  const askConfirm = useConfirmStore((state) => state.ask)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const { results, status: searchStatus, error: searchError, retry: retrySearch } = usePlaceSearch(query, trip)
  const activeDayId = useTripStore((state) => state.activeDayId)
  const groupedResults = splitPlaceResults(results)
  const parsed = useMemo(() => parsePlaceSnippet(query), [query])

  useEffect(() => {
    if (!selectedWishPlaceId) return
    document.querySelector<HTMLElement>(`[data-library-place-id="${CSS.escape(selectedWishPlaceId)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedWishPlaceId])

  function clearPlaceSearch() {
    setQuery('')
    setHighlightIndex(-1)
  }

  const matchingWishes = useMemo(() => {
    const q = parsed.title.trim().toLocaleLowerCase()
    return q.length >= 1 ? trip.wishPlaces.filter((place) => place.title.toLocaleLowerCase().includes(q)).slice(0, 3) : []
  }, [parsed.title, trip.wishPlaces])

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
    const exists = findSavedPlace(trip.wishPlaces, title, { lat: result.lat, lng: result.lng })
    if (exists) {
      onSelectWishPlace(exists.id)
      clearPlaceSearch()
      useToastStore.getState().show('这个地点已在想去中')
      return
    }
    const id = addWishPlace({ title, category: 'sight', location: result.label, geo: { lat: result.lat, lng: result.lng } })
    onSelectWishPlace(id)
    clearPlaceSearch()
    useToastStore.getState().show(`已加入想去：${title}`, {
      undo: () => {
        removeWishPlace(id)
      },
    })
  }

  function addSnippetPlace(snippet: typeof parsed) {
    const title = snippet.title.trim()
    if (!title) return
    const exists = findSavedPlace(trip.wishPlaces, title)
    if (exists) {
      onSelectWishPlace(exists.id)
      clearPlaceSearch()
      useToastStore.getState().show('这个地点已在想去中，已为你选中')
      return
    }
    const id = addWishPlace({
      title,
      category: 'sight',
      location: snippet.location,
      note: snippet.note,
    })
    onSelectWishPlace(id)
    clearPlaceSearch()
    useToastStore.getState().show(`已加入想去：${title}`, {
      undo: () => {
        removeWishPlace(id)
      },
    })
  }

  function schedule(place: WishPlace) {
    const day = trip.days.find((item) => item.id === activeDayId)
    if (!day) return
    const { trips, activeTripId } = useTripStore.getState()
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
      useToastStore.getState().show(`已安排「${place.title}」到 ${day.label}`, {
        undo: () => useTripStore.getState().restoreTrips(trips, activeTripId),
      })
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
      data-library-place-id={place.id}
      draggable
      onDragStart={(event) => dragStart(event, place)}
      className={`group flex items-center gap-2 border-b border-border/60 px-3 py-2.5 last:border-b-0 ${selected ? 'bg-action-soft/45' : 'hover:bg-surface/70'} ${scheduled ? 'bg-surface/25' : ''} ${recentlyScheduledPlaceId === place.id ? 'wish-place-complete' : ''} cursor-grab active:cursor-grabbing`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: meta.soft, color: meta.color }}><Icon size={14} /></span>
      <button onClick={() => onSelectWishPlace(selected ? null : place.id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[12.5px] font-medium text-text">{place.title}</span>
        <span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{place.location || '未补充位置'}</span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => schedule(place)}
          className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-medium text-text-faint transition-colors hover:bg-surface hover:text-accent"
          title="安排到当前日期"
          aria-label={`安排「${place.title}」到当前日期`}
        >
          ＋
        </button>
        {place.geo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openNavigation({
                title: place.title,
                location: place.location,
                lat: place.geo!.lat,
                lng: place.geo!.lng,
              })
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-text-faint transition-colors hover:bg-accent-soft hover:text-accent-hover"
            title="外部地图导航"
            aria-label={`导航至 ${place.title}`}
          >
            <NavigateIcon size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={() => removePlace(place, scheduled)}
          className="flex h-6 w-6 items-center justify-center rounded text-text-faint/70 transition-colors hover:bg-red-50 hover:text-red-500"
          title="从想去移除"
          aria-label={`从想去移除 ${place.title}`}
        >
          <TrashIcon size={12} />
        </button>
      </div>
    </div>
  }

  const hasQuery = query.trim().length > 0
  const flatSearchResults = [...groupedResults.trip, ...groupedResults.broader]

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!hasQuery) return
    const totalItems = 1 + matchingWishes.length + flatSearchResults.length
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightIndex((prev) => (prev + 1) % totalItems)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIndex((prev) => (prev <= 0 ? totalItems - 1 : prev - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (highlightIndex <= 0) {
        addSnippetPlace(parsed)
      } else if (highlightIndex <= matchingWishes.length) {
        const wish = matchingWishes[highlightIndex - 1]
        if (wish) {
          onSelectWishPlace(wish.id)
          clearPlaceSearch()
        }
      } else {
        const resIdx = highlightIndex - 1 - matchingWishes.length
        const res = flatSearchResults[resIdx]
        if (res) addResult(res)
        else addSnippetPlace(parsed)
      }
    } else if (event.key === 'Escape') {
      clearPlaceSearch()
    }
  }

  return <aside className="workspace-library flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[18px] border border-border/70 bg-white" style={{ width: 'var(--workspace-library-width)' }}>
    <div className="border-b border-border/70 px-4 pt-4 pb-3">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold text-text">想去</div>
        <span className="rounded-full bg-action-soft px-2 py-0.5 text-[11px] font-medium text-accent-hover">{places.unscheduled.length}</span>
      </div>
      <p className="mt-1 text-[11px] text-text-faint">输入地名按回车秒存，或从下拉建议中选择。</p>
      <div className="mt-2.5 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setHighlightIndex(-1)
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入地名、贴攻略、或搜索"
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-[12px] outline-none focus:border-accent"
          />
          {searchStatus === 'loading' && <span role="status" className="absolute top-2.5 right-3 text-[10.5px] text-text-faint">匹配中</span>}
          {hasQuery && (
            <div className="absolute inset-x-0 top-[calc(100%+5px)] z-[800] max-h-[260px] overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-[0_12px_30px_rgba(32,40,46,0.15)]">
              {/* 选项 0：极速直接添加项 */}
              <button
                type="button"
                onClick={() => addSnippetPlace(parsed)}
                onMouseEnter={() => setHighlightIndex(0)}
                className={`block w-full border-b border-border/70 px-3 py-2 text-left transition-colors ${
                  highlightIndex === 0 ? 'bg-action-soft text-accent-hover' : 'hover:bg-surface'
                }`}
              >
                <div className="flex items-center justify-between text-[12px] font-medium text-text">
                  <span className="truncate">↵ 回车直接添加：<strong className="font-semibold text-accent">{parsed.title}</strong></span>
                  <span className="ml-1.5 shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-faint">秒存</span>
                </div>
                {parsed.isSnippet && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10.5px] text-text-faint">
                    {parsed.location && <span className="rounded bg-surface px-1.5 py-0.5">📍 {parsed.location}</span>}
                    {parsed.note && <span className="rounded bg-surface px-1.5 py-0.5">💬 {parsed.note}</span>}
                  </div>
                )}
              </button>

              {/* 已在清单中的地点匹配 */}
              {matchingWishes.map((place, idx) => {
                const itemIdx = 1 + idx
                return (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => { onSelectWishPlace(place.id); clearPlaceSearch() }}
                    onMouseEnter={() => setHighlightIndex(itemIdx)}
                    className={`block w-full truncate border-b border-border/40 px-3 py-2 text-left text-[11px] ${
                      highlightIndex === itemIdx ? 'bg-action-soft text-accent-hover' : 'bg-action-soft/30 hover:bg-action-soft/60 text-accent-hover'
                    }`}
                  >
                    ⭐ 已在想去清单 · {place.title}
                  </button>
                )
              })}

              {/* 搜索建议列表 */}
              {searchStatus === 'loading' && flatSearchResults.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-text-faint">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent" />
                  正在查找在线定位（可直接按回车保存）...
                </div>
              )}

              {groupedResults.trip.length > 0 && <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium text-text-muted">旅行范围内匹配</div>}
              {groupedResults.trip.map((result) => {
                const itemIdx = 1 + matchingWishes.length + flatSearchResults.indexOf(result)
                return (
                  <button
                    key={`${result.lat}-${result.lng}`}
                    type="button"
                    onClick={() => addResult(result)}
                    onMouseEnter={() => setHighlightIndex(itemIdx)}
                    className={`block w-full px-3 py-2 text-left transition-colors ${
                      highlightIndex === itemIdx ? 'bg-surface' : 'hover:bg-surface'
                    }`}
                  >
                    <span className="block truncate text-[12px] font-medium">{result.label.split(',')[0]}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{result.label}</span>
                  </button>
                )
              })}

              {groupedResults.broader.length > 0 && (
                <>
                  <div className="border-y border-border/60 bg-surface/70 px-3 py-1 text-[10px] font-medium text-text-faint">其他可能地点</div>
                  {groupedResults.broader.map((result) => {
                    const itemIdx = 1 + matchingWishes.length + flatSearchResults.indexOf(result)
                    return (
                      <button
                        key={`${result.lat}-${result.lng}`}
                        type="button"
                        onClick={() => addResult(result)}
                        onMouseEnter={() => setHighlightIndex(itemIdx)}
                        className={`block w-full px-3 py-2 text-left transition-colors ${
                          highlightIndex === itemIdx ? 'bg-surface' : 'hover:bg-surface'
                        }`}
                      >
                        <span className="block truncate text-[12px] font-medium">{result.label.split(',')[0]}</span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{result.label}</span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>
        <button onClick={onStartMapPick} className="h-[34px] shrink-0 self-start rounded-md border border-border bg-white px-2.5 text-[11px] font-medium text-text-muted hover:border-accent/40 hover:text-accent" title="在右侧地图选择地点"><MapIcon size={14} /></button>
      </div>
      <PlaceSearchFeedback status={searchStatus} error={searchError} query={query} onRetry={retrySearch} onManual={() => addSnippetPlace(parsed)} onMap={onStartMapPick} />
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5"><span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-faint">待安排</span><span className="text-[10.5px] text-text-faint">{places.unscheduled.length} 个</span></div>
      <div>{places.unscheduled.length ? places.unscheduled.map((place) => renderPlace(place)) : <p className="px-4 py-5 text-[11.5px] leading-relaxed text-text-faint">地点都已安排完，可在上方输入新地名继续收藏。</p>}</div>
      {places.scheduled.length > 0 && <details className="mt-2 border-t border-border/70" open>
        <summary className="cursor-pointer list-none px-4 py-3 text-[10.5px] font-semibold tracking-[0.12em] text-text-faint [&::-webkit-details-marker]:hidden">已安排 · {places.scheduled.length} <span className="font-normal tracking-normal">（可再次安排）</span></summary>
        <div>{places.scheduled.map((place) => renderPlace(place, true))}</div>
      </details>}
    </div>
    <div className="border-t border-border/70 px-4 py-3 text-[10.5px] leading-relaxed text-text-faint"><HeartIcon size={12} className="mr-1 inline" />安排后仍保留在清单中，方便多天使用。</div>
  </aside>
}

export default function WorkspaceView({ onExport, exporting, onOpenFullMap, onOpenAgent, mapNarrativePreview = true }: { onExport: () => void; exporting: boolean; onOpenFullMap: () => void; onOpenAgent: () => void; mapNarrativePreview?: boolean }) {
  const trip = useActiveTrip()
  const { trips, deletedTrips, activeTripId, switchTrip, createTrip, deleteTrip, scheduleWishPlace, activeDayId, setActiveDay } = useTripStore()
  const askConfirm = useConfirmStore((state) => state.ask)
  const totalCost = trip.activities.reduce((sum, activity) => sum + activity.costs.reduce((subtotal, cost) => subtotal + cost.amount, 0), 0)
  const [tripMenuOpen, setTripMenuOpen] = useState(false)
  const [createTripOpen, setCreateTripOpen] = useState(false)
  const [tripTrashOpen, setTripTrashOpen] = useState(false)
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [budgetDrawerOpen, setBudgetDrawerOpen] = useState(false)
  const [mapPickRequest, setMapPickRequest] = useState(0)
  const [isWishDropTarget, setIsWishDropTarget] = useState(false)
  const [introducedActivityId, setIntroducedActivityId] = useState<string | null>(null)
  const [recentlyScheduledPlaceId, setRecentlyScheduledPlaceId] = useState<string | null>(null)
  const [selectedWishPlaceId, setSelectedWishPlaceId] = useState<string | null>(null)
  const [showAllDays, setShowAllDays] = useState(true)
  const [workspaceMapScope, setWorkspaceMapScope] = useState<'follow' | 'all'>('follow')
  const [mapFollowDayId, setMapFollowDayId] = useState(activeDayId)
  const today = new Date().toISOString().slice(0, 10)
  const [newTripName, setNewTripName] = useState('')
  const [newTripDestination, setNewTripDestination] = useState('')
  const [newTripStart, setNewTripStart] = useState(today)
  const [newTripEnd, setNewTripEnd] = useState(today)
  const [libraryWidth, setLibraryWidth] = useState(() => {
    const rawSaved = localStorage.getItem('tripnote-workspace-library-width-v1')
    const saved = rawSaved == null ? Number.NaN : Number(rawSaved)
    return Number.isFinite(saved) ? Math.max(220, Math.min(380, saved)) : 286
  })
  const [mapWidth, setMapWidth] = useState(() => {
    const rawSaved = localStorage.getItem('tripnote-workspace-map-width-v2')
    const saved = rawSaved == null ? Number.NaN : Number(rawSaved)
    return Number.isFinite(saved) ? Math.max(360, Math.min(680, saved)) : 520
  })

  useEffect(() => localStorage.setItem('tripnote-workspace-library-width-v1', String(Math.round(libraryWidth))), [libraryWidth])
  useEffect(() => localStorage.setItem('tripnote-workspace-map-width-v2', String(Math.round(mapWidth))), [mapWidth])
  useEffect(() => setWorkspaceMapScope('follow'), [activeTripId])
  useEffect(() => setSelectedWishPlaceId(null), [activeDayId])
  // 全部日程连续滚动时，地图只在阅读停留后跟随，避免每跨过一张卡片就重新缩放。
  useEffect(() => {
    const timer = window.setTimeout(() => setMapFollowDayId(activeDayId), 360)
    return () => window.clearTimeout(timer)
  }, [activeDayId])
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
        const max = Math.max(360, Math.min(680, window.innerWidth - libraryWidth - 380))
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
    const { trips, activeTripId } = useTripStore.getState()
    const id = scheduleWishPlace(place.id, day.id, { time: nextActivityTime(trip, day.id), title: place.title, category: place.category, location: place.location, note: place.note, geo: place.geo })
    if (id) {
      setIntroducedActivityId(id)
      setRecentlyScheduledPlaceId(place.id)
      useToastStore.getState().show(`已安排「${place.title}」到 ${day.label}`, {
        undo: () => useTripStore.getState().restoreTrips(trips, activeTripId),
      })
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
    createTrip({ name: newTripName.trim() || undefined, destination: newTripDestination.trim() || undefined, searchRegion: newTripDestination.trim() || undefined, startDate: newTripStart, endDate: newTripEnd })
    setCreateTripOpen(false)
    setNewTripName('')
    setNewTripDestination('')
    useToastStore.getState().show('已创建新旅行，可以先在想去中收集地点')
  }

  function confirmDeleteTrip(item: typeof trip) {
    askConfirm({
      title: `删除旅行「${item.name}」？`,
      message: '会移入回收站，可随时恢复。',
      onConfirm: () => {
        deleteTrip(item.id)
        setTripMenuOpen(false)
        useToastStore.getState().show(`已将旅行「${item.name}」移入回收站`)
      },
    })
  }

  return <div className={`workspace-root flex h-full min-w-0 flex-col bg-bg ${mapNarrativePreview ? 'map-narrative-preview' : ''}`} style={{ '--workspace-library-width': `${libraryWidth}px`, '--workspace-map-width': `${mapWidth}px` } as CSSProperties}>
    <header className="workspace-header trip-identity-header relative z-[1000] flex h-[68px] shrink-0 items-center gap-3 border-b border-border/70 px-6">
      <LogoIcon size={28} className="shrink-0 shadow-[0_2px_7px_rgba(31,48,63,0.16)]" alt="TripNote" />
      <span className="shrink-0 text-[14px] font-semibold tracking-[-0.025em] text-text">TripNote</span>
      <span className="h-4 w-px shrink-0 bg-border/80" aria-hidden="true" />
      <div className="relative min-w-0">
        <button aria-label={`切换旅行：${trip.name}`} aria-expanded={tripMenuOpen} aria-controls="workspace-trip-menu" onClick={() => setTripMenuOpen((open) => !open)} className="flex max-w-[380px] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface">
          <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{trip.name}</span><span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{tripTagline(trip)} · {tripDateRange(trip)} · 已规划 {tripPlanningProgress(trip)}%</span></span><span className="text-[10px] text-text-faint">⌄</span>
        </button>
        {tripMenuOpen && <div id="workspace-trip-menu" className="absolute top-[calc(100%+7px)] left-0 z-[1100] max-h-[calc(100dvh-90px)] w-[280px] overflow-y-auto rounded-lg border border-border bg-white py-1.5 shadow-[0_14px_34px_rgba(32,40,46,0.16)]">
          <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-text-faint">我的旅行</div>
          {trips.map((item) => <div key={item.id} className={`group flex items-center gap-1 px-3 py-1.5 ${item.id === activeTripId ? 'bg-action-soft/50 text-accent-hover' : 'hover:bg-surface'}`}>
            <button onClick={() => { switchTrip(item.id); setTripMenuOpen(false) }} className="flex min-w-0 flex-1 items-center justify-between gap-2 py-0.5 text-left"><span className="truncate text-[12.5px] font-medium">{item.name}</span><span className="shrink-0 text-[10.5px] text-text-faint">{item.days.length} 天</span></button>
            <button onClick={() => { setTripMenuOpen(false); setEditingTripId(item.id) }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" title={`编辑「${item.name}」的旅行信息`} aria-label={`编辑「${item.name}」的旅行信息`}><EditIcon size={14} /></button>
            {trips.length > 1 && <button onClick={() => confirmDeleteTrip(item)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 focus:opacity-100" title={`删除「${item.name}」`} aria-label={`删除旅行「${item.name}」`}><TrashIcon size={12} /></button>}
          </div>)}
          <div className="mt-1 border-t border-border/70 pt-1">
            <button onClick={() => { setTripMenuOpen(false); setTripTrashOpen(true) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-text-muted hover:bg-surface hover:text-text"><TrashIcon size={13} /> 回收站{deletedTrips.length ? ` · ${deletedTrips.length}` : ''}</button>
            <button onClick={() => { setTripMenuOpen(false); setCreateTripOpen(true) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-text-muted hover:bg-surface hover:text-text"><PlusIcon size={13} /> 创建新旅行</button>
          </div>
          <DataSafetyStatus onOpenSettings={() => { setTripMenuOpen(false); setSettingsOpen(true) }} />
        </div>}
      </div>
      <span className="hidden text-[11.5px] text-text-faint 2xl:inline">{trip.days.length} 天 · {trip.days[0] ? `${displayDate(trip.days[0].date)} 起` : '待定日期'}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={onOpenAgent} className="hidden items-center gap-1 rounded-md bg-action-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-accent-hover transition-colors hover:bg-action hover:text-white xl:flex">✦ 帮我规划</button>
        <button onClick={onOpenFullMap} className="hidden items-center gap-1 rounded-md px-2.5 py-1.5 text-[11.5px] text-text-muted hover:bg-surface lg:flex"><MapIcon size={13} /> 全程地图</button>
        <button onClick={() => setBudgetDrawerOpen(true)} className="inline-flex rounded-md bg-surface px-2 py-1 text-[10.5px] text-text-faint transition-colors hover:bg-accent-soft hover:text-accent-hover" title="查看并设置旅行总预算">预算 ¥{totalCost.toLocaleString()}{trip.totalBudget ? ` / ¥${trip.totalBudget.toLocaleString()}` : ''}</button>
        <span className="mx-1 hidden h-4 w-px bg-border/80 lg:block" aria-hidden="true" />
        <button onClick={onExport} disabled={exporting} className="rounded-md border border-border bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-text-muted hover:border-accent/40 disabled:opacity-60">{exporting ? '生成中…' : '导出行程卡片'}</button>
        <button onClick={() => setSettingsOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface" title="数据与设置" aria-label="数据与设置"><SettingsIcon size={15} /></button>
      </div>
    </header>
    <div className="flex min-h-0 flex-1 gap-2 bg-bg px-2 pb-2">
      <PlaceLibrary onStartMapPick={() => setMapPickRequest((request) => request + 1)} recentlyScheduledPlaceId={recentlyScheduledPlaceId} selectedWishPlaceId={selectedWishPlaceId} onSelectWishPlace={setSelectedWishPlaceId} onScheduleSuccess={handleScheduleSuccess} />
      <div role="separator" aria-label="调整想去宽度" aria-orientation="vertical" onPointerDown={(event) => startResize(event, 'library')} className="group flex w-2 shrink-0 cursor-col-resize touch-none items-center justify-center"><span className="h-9 w-px bg-border/0 group-hover:bg-accent/55" /></div>
      <main data-workspace-scroll onDragOver={handleWishDragOver} onDragLeave={handleWishDragLeave} onDrop={scheduleDrop} className={`relative min-w-[380px] flex-1 overflow-y-auto rounded-[18px] border border-border/70 bg-white transition-colors ${isWishDropTarget ? 'bg-action-soft/35' : ''}`}>
        <TimelineView workspace showAllDays={showAllDays} onShowAllDays={() => setShowAllDays(true)} onFocusDay={(dayId) => { setActiveDay(dayId); setShowAllDays(false) }} hideQuickAdd introducedActivityId={introducedActivityId} onOpenFullMap={onOpenFullMap} />
      </main>
      <div role="separator" aria-label="调整地图宽度" aria-orientation="vertical" onPointerDown={(event) => startResize(event, 'map')} className="group flex w-2 shrink-0 cursor-col-resize touch-none items-center justify-center"><span className="h-9 w-px bg-border/0 group-hover:bg-accent/55" /></div>
      <aside className="min-w-[360px] shrink-0 overflow-hidden rounded-[18px] border border-border/70 bg-white" style={{ width: 'var(--workspace-map-width)' }}><MapView initialDayId={mapFollowDayId} compact mapPickRequest={mapPickRequest} highlightWishPlace={selectedWishPlace} wishOverview={!!selectedWishPlace} workspaceMapScope={workspaceMapScope} followDayId={mapFollowDayId} onWorkspaceMapScopeChange={setWorkspaceMapScope} narrativePreview={mapNarrativePreview} /></aside>
    </div>
    {budgetDrawerOpen && <BudgetDrawer trip={trip} onClose={() => setBudgetDrawerOpen(false)} />}
    {tripTrashOpen && <TripTrashDialog onClose={() => setTripTrashOpen(false)} />}
    {createTripOpen && <ModalShell title="创建新旅行" description="填一次旅行区域，之后地点搜索会自动优先匹配这里。" onClose={() => setCreateTripOpen(false)} size="md" footer={<><button onClick={() => setCreateTripOpen(false)} className="rounded-md px-3 py-2 text-[12px] text-text-muted hover:bg-surface">取消</button><button onClick={submitNewTrip} className="rounded-md bg-action px-4 py-2 text-[12px] font-medium text-white hover:bg-action-hover">创建旅行</button></>}>
      <div className="grid gap-3"><label className="text-[12px] font-medium text-text-muted">旅行名称 <span className="font-normal text-text-faint">（可选）</span><input value={newTripName} onChange={(event) => setNewTripName(event.target.value)} placeholder="例如：日本关西之旅" className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] font-normal outline-none focus:border-accent" /></label><label className="text-[12px] font-medium text-text-muted">旅行区域 <span className="font-normal text-text-faint">（用于智能搜索）</span><input value={newTripDestination} onChange={(event) => setNewTripDestination(event.target.value)} placeholder="例如：东北、关西、大阪" className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] font-normal outline-none focus:border-accent" /></label><div className="grid grid-cols-2 gap-3"><label className="text-[12px] font-medium text-text-muted">出发日期<input type="date" value={newTripStart} onChange={(event) => { setNewTripStart(event.target.value); if (newTripEnd < event.target.value) setNewTripEnd(event.target.value) }} className="mt-1.5 w-full rounded-md border border-border px-2 py-2 text-[12px] font-normal outline-none focus:border-accent" /></label><label className="text-[12px] font-medium text-text-muted">返程日期<input type="date" min={newTripStart} value={newTripEnd} onChange={(event) => setNewTripEnd(event.target.value)} className="mt-1.5 w-full rounded-md border border-border px-2 py-2 text-[12px] font-normal outline-none focus:border-accent" /></label></div></div>
    </ModalShell>}
    {editingTripId && <TripInfoDialog key={editingTripId} tripId={editingTripId} onClose={() => setEditingTripId(null)} />}
    {settingsOpen && <ModalShell title="数据与设置" description="管理本地备份、地图服务与扩展设置" onClose={() => setSettingsOpen(false)} size="lg" bodyClassName="px-0 py-0 pb-6"><SettingsView embedded /></ModalShell>}
  </div>
}
