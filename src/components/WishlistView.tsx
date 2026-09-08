import { useEffect, useRef, useState, type DragEvent as NativeDragEvent } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { searchPlaces, type GeoResult } from '../api/geocode'
import { displayDate, nextActivityTime, useActiveTrip, useTripStore } from '../store'
import { CalendarIcon, CATEGORY_ICONS, MapIcon, PlusIcon, TrashIcon } from './Icons'
import { CATEGORY_META, type ActivityCategory, type GeoPoint, type WishPlace } from '../types'
import ActivityForm, { type ActivityFormValues } from './ActivityForm'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'
import MapPicker from './MapPicker'
import AmapCanvas, { type AmapMarker } from './AmapCanvas'

const WISHLIST_MAP_WIDTH_KEY = 'tripnote-wishlist-map-width-v1'

function readMapPanelWidth() {
  const saved = Number(localStorage.getItem(WISHLIST_MAP_WIDTH_KEY))
  return Number.isFinite(saved) ? Math.max(340, Math.min(720, saved)) : 440
}

function wishMarker(active: boolean, label: string) {
  const color = active ? '#223b56' : '#304a67'
  return L.divIcon({
    className: '',
    html: `<div class="map-place-marker" style="border-color:${color};color:${color};${active ? 'background:#e8edf1;' : ''}">${escapeHtml(label)}</div>`,
    iconSize: [140, 28],
    iconAnchor: [70, 14],
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&gt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!))
}

function FitPlaces({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13)
    if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.16))
  }, [map, points])
  return null
}

function CustomMapWishDialog({
  initialName,
  initialCategory,
  onSaved,
  onClose,
}: {
  initialName: string
  initialCategory: ActivityCategory
  onSaved: (id: string) => void
  onClose: () => void
}) {
  const trip = useActiveTrip()
  const addWishPlace = useTripStore((state) => state.addWishPlace)
  const removeWishPlace = useTripStore((state) => state.removeWishPlace)
  const [name, setName] = useState(initialName)
  const [category, setCategory] = useState(initialCategory)
  const [point, setPoint] = useState<GeoPoint>()
  const [location, setLocation] = useState('')
  const nearbyPoint = trip.activities.find((activity) => activity.geo)?.geo
    ?? trip.wishPlaces.find((place) => place.geo)?.geo
  const initialCenter = nearbyPoint ?? { lat: 20, lng: 0 }

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  function save() {
    const title = name.trim()
    if (!title || !point) return
    const id = addWishPlace({
      title,
      category,
      location: location.trim() || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      geo: point,
    })
    useToastStore.getState().show(`已从地图收藏「${title}」`, {
      undo: () => removeWishPlace(id),
    })
    onSaved(id)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="地图选点收藏"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="max-h-[calc(100vh-32px)] w-full max-w-[760px] overflow-y-auto rounded-xl border border-border bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-[16px] font-semibold">在地图上收藏地点</div>
            <div className="mt-1 text-[12px] text-text-muted">拖动、缩放地图并点击任意位置，再给它起一个自己看得懂的名称。</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[18px] leading-none text-text-faint hover:bg-surface hover:text-text"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="p-5">
          <MapPicker
            point={point}
            label={location}
            initialCenter={initialCenter}
            initialZoom={nearbyPoint ? 10 : 2}
            heightClassName="h-[260px] sm:h-[340px]"
            onPick={(nextPoint, nextLocation) => {
              setPoint(nextPoint)
              if (nextLocation) setLocation(nextLocation)
            }}
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_130px]">
            <label className="text-[12px] font-medium text-text-muted">
              自定义名称
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：海边看日落的位置"
                className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] font-normal text-text outline-none focus:border-accent"
              />
            </label>
            <label className="text-[12px] font-medium text-text-muted">
              分类
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as ActivityCategory)}
                className="mt-1.5 w-full rounded-md border border-border bg-white px-2.5 py-2 text-[13px] font-normal text-text outline-none focus:border-accent"
              >
                {(Object.keys(CATEGORY_META) as ActivityCategory[]).map((value) => (
                  <option key={value} value={value}>{CATEGORY_META[value].label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-3 block text-[12px] font-medium text-text-muted">
            位置说明 <span className="font-normal text-text-faint">（选点后自动识别，也可自己修改）</span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder={point ? '没有识别到地址，可以手动填写' : '请先在地图上点击一个位置'}
              className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] font-normal text-text outline-none focus:border-accent"
            />
          </label>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={save}
              disabled={!name.trim() || !point}
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              收藏这个位置
            </button>
            <button onClick={onClose} className="rounded-md px-3 py-2 text-[13px] text-text-muted hover:bg-surface">取消</button>
            {!point && <span className="ml-auto text-[11.5px] text-text-faint">需要先点击地图放置标记</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function ScheduleWishDialog({
  place,
  initialDayId,
  onClose,
}: {
  place: WishPlace
  initialDayId: string
  onClose: () => void
}) {
  const trip = useActiveTrip()
  const scheduleWishPlace = useTripStore((state) => state.scheduleWishPlace)
  const [dayId, setDayId] = useState(
    trip.days.some((day) => day.id === initialDayId) ? initialDayId : (trip.days[0]?.id ?? ''),
  )
  const day = trip.days.find((item) => item.id === dayId)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  function submit(values: ActivityFormValues) {
    if (!dayId) return
    if (scheduleWishPlace(place.id, dayId, values)) {
      useToastStore.getState().show(`已将「${values.title}」安排到${day?.label ?? '行程'}`)
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`安排${place.title}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="max-h-[calc(100vh-32px)] w-full max-w-[680px] overflow-y-auto rounded-xl border border-border bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-white px-5 py-4">
          <div>
            <div className="text-[16px] font-semibold">安排到行程</div>
            <div className="mt-1 text-[12px] text-text-muted">确认日期和时间后再加入，不会直接生成默认安排。</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[18px] leading-none text-text-faint hover:bg-surface hover:text-text"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="p-5">
          <label className="mb-4 block text-[12px] font-medium text-text-muted">
            安排日期
            <select
              value={dayId}
              onChange={(event) => setDayId(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] font-normal text-text outline-none focus:border-accent"
            >
              {trip.days.map((tripDay) => (
                <option key={tripDay.id} value={tripDay.id}>
                  {tripDay.label} · {displayDate(tripDay.date)}{tripDay.place ? ` · ${tripDay.place}` : ''}
                </option>
              ))}
            </select>
          </label>
          <ActivityForm
            key={dayId}
            initial={{
              time: nextActivityTime(trip, dayId),
              title: place.title,
              category: place.category,
              location: place.location,
              note: place.note,
              geo: place.geo,
            }}
            submitLabel="确认安排"
            onSubmit={submit}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}

function startWishScheduleDrag(event: NativeDragEvent<HTMLElement>, place: WishPlace) {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-tripnote-wish-id', place.id)
  event.dataTransfer.setData('text/plain', place.title)
}

function ScheduleDragButton({ place, onSchedule }: { place: WishPlace; onSchedule: () => void }) {
  return (
    <button
      draggable
      onDragStart={(event) => startWishScheduleDrag(event, place)}
      onClick={onSchedule}
      className="hidden items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-muted transition-colors hover:border-accent hover:text-accent md:flex"
      title="拖到左侧日期即可快速安排（点击仍可手动选择日期）"
      aria-label={`拖动「${place.title}」到左侧日期安排`}
    >
      <CalendarIcon size={13} /> 拖到左侧日期
    </button>
  )
}

function SortableWishCard({
  place,
  active,
  scheduledItems,
  onActivate,
  onRemove,
  onFocus,
  onCancel,
  onSchedule,
}: {
  place: WishPlace
  active: boolean
  scheduledItems: Array<{ id: string; time: string; dayLabel: string }>
  onActivate: () => void
  onRemove: () => void
  onFocus: (activityId: string) => void
  onCancel: (activityId: string) => void
  onSchedule: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: place.id })
  const meta = CATEGORY_META[place.category]
  const Icon = CATEGORY_ICONS[place.category]

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group rounded-lg border bg-white p-2.5 transition-colors ${
        active ? 'border-accent shadow-[0_2px_8px_rgba(49,92,125,0.12)]' : 'border-border'
      } ${isDragging ? 'relative z-30 opacity-70 shadow-lg' : ''}`}
      onMouseEnter={onActivate}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          onFocus={onActivate}
          className="mt-0.5 flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-[16px] leading-none text-text-faint opacity-35 transition-[opacity,color,background] group-hover:opacity-100 hover:bg-surface hover:text-accent focus:opacity-100 active:cursor-grabbing"
          aria-label={`拖动排序 ${place.title}`}
          title="仅用于调整想去清单顺序"
        >
          ⠿
        </button>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: meta.soft, color: meta.color }}>
          <Icon size={15} />
        </div>
        <div
          draggable
          onDragStart={(event) => startWishScheduleDrag(event, place)}
          className="min-w-0 flex-1 cursor-grab rounded py-0.5 active:cursor-grabbing"
          title="拖动地点名称到左侧日期，即可快速安排"
        >
          <div className="truncate text-[13px] font-medium">{place.title}</div>
          {place.location && <div className="mt-px truncate text-[11.5px] text-text-muted">{place.location}</div>}
          {place.note && <div className="mt-0.5 truncate text-[11px] text-text-faint">{place.note}</div>}
        </div>
        <button
          onClick={onRemove}
          className="h-fit shrink-0 rounded p-1 text-text-faint hover:text-red-500"
          title={scheduledItems.length > 0 ? '移出清单，已排行程会保留' : '移出清单'}
        >
          <TrashIcon size={14} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        {scheduledItems.length > 0 ? (
          <>
            <span className="mr-auto text-[11px] font-medium text-accent-hover">已安排 {scheduledItems.length} 次</span>
            <ScheduleDragButton place={place} onSchedule={onSchedule} />
            <button onClick={onSchedule} className="rounded-md border border-accent/40 px-2 py-1 text-[11px] font-medium text-accent-hover hover:bg-accent-soft">
              再安排
            </button>
            <div className="flex w-full flex-wrap gap-1 pt-0.5">
              {scheduledItems.map((item) => (
                <span key={item.id} className="inline-flex items-center overflow-hidden rounded-full border border-border bg-white text-[11px]">
                  <button onClick={() => onFocus(item.id)} className="px-1.5 py-0.5 text-text-muted hover:bg-surface-2 hover:text-accent">
                    {item.dayLabel} · {item.time}
                  </button>
                  <button
                    onClick={() => onCancel(item.id)}
                    className="border-l border-border px-1.5 py-0.5 text-text-faint hover:bg-red-50 hover:text-red-500"
                    title={`取消 ${item.dayLabel} · ${item.time} 的安排`}
                    aria-label={`取消 ${item.dayLabel} ${item.time} 的安排`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="mr-auto text-[11px] text-text-faint">尚未安排日期</span>
            <ScheduleDragButton place={place} onSchedule={onSchedule} />
            <button onClick={onSchedule} className="rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-hover">
              安排到行程
            </button>
          </>
        )}
      </div>
    </article>
  )
}

export default function WishlistView() {
  const trip = useActiveTrip()
  const { addWishPlace, removeWishPlace, reorderWishPlace, cancelWishSchedule, focusActivity, amapWebServiceKey, amapJsKey } = useTripStore()
  const askConfirm = useConfirmStore((state) => state.ask)
  const [category, setCategory] = useState<ActivityCategory | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mapPanelWidth, setMapPanelWidth] = useState(readMapPanelWidth)
  const [manualCategory, setManualCategory] = useState<ActivityCategory>('sight')
  const [schedulingPlaceId, setSchedulingPlaceId] = useState<string | null>(null)
  const [showCustomMap, setShowCustomMap] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    localStorage.setItem(WISHLIST_MAP_WIDTH_KEY, String(mapPanelWidth))
  }, [mapPanelWidth])

  function startMapResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = mapPanelWidth
    const onMove = (moveEvent: PointerEvent) => {
      // 拖动分隔条向左扩展地图，向右收回地图；始终为清单保留足够的阅读空间。
      const maxWidth = Math.min(720, Math.max(340, window.innerWidth - 360))
      setMapPanelWidth(Math.max(340, Math.min(maxWidth, startWidth + startX - moveEvent.clientX)))
    }
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd, { once: true })
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) reorderWishPlace(String(active.id), String(over.id))
  }

  useEffect(() => {
    const query = searching.trim()
    if (query.length < 2) {
      return
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        setResults(await searchPlaces(query, ctrl.signal, amapWebServiceKey))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults([])
      }
    }, 450)
    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [searching, amapWebServiceKey])

  function isPlaceScheduled(place: WishPlace) {
    return scheduledItemsFor(place).length > 0
  }

  function scheduledItemsFor(place: WishPlace) {
    const ids = Array.from(new Set([...(place.scheduledActivityIds ?? []), ...(place.scheduledActivityId ? [place.scheduledActivityId] : [])]))
    return ids
      .map((id) => trip.activities.find((activity) => activity.id === id))
      .filter((activity): activity is NonNullable<typeof activity> => !!activity)
      .map((activity) => ({
        id: activity.id,
        time: activity.time,
        dayLabel: trip.days.find((day) => day.id === activity.dayId)?.label ?? '未分配日期',
        dayIndex: trip.days.findIndex((day) => day.id === activity.dayId),
      }))
      .sort((a, b) => a.dayIndex - b.dayIndex || a.time.localeCompare(b.time))
      .map(({ dayIndex: _dayIndex, ...item }) => item)
  }

  const filtered = trip.wishPlaces
    .filter((place) => {
      const matchesCategory = category === 'all' || place.category === category
      const source = `${place.title} ${place.location ?? ''}`.toLowerCase()
      return matchesCategory && source.includes(keyword.trim().toLowerCase())
    })
    .sort((a, b) => Number(isPlaceScheduled(a)) - Number(isPlaceScheduled(b)))
  const mapped = filtered.filter((place) => place.geo)
  const points = mapped.map((place) => [place.geo!.lat, place.geo!.lng] as [number, number])
  const amapMarkers: AmapMarker[] = mapped.map((place) => ({
    id: place.id,
    point: place.geo!,
    label: place.title,
    color: activeId === place.id ? '#223b56' : '#304a67',
    active: activeId === place.id,
    wide: true,
    onClick: () => setActiveId(place.id),
  }))

  function addFromResult(result: GeoResult) {
    const id = addWishPlace({
      title: result.label.split(',')[0],
      category: manualCategory,
      location: result.label,
      geo: { lat: result.lat, lng: result.lng },
    })
    setActiveId(id)
    setSearching('')
    setResults([])
    useToastStore.getState().show(`已收藏「${result.label.split(',')[0]}」`)
  }

  function addManual() {
    const title = searching.trim()
    if (!title) return
    const id = addWishPlace({ title, category: manualCategory })
    setActiveId(id)
    setSearching('')
    setResults([])
    useToastStore.getState().show(`已收藏「${title}」`)
  }

  function removePlace(placeId: string, title: string, isScheduled: boolean) {
    if (isScheduled) {
      askConfirm({
        title: `从想去清单移出「${title}」？`,
        message: '只会移出这个收藏地点；已排好的行程和花费都会保留。',
        danger: false,
        onConfirm: () => removePlaceNow(placeId, title),
      })
      return
    }
    removePlaceNow(placeId, title)
  }

  function removePlaceNow(placeId: string, title: string) {
    const { trips, activeTripId } = useTripStore.getState()
    removeWishPlace(placeId)
    useToastStore.getState().show(`已从想去清单移出「${title}」`, {
      undo: () => useTripStore.getState().restoreTrips(trips, activeTripId),
    })
  }

  function cancelSchedule(place: WishPlace, activityId: string) {
    const activity = trip.activities.find((item) => item.id === activityId)
    if (!activity) return
    const costHint = activity && activity.costs.length > 0 ? `及其中 ${activity.costs.length} 笔花费` : ''
    askConfirm({
      title: `取消安排「${place.title}」？`,
      message: `将删除已生成的安排${costHint}；地点会继续保留在想去清单中。`,
      onConfirm: () => {
        const { trips, activeTripId } = useTripStore.getState()
        cancelWishSchedule(place.id, activity.id)
        useToastStore.getState().show(`已取消 ${activity.time} 的安排「${place.title}」`, {
          undo: () => useTripStore.getState().restoreTrips(trips, activeTripId),
        })
      },
    })
  }

  const scheduledCount = trip.wishPlaces.filter(isPlaceScheduled).length
  const schedulingPlace = trip.wishPlaces.find((place) => place.id === schedulingPlaceId)

  return (
    <div className="flex h-full min-w-0">
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="mr-auto max-w-[920px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <div className="mb-5">
            <h1 className="text-[18px] font-semibold">想去清单</h1>
            <p className="mt-1 text-[12.5px] text-text-muted">
              先收藏灵感，需要时再确认日期和时间。待安排地点 {trip.wishPlaces.length - scheduledCount} · 已安排地点 {scheduledCount}
            </p>
          </div>

          <div className="relative mb-5 rounded-xl border border-accent/30 bg-accent-soft/25 p-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-full flex-1 sm:min-w-[250px]">
                <input
                  value={searching}
                  onChange={(event) => {
                    setSearching(event.target.value)
                    if (event.target.value.trim().length < 2) setResults([])
                  }}
                  onKeyDown={(event) => event.key === 'Enter' && addManual()}
                  placeholder="搜索地点，或直接输入想去的安排"
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-accent"
                />
                {results.length > 0 && (
                  <ul className="absolute top-full left-0 z-20 mt-1 max-h-[230px] w-full overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-lg">
                    {results.map((result) => (
                      <li key={`${result.lat},${result.lng}`}>
                        <button onClick={() => addFromResult(result)} className="w-full px-3 py-2 text-left hover:bg-accent-soft">
                          <div className="truncate text-[12.5px] font-medium">{result.label.split(',')[0]}</div>
                          <div className="mt-0.5 truncate text-[11px] text-text-faint">{result.label}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={() => setShowCustomMap(true)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-[12.5px] font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <MapIcon size={14} /> 地图选点
              </button>
              <select
                value={manualCategory}
                onChange={(event) => setManualCategory(event.target.value as ActivityCategory)}
                className="rounded-md border border-border bg-white px-2.5 py-2 text-[12.5px] text-text-muted outline-none focus:border-accent"
              >
                {(Object.keys(CATEGORY_META) as ActivityCategory[]).map((value) => (
                  <option key={value} value={value}>{CATEGORY_META[value].label}</option>
                ))}
              </select>
              <button onClick={addManual} disabled={!searching.trim()} className="flex items-center gap-1 rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40">
                <PlusIcon size={14} /> 收藏
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="筛选地点或城市"
                className="w-full rounded-md border border-border px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent sm:w-[180px]"
            />
            <button onClick={() => setCategory('all')} className={`rounded-full px-2.5 py-1 text-[12px] ${category === 'all' ? 'bg-accent text-white' : 'bg-surface text-text-muted'}`}>全部 {trip.wishPlaces.length}</button>
            {(Object.keys(CATEGORY_META) as ActivityCategory[]).map((value) => (
              <button key={value} onClick={() => setCategory(value)} className={`rounded-full px-2.5 py-1 text-[12px] ${category === value ? 'bg-accent text-white' : 'bg-surface text-text-muted'}`}>
                {CATEGORY_META[value].label}
              </button>
            ))}
          </div>

          <div className="mb-3 hidden rounded-md border border-dashed border-border bg-surface px-3 py-2 text-[11.5px] leading-relaxed text-text-muted md:block">
            拖动地点名称或“拖到左侧日期”到左边任意日期，即可快速安排；卡片左侧 <span className="font-medium">⠿</span> 只用于调整清单顺序。
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-[13px] text-text-faint">还没有待安排地点，从上方搜索或手动收藏一个开始。</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={filtered.map((place) => place.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {filtered.map((place, index) => {
                    const scheduledItems = scheduledItemsFor(place)
                    const startsScheduledSection = scheduledItems.length > 0 && !filtered.slice(0, index).some(isPlaceScheduled)
                    return (
                      <div key={place.id}>
                        {startsScheduledSection && (
                          <div className="flex items-center gap-2 py-1.5 text-[11.5px] font-medium text-text-faint">
                            <span className="h-px flex-1 bg-border" />
                            已安排到行程
                            <span className="h-px flex-1 bg-border" />
                          </div>
                        )}
                        <SortableWishCard
                          place={place}
                          active={activeId === place.id}
                          scheduledItems={scheduledItems}
                          onActivate={() => setActiveId(place.id)}
                          onRemove={() => removePlace(place.id, place.title, scheduledItems.length > 0)}
                          onFocus={focusActivity}
                          onCancel={(activityId) => cancelSchedule(place, activityId)}
                          onSchedule={() => setSchedulingPlaceId(place.id)}
                        />
                      </div>
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </section>

      <div
        role="separator"
        aria-label="调整地点清单与地图宽度"
        aria-orientation="vertical"
        onPointerDown={startMapResize}
        className="group hidden w-2 shrink-0 cursor-col-resize touch-none items-center justify-center lg:flex"
      >
        <span className="h-10 w-px rounded-full bg-border transition-colors group-hover:bg-accent" />
      </div>
      <aside className="sticky top-0 hidden h-full shrink-0 border-l border-border bg-white p-4 lg:block" style={{ width: mapPanelWidth }}>
        <div className="mb-2 text-[13px] font-semibold">地点分布</div>
        <div className="mb-3 text-[11.5px] text-text-faint">地图标记与清单卡片联动</div>
        {mapped.length > 0 ? (
          <div className="h-[calc(100%-48px)] overflow-hidden rounded-lg border border-border">
            {amapJsKey ? (
              <AmapCanvas apiKey={amapJsKey} markers={amapMarkers} className="h-full w-full" zoom={11} />
            ) : (
            <MapContainer center={points[0]} zoom={11} className="h-full w-full" attributionControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitPlaces points={points} />
              {mapped.map((place) => (
                <Marker key={place.id} position={[place.geo!.lat, place.geo!.lng]} icon={wishMarker(activeId === place.id, place.title)} eventHandlers={{ click: () => setActiveId(place.id) }} />
              ))}
            </MapContainer>
            )}
          </div>
        ) : (
          <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border p-5 text-center text-[12px] leading-relaxed text-text-faint">收藏带坐标的地点后，会在这里看到分布。</div>
        )}
      </aside>

      {schedulingPlace && (
        <ScheduleWishDialog
          place={schedulingPlace}
          initialDayId={useTripStore.getState().activeDayId}
          onClose={() => setSchedulingPlaceId(null)}
        />
      )}
      {showCustomMap && (
        <CustomMapWishDialog
          initialName={searching.trim()}
          initialCategory={manualCategory}
          onSaved={(id) => {
            setActiveId(id)
            setSearching('')
            setResults([])
            setShowCustomMap(false)
          }}
          onClose={() => setShowCustomMap(false)}
        />
      )}
    </div>
  )
}
