import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { activitiesByDay, displayDate, nextActivityTime, useActiveTrip, useTripStore } from '../store'
import { CalendarIcon, CATEGORY_ICONS, OverviewIcon, PinIcon, PlusIcon, TrashIcon, WalletIcon } from './Icons'
import ActivityForm, { activityToFormValues } from './ActivityForm'
import InlineActivityDetail from './ActivityDetail'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'
import { CATEGORY_META, type Activity, type ActivityCategory, type Trip } from '../types'
import { searchPlaces, type GeoResult } from '../api/geocode'
import { fetchWalkingRouteInfo } from '../api/route'
import DayMapPreview from './DayMapPreview'

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

function minutesToTime(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function activityDurationMinutes(activity: Activity) {
  if (activity.durationMinutes && activity.durationMinutes > 0) return activity.durationMinutes
  const hours = activity.duration?.match(/(\d+(?:\.\d+)?)\s*小时/)
  const minutes = activity.duration?.match(/(\d+)\s*分钟/)
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
  return total > 0 ? total : undefined
}

function activityEndMinutes(activity: Activity) {
  if (activity.endTime) {
    const end = timeToMinutes(activity.endTime)
    const start = timeToMinutes(activity.time)
    return end >= start ? end : end + 1440
  }
  const duration = activityDurationMinutes(activity)
  return duration ? timeToMinutes(activity.time) + duration : undefined
}

function scheduleWarnings(items: Activity[]) {
  const warnings = new Map<string, string>()
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1]
    const current = items[index]
    const previousEnd = activityEndMinutes(previous)
    if (previousEnd !== undefined && timeToMinutes(current.time) < previousEnd) {
      warnings.set(current.id, `与「${previous.title}」的时间重叠`)
    }
  }
  return warnings
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)} 小时 ${rest} 分钟` : `${minutes / 60} 小时`
}

function periodLabel(time: string) {
  const hour = Number(time.split(':')[0])
  if (hour < 12) return '上午'
  if (hour < 18) return '下午'
  return '晚上'
}

function TripStatsBar({ trip }: { trip: Trip }) {
  const totalCost = trip.activities.reduce(
    (sum, activity) => sum + activity.costs.reduce((costSum, cost) => costSum + cost.amount, 0),
    0,
  )
  const stats = [
    { label: '天数', value: `${trip.days.length} 天`, Icon: CalendarIcon },
    { label: '安排', value: `${trip.activities.length} 项`, Icon: OverviewIcon },
    { label: '已定位', value: `${trip.activities.filter((activity) => activity.geo).length} 个`, Icon: PinIcon },
    { label: '总花费', value: `¥${totalCost.toLocaleString()}`, Icon: WalletIcon },
  ]

  return (
    <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-white shadow-[0_2px_10px_rgba(45,55,65,0.035)] sm:grid-cols-4 sm:divide-x sm:divide-border">
      {stats.map(({ label, value, Icon }, index) => (
        <div
          key={label}
          className={`flex min-w-0 items-center gap-2.5 px-3 py-2.5 ${index < 2 ? 'border-b border-border sm:border-b-0' : ''} ${index % 2 === 0 ? 'border-r border-border sm:border-r-0' : ''}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-hover">
            <Icon size={14} />
          </span>
          <span className="min-w-0">
            <span className="block text-[10.5px] leading-none text-text-faint">{label}</span>
            <span className="mt-1 block truncate text-[13px] font-semibold leading-none text-text">{value}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function DayOverview({ items }: { items: Activity[] }) {
  const plannedMinutes = items.reduce((total, activity) => total + (activityDurationMinutes(activity) ?? 0), 0)
  const geoItems = useMemo(() => items.filter((activity) => activity.geo), [items])
  const walkingItems = useMemo(
    () => geoItems.filter((activity) => activity.category !== 'traffic'),
    [geoItems],
  )
  const [walking, setWalking] = useState<{ durationMinutes: number | null; distanceMeters: number | null } | null>(null)

  useEffect(() => {
    if (walkingItems.length < 2) return
    const ctrl = new AbortController()
    fetchWalkingRouteInfo(walkingItems.map((activity) => activity.geo!), ctrl.signal).then((result) => {
      if (!ctrl.signal.aborted) {
        setWalking({ durationMinutes: result.durationMinutes, distanceMeters: result.distanceMeters })
      }
    })
    return () => ctrl.abort()
  }, [walkingItems])

  const visibleWalking = walkingItems.length >= 2 ? walking : null

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[11.5px] text-text-faint">
      <span>{items.length} 个安排</span>
      {plannedMinutes > 0 && <span>已安排 {formatMinutes(plannedMinutes)}</span>}
      <span>{geoItems.length} 个已定位地点</span>
      {visibleWalking?.durationMinutes && <span>步行约 {visibleWalking.durationMinutes} 分钟</span>}
      {visibleWalking?.distanceMeters && <span>{(visibleWalking.distanceMeters / 1000).toFixed(visibleWalking.distanceMeters >= 1000 ? 1 : 2)} km</span>}
    </div>
  )
}

function TransitHint({ from, to }: { from: Activity; to: Activity }) {
  const [route, setRoute] = useState<{ durationMinutes: number | null; distanceMeters: number | null } | null>(null)
  const fromGeo = from.geo
  const toGeo = to.geo

  useEffect(() => {
    if (from.category === 'traffic' || to.category === 'traffic' || !fromGeo || !toGeo) return
    const ctrl = new AbortController()
    fetchWalkingRouteInfo([fromGeo, toGeo], ctrl.signal).then((result) => {
      if (!ctrl.signal.aborted) {
        setRoute({ durationMinutes: result.durationMinutes, distanceMeters: result.distanceMeters })
      }
    })
    return () => ctrl.abort()
  }, [from.category, fromGeo, to.category, toGeo])

  if (from.category === 'traffic' || to.category === 'traffic' || !from.geo || !to.geo || !route?.durationMinutes) return null
  const previousEnd = activityEndMinutes(from)
  const available = previousEnd === undefined ? undefined : timeToMinutes(to.time) - previousEnd
  const insufficient = available !== undefined && available >= 0 && available < route.durationMinutes

  return (
    <div className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${insufficient ? 'text-amber-600' : 'text-text-faint'}`}>
      <span>步行约 {route.durationMinutes} 分钟</span>
      {route.distanceMeters && <span>· {(route.distanceMeters / 1000).toFixed(route.distanceMeters >= 1000 ? 1 : 2)} km</span>}
      {insufficient && <span className="font-medium">· 通勤时间不足</span>}
    </div>
  )
}

// 新增行程采用快速录入：先填时间和地点/事项，地点候选被选中后自动写入地址和地图坐标。
// 分类、花费和备注等细节可在添加后从卡片详情继续补充。
function AddActivityForm({ dayId, onDone }: { dayId: string; onDone: () => void }) {
  const addActivity = useTripStore((s) => s.addActivity)
  const removeActivity = useTripStore((s) => s.removeActivity)
  const addWishPlace = useTripStore((s) => s.addWishPlace)
  const selectActivity = useTripStore((s) => s.selectActivity)
  const amapWebServiceKey = useTripStore((s) => s.amapWebServiceKey)
  const trip = useActiveTrip()
  const day = trip.days.find((item) => item.id === dayId)
  const [time, setTime] = useState(() => nextActivityTime(trip, dayId))
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ActivityCategory>('sight')
  const [pickedPlace, setPickedPlace] = useState<GeoResult | null>(null)
  const [results, setResults] = useState<GeoResult[]>([])
  const [resultIndex, setResultIndex] = useState(-1)
  const [searchedQuery, setSearchedQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [duration, setDuration] = useState('')
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const query = title.trim()
    if (pickedPlace && query === pickedPlace.label.split(',')[0]) return
    if (query.length < 2) return
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setLoading(true)
      try {
        setResults(await searchPlaces(query, ctrl.signal, amapWebServiceKey))
        setResultIndex(-1)
        setSearchedQuery(query)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setResults([])
          setSearchedQuery(query)
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 450)
    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [title, pickedPlace, amapWebServiceKey])

  function pickPlace(place: GeoResult) {
    setPickedPlace(place)
    setTitle(place.label.split(',')[0])
    setResults([])
    setResultIndex(-1)
    setSearchedQuery('')
  }

  function savePlace(place: GeoResult) {
    addWishPlace({
      title: place.label.split(',')[0],
      category,
      location: place.label,
      geo: { lat: place.lat, lng: place.lng },
    })
    useToastStore.getState().show('已加入想去清单')
    setResults([])
    setResultIndex(-1)
    setSearchedQuery('')
    setTitle('')
  }

  function submit() {
    if (!title.trim()) return
    const durationMinutes = Number(duration) > 0 ? Math.round(Number(duration)) : undefined
    const id = addActivity({
      dayId,
      time,
      title: title.trim(),
      category,
      location: pickedPlace?.label,
      geo: pickedPlace ? { lat: pickedPlace.lat, lng: pickedPlace.lng } : undefined,
      durationMinutes,
      duration: durationMinutes
        ? durationMinutes % 60 === 0
          ? `${durationMinutes / 60}小时`
          : durationMinutes > 60
            ? `${Math.floor(durationMinutes / 60)}小时${durationMinutes % 60}分钟`
            : `${durationMinutes}分钟`
        : undefined,
      endTime: durationMinutes
        ? minutesToTime(timeToMinutes(time) + durationMinutes)
        : undefined,
      note: note.trim() || undefined,
      costs: cost !== '' ? [{ id: `cost-${crypto.randomUUID()}`, amount: Number(cost) }] : [],
    })
    selectActivity(id)
    useToastStore.getState().show(
      `已添加到${day?.label ?? '当前天'} · ${time}`,
      { undo: () => removeActivity(id) },
    )
    onDone()
  }

  return (
    <div className="rounded-lg border border-dashed border-accent/50 bg-white p-3 sm:p-3.5">
      <div className="flex flex-wrap gap-2">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-[96px] rounded-md border border-border px-2.5 py-2 text-[13px] tabular-nums outline-none focus:border-accent sm:w-[104px]"
        />
        <div className="relative min-w-[170px] flex-1 sm:min-w-[220px]">
          <input
            value={title}
            onChange={(e) => {
              setPickedPlace(null)
              setTitle(e.target.value)
              setSearchedQuery('')
              if (e.target.value.trim().length < 2) {
                setResults([])
                setResultIndex(-1)
                setSearchedQuery('')
                setLoading(false)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && results.length > 0) {
                e.preventDefault()
                setResultIndex((index) => Math.min(index + 1, results.length - 1))
              } else if (e.key === 'ArrowUp' && results.length > 0) {
                e.preventDefault()
                setResultIndex((index) => Math.max(index - 1, -1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (resultIndex >= 0) pickPlace(results[resultIndex])
                else submit()
              } else if (e.key === 'Escape') {
                setResults([])
                setResultIndex(-1)
              }
            }}
            placeholder="搜索地点，或直接输入安排"
            className="w-full rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-accent"
          />
          {loading && <span className="absolute top-2.5 right-3 text-[11px] text-text-faint">搜索中…</span>}
          {results.length > 0 && (
            <ul className="absolute top-full left-0 z-20 mt-1 max-h-[220px] w-full overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-lg">
              {results.map((place) => (
                <li key={`${place.lat},${place.lng}`} className={`flex items-center gap-2 px-1.5 py-1 ${results[resultIndex] === place ? 'bg-accent-soft' : 'hover:bg-accent-soft'}`}>
                  <button onClick={() => pickPlace(place)} onMouseEnter={() => setResultIndex(results.indexOf(place))} className="min-w-0 flex-1 px-1.5 py-1 text-left">
                    <div className="truncate text-[12.5px] font-medium">{place.label.split(',')[0]}</div>
                    <div className="mt-0.5 truncate text-[11px] text-text-faint">{place.label}</div>
                  </button>
                  <button
                    onClick={() => savePlace(place)}
                    className="shrink-0 rounded border border-border px-2 py-1 text-[11px] text-text-muted hover:border-accent hover:text-accent"
                  >
                    收藏
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && searchedQuery === title.trim() && searchedQuery.length >= 2 && results.length === 0 && !pickedPlace && (
            <div className="absolute top-full left-0 z-20 mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[11.5px] text-text-muted shadow-lg">
              没有找到匹配地点，仍可按 Enter 作为普通安排添加。
            </div>
          )}
        </div>
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          添加
        </button>
        <button
          onClick={() => setShowOptions((show) => !show)}
          className={`rounded-md px-2.5 py-2 text-[12px] transition-colors ${showOptions ? 'bg-accent-soft text-accent-hover' : 'text-text-muted hover:bg-surface'}`}
        >
          {showOptions ? '收起' : '更多信息'}
        </button>
        <button onClick={onDone} className="rounded-md px-2.5 py-2 text-[13px] text-text-muted hover:bg-surface">
          清空
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <span className="mr-0.5 text-[11.5px] text-text-faint">分类</span>
        {(Object.keys(CATEGORY_META) as ActivityCategory[]).map((value) => {
          const active = category === value
          const meta = CATEGORY_META[value]
          const Icon = CATEGORY_ICONS[value]
          return (
            <button
              key={value}
              onClick={() => setCategory(value)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px]"
              style={{ background: active ? meta.soft : 'transparent', color: active ? meta.color : 'var(--color-text-muted)' }}
            >
              <Icon size={12} /> {meta.label}
            </button>
          )
        })}
        {pickedPlace && (
          <span className="ml-auto max-w-[280px] truncate rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent-hover" title={pickedPlace.label}>
            ✓ 已定位 · {pickedPlace.label}
          </span>
        )}
      </div>
      {showOptions && (
        <div className="mt-2 grid gap-2 border-t border-border pt-2 sm:grid-cols-[150px_140px_1fr]">
          <label className="relative">
            <input
              value={duration}
              onChange={(event) => setDuration(event.target.value.replace(/[^\d]/g, ''))}
              placeholder="预计时长"
              inputMode="numeric"
              aria-label="预计时长"
              className="w-full rounded-md border border-border px-2.5 py-1.5 pr-9 text-[12.5px] outline-none focus:border-accent"
            />
            <span className="absolute top-1.5 right-2.5 text-[11.5px] text-text-faint">分钟</span>
          </label>
          <input
            value={cost}
            onChange={(event) => setCost(event.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
            placeholder="花费 ¥"
            inputMode="decimal"
            aria-label="花费"
            className="rounded-md border border-border px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent"
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
            placeholder="备注（选填）"
            aria-label="备注"
            className="rounded-md border border-border px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent"
          />
        </div>
      )}
    </div>
  )
}

// 编辑行程表单：内嵌在时间轴中（与新增同构），保存时合并首笔花费。
// 切换天/视图导致表单被卸载时，自动暂存草稿，回来继续编辑时恢复。
function EditActivityForm({ activity, onDone }: { activity: Activity; onDone: () => void }) {
  const updateActivity = useTripStore((s) => s.updateActivity)
  const saveDraft = useTripStore((s) => s.saveActivityDraft)
  // 恢复属于当前条目的草稿
  const draft = useTripStore((s) => (s.activityDraft?.activityId === activity.id ? s.activityDraft : null))
  return (
    <div className="rounded-lg border border-accent/50 bg-white p-3.5 shadow-[0_2px_8px_rgba(49,92,125,0.12)]">
      <ActivityForm
        initial={draft ? { ...activityToFormValues(activity), ...draft.values } : activityToFormValues(activity)}
        submitLabel="保存"
        onSubmit={(v) => {
          const costs = [...activity.costs]
          if (costs.length > 0) {
            if (v.firstCost != null) costs[0] = { ...costs[0], amount: v.firstCost }
            else costs.shift() // 清空首笔花费 = 删除首笔
          } else if (v.firstCost != null) {
            costs.push({ id: `c${Date.now()}`, amount: v.firstCost })
          }
          updateActivity(activity.id, {
            time: v.time,
            title: v.title,
            category: v.category,
            location: v.location,
            duration: v.duration,
            durationMinutes: v.durationMinutes,
            endTime: v.endTime,
            note: v.note,
            geo: v.geo,
            costs,
          })
          saveDraft(null)
          onDone()
        }}
        onCancel={onDone}
        onDraftChange={(values) => saveDraft({ activityId: activity.id, values })}
      />
    </div>
  )
}


// 单条行程卡片：主体可点击展开详情，右侧删除按钮
function ActivityCard({
  activity,
  selected,
  onClick,
  warning,
}: {
  activity: Activity
  selected: boolean
  onClick: () => void
  warning?: string
}) {
  const meta = CATEGORY_META[activity.category]
  const Icon = CATEGORY_ICONS[activity.category]
  const removeActivity = useTripStore((s) => s.removeActivity)
  const askConfirm = useConfirmStore((s) => s.ask)
  return (
    <div
      className={`relative flex min-w-0 w-full items-center gap-2 rounded-lg border bg-white py-3 pr-2 pl-3.5 transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${
        selected ? 'border-accent shadow-[0_2px_8px_rgba(49,92,125,0.12)]' : 'border-border'
      }`}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: meta.soft, color: meta.color }}
      >
        <Icon size={16} />
      </div>
      {/* 可点击主体（展开/收起详情） */}
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium">{activity.title}</div>
          <div className="mt-0.5 flex items-center gap-3 text-[12px] text-text-muted">
            {activity.duration && <span>{activity.duration}</span>}
            {activity.location && <span className="truncate">{activity.location}</span>}
          </div>
        </div>
        {activity.costs.length > 0 && (
          <span className="shrink-0 text-[12px] text-text-muted">
            ¥{activity.costs.reduce((s, c) => s + c.amount, 0).toLocaleString()}
          </span>
        )}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          askConfirm({
            title: `删除安排「${activity.title}」？`,
            message: '该安排及其中记录的花费都会被删除。',
            onConfirm: () => {
              const { trips, activeTripId } = useTripStore.getState()
              removeActivity(activity.id)
              useToastStore.getState().show(`已删除安排「${activity.title}」`, {
                undo: () => useTripStore.getState().restoreTrips(trips, activeTripId),
              })
            },
          })
        }}
        className="shrink-0 rounded-md p-1.5 text-text-faint transition-colors hover:bg-red-50 hover:text-red-500"
        title="删除安排"
      >
        <TrashIcon size={14} />
      </button>
      {warning && (
        <div className="absolute top-full left-0 mt-1 text-[11px] text-amber-600">⚠ {warning}</div>
      )}
    </div>
  )
}

// 可拖拽的条目
function SortableActivity({
  activity,
  selected,
  onClick,
  warning,
}: {
  activity: Activity
  selected: boolean
  onClick: () => void
  warning?: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
    data: { type: 'activity', dayId: activity.dayId },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`min-w-0 ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
    >
      <ActivityCard activity={activity} selected={selected} onClick={onClick} warning={warning} />
    </div>
  )
}

// 天标题：日期/地点点击可编辑；修改任意一天的日期会连续顺延后续天。
function DayHeaderInfo({ day }: { day: { id: string; date: string; place: string } }) {
  const updateDay = useTripStore((s) => s.updateDay)
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(day.date)
  const [place, setPlace] = useState(day.place)

  const isStd = /^\d{4}-\d{2}-\d{2}$/.test(day.date)

  if (!editing) {
    const showDate = day.date && day.date !== '待定'
    const showPlace = day.place && day.place !== '待定'
    return (
      <button
        onClick={() => {
          setDate(isStd ? day.date : '')
          setPlace(day.place === '待定' ? '' : day.place)
          setEditing(true)
        }}
        className="flex items-center gap-2 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-surface"
        title="点击编辑日期/地点"
      >
        {showDate && (
          <span className="text-[12.5px] text-text-muted">{isStd ? displayDate(day.date) : day.date}</span>
        )}
        {showPlace && (
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-hover">
            {day.place}
          </span>
        )}
        {!showDate && !showPlace && <span className="text-[12px] text-text-faint">＋ 设置日期 / 地点</span>}
      </button>
    )
  }

  function commit() {
    const dateChanged = date.trim() && date.trim() !== day.date
    updateDay(day.id, {
      date: date.trim() || '待定',
      place: place.trim(),
    })
    if (dateChanged) {
      useToastStore.getState().show('日期已更新，后续日期已自动顺延')
    }
    setEditing(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        autoFocus
        type="date"
        value={isStd ? date : ''}
        onChange={(e) => setDate(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="rounded border border-accent px-1.5 py-0.5 text-[12px] outline-none"
      />
      <input
        value={place}
        onChange={(e) => setPlace(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        placeholder="地点，如 大阪"
        className="w-[90px] rounded border border-accent px-1.5 py-0.5 text-[12px] outline-none"
      />
      <button
        onClick={commit}
        className="rounded bg-accent px-2 py-0.5 text-[11.5px] text-white transition-colors hover:bg-accent-hover"
      >
        保存
      </button>
      <span className="text-[10.5px] text-text-faint">修改日期后，后续天会自动顺延</span>
    </div>
  )
}

// 一天的分组
function DaySection({ dayId, onQuickAdd }: { dayId: string; onQuickAdd: () => void }) {
  const { activeDayId, selectedActivityId, selectActivity, editingActivityId, setEditingActivity, removeDay, addDay } =
    useTripStore()
  const askConfirm = useConfirmStore((s) => s.ask)
  const trip = useActiveTrip()
  const day = trip.days.find((d) => d.id === dayId)!
  const items = activitiesByDay(trip, dayId)
  const warnings = scheduleWarnings(items)
  const { setNodeRef, isOver } = useDroppable({ id: dayId, data: { type: 'day', dayId } })

  // 展开逻辑：非当前天折叠显示摘要
  const isActiveDay = dayId === activeDayId

  if (!isActiveDay) {
    // 折叠摘要行也是拖拽落点，可直接把项目拖到另一天
    return (
      <button
        ref={setNodeRef}
        onClick={() => useTripStore.getState().setActiveDay(dayId)}
        className={`mb-3 flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
          isOver ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2'
        }`}
      >
        <div className="text-[13px] font-semibold">{day.label}</div>
        <div className="text-[12px] text-text-faint">
          {day.date && day.date !== '待定'
            ? /^\d{4}-\d{2}-\d{2}$/.test(day.date)
              ? displayDate(day.date)
              : day.date
            : ''}
        </div>
        <div className="ml-auto text-[12px] text-text-muted">{items.length} 个安排</div>
      </button>
    )
  }

  return (
      <section ref={setNodeRef} className={`mb-6 rounded-lg transition-colors ${isOver ? 'bg-accent-soft/30' : ''}`}>
        {/* 天标题 */}
        <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-0.5">
          <h2 className="text-[16px] font-semibold">{day.label}</h2>
          <DayHeaderInfo day={day} />
          {trip.days.length > 1 && (
            <div className="flex w-full items-center justify-end gap-1 sm:ml-auto sm:w-auto">
              <button
                onClick={() => {
                  addDay(dayId)
                  const insertedDay = useTripStore.getState().trips
                    .find((item) => item.id === trip.id)
                    ?.days.find((item) => item.id === useTripStore.getState().activeDayId)
                  useToastStore.getState().show(
                    insertedDay?.date && insertedDay.date !== '待定'
                      ? `已插入${insertedDay.label} · ${displayDate(insertedDay.date)}，后续日期已顺延`
                      : `已在${day.label}后插入一天`,
                  )
                }}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-text-faint transition-colors hover:bg-accent-soft hover:text-accent"
                title="在这天后插入一天"
              >
                <PlusIcon size={13} /> 插入一天
              </button>
              <button
                onClick={() =>
                  askConfirm({
                  title: `删除${day.label}？`,
                  message: `该天全部 ${items.length} 个安排及其花费将一并删除，后续天数编号自动前移。`,
                  onConfirm: () => {
                    const { trips, activeTripId } = useTripStore.getState()
                    removeDay(dayId)
                    useToastStore.getState().show(`已删除${day.label}（含 ${items.length} 个安排）`, {
                      undo: () => useTripStore.getState().restoreTrips(trips, activeTripId),
                    })
                  },
                })
                }
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-text-faint transition-colors hover:bg-red-50 hover:text-red-500"
                title="删除该天"
              >
                <TrashIcon size={13} /> 删除该天
              </button>
            </div>
          )}
        </header>

        <DayOverview items={items} />

        {/* 时间轴 */}
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="relative pl-[44px] sm:pl-[52px]">
            {/* 竖线 */}
            <div className="absolute top-2 bottom-2 left-[64px] w-px bg-border sm:left-[76px]" />
            <div className="flex flex-col gap-2.5">
              {items.map((a, index) => (
                <div key={a.id} className="relative flex min-w-0 items-start gap-2 sm:gap-3" data-activity-id={a.id}>
                  {(!items[index - 1] || periodLabel(items[index - 1].time) !== periodLabel(a.time)) && (
                    <div className="absolute -left-[43px] mt-0.5 w-[35px] text-right text-[10px] font-medium text-text-faint sm:-left-[51px] sm:w-[42px] sm:text-[10.5px]">
                      {periodLabel(a.time)}
                    </div>
                  )}
                  <div className="w-[40px] shrink-0 pt-3 text-right text-[11px] font-medium tabular-nums text-text-muted sm:w-[48px] sm:text-[12px]">
                    {a.time}
                  </div>
                  <div className="relative min-w-0 flex-1">
                    {/* 时间轴圆点 */}
                    <div className="absolute top-[18px] -left-[6px] h-[9px] w-[9px] rounded-full border-2 border-white bg-accent" />
                    <SortableActivity
                      activity={a}
                      selected={selectedActivityId === a.id}
                      onClick={() => selectActivity(selectedActivityId === a.id ? null : a.id)}
                      warning={warnings.get(a.id)}
                    />
                    {/* 小屏幕没有右侧栏时，保留内嵌详情与编辑作为降级交互。 */}
                    {editingActivityId === a.id && (
                      <div className="mt-2 lg:hidden">
                        <EditActivityForm
                          activity={a}
                          onDone={() => {
                            setEditingActivity(null)
                            selectActivity(a.id)
                          }}
                        />
                      </div>
                    )}
                    {selectedActivityId === a.id && editingActivityId !== a.id && (
                      <div className="mt-2 lg:hidden">
                        <InlineActivityDetail activity={a} />
                      </div>
                    )}
                    {items[index + 1] && <TransitHint from={a} to={items[index + 1]} />}
                  </div>
                </div>
              ))}
              <button
                onClick={onQuickAdd}
                className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-2.5 text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <PlusIcon size={15} /> 在这里添加安排
              </button>
            </div>
          </div>
        </SortableContext>
      </section>
  )
}

function PlannerInspector({
  dayId,
  selectedActivityId,
  editingActivityId,
}: {
  dayId: string
  selectedActivityId: string | null
  editingActivityId: string | null
}) {
  const trip = useActiveTrip()
  const { selectActivity, setEditingActivity } = useTripStore()
  const day = trip.days.find((item) => item.id === dayId)
  const activityId = editingActivityId ?? selectedActivityId
  const activity = trip.activities.find((item) => item.id === activityId)

  return (
    <aside className="sticky top-0 hidden h-[calc(100vh-44px)] w-[clamp(380px,32vw,520px)] shrink-0 overflow-y-auto border-l border-border bg-white lg:block">
      <div className="border-b border-border p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold">{day?.label} 地图</div>
            <div className="mt-0.5 text-[11.5px] text-text-faint">点击标记可定位行程</div>
          </div>
          <button
            onClick={() => selectActivity(null)}
            className="rounded px-1.5 py-1 text-[11.5px] text-text-muted hover:bg-surface"
          >
            收起详情
          </button>
        </div>
        <DayMapPreview dayId={dayId} selectedActivityId={activityId ?? null} />
      </div>
      <div className="p-4">
        {activity ? (
          editingActivityId === activity.id ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[13px] font-semibold">编辑安排</div>
                <button
                  onClick={() => setEditingActivity(null)}
                  className="text-[12px] text-text-muted hover:text-text"
                >
                  取消
                </button>
              </div>
              <EditActivityForm
                activity={activity}
                onDone={() => {
                  setEditingActivity(null)
                  selectActivity(activity.id)
                }}
              />
            </>
          ) : (
            <InlineActivityDetail activity={activity} />
          )
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center">
            <div className="text-[13px] font-medium text-text-muted">选择一个安排查看详情</div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">
              花费、备注、时长和地点都在这里补充，时间轴会保持简洁。
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}

function MobileDayStrip({ trip }: { trip: Trip }) {
  const { activeDayId, setActiveDay, selectActivity, addDay } = useTripStore()

  function appendDay() {
    const previousLastDay = trip.days.at(-1)
    addDay()
    const updatedTrip = useTripStore.getState().trips.find((item) => item.id === trip.id)
    const newDay = updatedTrip?.days.at(-1)
    useToastStore.getState().show(
      newDay?.date && newDay.date !== '待定'
        ? `已在${previousLastDay?.label ?? '最后一天'}后添加 ${displayDate(newDay.date)}`
        : '已添加一天，可继续设置日期和地点',
    )
  }

  return (
    <div className="-mx-3 mb-4 flex items-stretch gap-2 overflow-x-auto px-3 pb-1 sm:hidden">
      {trip.days.map((day) => {
        const active = day.id === activeDayId
        return (
          <button
            key={day.id}
            onClick={() => {
              setActiveDay(day.id)
              selectActivity(null)
            }}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
              active
                ? 'border-accent bg-accent text-white shadow-[0_2px_8px_rgba(49,92,125,0.18)]'
                : 'border-border bg-white text-text-muted'
            }`}
          >
            <span className="block text-[12px] font-semibold">{day.label}</span>
            <span className={`mt-0.5 block max-w-[84px] truncate text-[10.5px] ${active ? 'text-white/75' : 'text-text-faint'}`}>
              {day.place || (day.date !== '待定' ? displayDate(day.date).split(' ')[0] : '待安排')}
            </span>
          </button>
        )
      })}
      <button
        onClick={appendDay}
        className="flex min-w-[68px] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white px-2 py-2 text-[11px] text-text-muted active:border-accent active:text-accent"
      >
        <PlusIcon size={15} />
        <span className="mt-0.5">加一天</span>
      </button>
    </div>
  )
}

export default function TimelineView() {
  const trip = useActiveTrip()
  const { selectedActivityId, editingActivityId, activeDayId, reorderActivity, setPlanTab } = useTripStore()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [quickAddKey, setQuickAddKey] = useState(0)
  const [mobileQuickAddOpen, setMobileQuickAddOpen] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const draggingActivity = trip.activities.find((activity) => activity.id === draggingId)
  const activeDay = trip.days.find((day) => day.id === activeDayId)

  function onDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id))
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const overData = over.data.current as { type?: string; dayId?: string } | undefined
    const targetDayId = overData?.dayId
    if (!targetDayId) return
    const targetItems = activitiesByDay(trip, targetDayId)
    const insertIndex = overData?.type === 'activity'
      ? targetItems.findIndex((activity) => activity.id === over.id)
      : targetItems.length
    reorderActivity(String(active.id), targetDayId, insertIndex < 0 ? targetItems.length : insertIndex)
  }

  function focusQuickAdd() {
    if (window.matchMedia('(max-width: 639px)').matches) {
      setMobileQuickAddOpen(true)
      return
    }
    document.querySelector<HTMLInputElement>('[data-quick-add] input:not([type="time"])')?.focus()
  }

  useEffect(() => {
    if (!mobileQuickAddOpen) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileQuickAddOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileQuickAddOpen])

  // 不打断表单输入：在非输入区域按 /，可随时开始记录一个安排。
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === '/') {
        event.preventDefault()
        focusQuickAdd()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  // 从地图/预算跳转过来时，滚动到对应条目
  useEffect(() => {
    if (!selectedActivityId) return
    document
      .querySelector(`[data-activity-id="${selectedActivityId}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedActivityId])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragCancel={() => setDraggingId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex min-h-full min-w-0">
        <div className="min-w-0 flex-1">
          <div className="mr-auto max-w-[900px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <MobileDayStrip trip={trip} />
            <TripStatsBar trip={trip} />
            {/* 空旅程引导：还没有任何行程时给出第一步指引 */}
            {trip.activities.length === 0 && (
              <div className="mb-6 rounded-xl border border-accent/30 bg-[linear-gradient(135deg,rgba(232,239,248,0.92),rgba(248,250,253,0.96))] px-5 py-5 sm:px-6 sm:py-6">
                <div className="text-[15px] font-semibold text-accent-hover">从一个地点开始，行程会自然成形</div>
                <p className="mt-1.5 max-w-[480px] text-[13px] leading-relaxed text-text-muted">
                  不需要一次填完所有信息。先记下要去哪里，再逐步补充时间、花费和备注。
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <button onClick={focusQuickAdd} className="rounded-lg border border-accent/30 bg-white px-3 py-2.5 text-left transition-colors hover:border-accent hover:shadow-[0_2px_8px_rgba(49,92,125,0.10)]">
                    <span className="text-[11px] font-semibold text-accent">01</span>
                    <span className="mt-0.5 block text-[12.5px] font-medium">添加第一个安排</span>
                    <span className="mt-0.5 block text-[11px] text-text-faint">直接输入地点或事项</span>
                  </button>
                  <button onClick={() => setPlanTab('places')} className="rounded-lg border border-border bg-white px-3 py-2.5 text-left transition-colors hover:border-accent hover:shadow-[0_2px_8px_rgba(49,92,125,0.10)]">
                    <span className="text-[11px] font-semibold text-text-muted">02</span>
                    <span className="mt-0.5 block text-[12.5px] font-medium">先收集想去的地点</span>
                    <span className="mt-0.5 block text-[11px] text-text-faint">日期暂未确定也没关系</span>
                  </button>
                  <div className="rounded-lg border border-border/80 bg-white/70 px-3 py-2.5">
                    <span className="text-[11px] font-semibold text-text-muted">03</span>
                    <span className="mt-0.5 block text-[12.5px] font-medium">再补充细节</span>
                    <span className="mt-0.5 block text-[11px] text-text-faint">点击条目即可编辑时长与花费</span>
                  </div>
                </div>
              </div>
            )}
            {trip.days.map((d) => (
              <DaySection key={d.id} dayId={d.id} onQuickAdd={focusQuickAdd} />
            ))}
          </div>
          <div data-quick-add className="sticky bottom-0 z-20 hidden border-t border-border bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] backdrop-blur sm:block lg:px-8">
            <div className="mr-auto max-w-[900px]">
              <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-medium text-text-faint">
                <span>
                  快速添加到 {activeDay?.label ?? '当前天'}
                  {activeDay?.place ? ` · ${activeDay.place}` : ''}
                </span>
                <span className="hidden rounded border border-border bg-white px-1.5 py-0.5 text-[10.5px] font-normal sm:inline">按 / 快速输入</span>
              </div>
              <AddActivityForm key={`${activeDayId}-${quickAddKey}`} dayId={activeDayId} onDone={() => setQuickAddKey((key) => key + 1)} />
            </div>
          </div>
          <div className="sticky bottom-0 z-20 border-t border-border bg-white/95 px-3 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] backdrop-blur sm:hidden">
            <button
              onClick={() => setMobileQuickAddOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-[13px] font-medium text-white shadow-[0_3px_10px_rgba(49,92,125,0.2)] active:bg-accent-hover"
            >
              <PlusIcon size={16} />
              添加到 {activeDay?.label ?? '当前天'}{activeDay?.place ? ` · ${activeDay.place}` : ''}
            </button>
          </div>
        </div>
        <PlannerInspector
          dayId={activeDayId}
          selectedActivityId={selectedActivityId}
          editingActivityId={editingActivityId}
        />
      </div>
      <DragOverlay>
        {draggingActivity && (
          <div className="w-[520px] rotate-1 opacity-90 shadow-lg">
            <ActivityCard activity={draggingActivity} selected={false} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>
      {mobileQuickAddOpen && (
        <div className="fixed inset-0 z-[700] flex items-end bg-black/30 sm:hidden" role="dialog" aria-modal="true" aria-label="新增安排">
          <button className="absolute inset-0" onClick={() => setMobileQuickAddOpen(false)} aria-label="关闭新增安排" />
          <div className="mobile-safe-bottom relative max-h-[84vh] w-full overflow-y-auto rounded-t-[22px] bg-[#fbfcfe] px-4 pt-3 shadow-[0_-12px_36px_rgba(15,23,42,0.18)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[16px] font-semibold">新增安排</div>
                <div className="mt-0.5 text-[11.5px] text-text-muted">
                  {activeDay?.label ?? '当前天'}{activeDay?.place ? ` · ${activeDay.place}` : ''}
                </div>
              </div>
              <button
                onClick={() => setMobileQuickAddOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-[20px] leading-none text-text-muted"
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <AddActivityForm
              key={`mobile-${activeDayId}-${quickAddKey}`}
              dayId={activeDayId}
              onDone={() => {
                setQuickAddKey((key) => key + 1)
                setMobileQuickAddOpen(false)
              }}
            />
          </div>
        </div>
      )}
    </DndContext>
  )
}
