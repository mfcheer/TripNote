import { useEffect, useMemo, useRef, useState } from 'react'
import { searchPlaces, splitPlaceResults, tripSearchContext, type GeoResult } from '../api/geocode'
import { displayDate, nextActivityTime, useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS, ClockIcon, MapIcon, TrashIcon } from './Icons'
import ModalShell, { overlayPrimaryButtonClass } from './OverlayShell'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'
import { CustomMapWishDialog } from './WishlistView'
import { CATEGORY_META, type ActivityCategory, type WishPlace } from '../types'
import type { Activity } from '../types'
import { straightLineDistanceMeters } from '../api/route'

function timeMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function endMinutes(activity: Activity) {
  const start = timeMinutes(activity.time)
  if (activity.endTime) {
    const end = timeMinutes(activity.endTime)
    return end < start ? end + 1440 : end
  }
  const hours = activity.duration?.match(/(\d+(?:\.\d+)?)\s*小时/)
  const minutes = activity.duration?.match(/(\d+)\s*分钟/)
  const duration = activity.durationMinutes || (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
  return duration > 0 ? start + duration : undefined
}

function clockTime(minutes: number) {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function scheduledIds(place: WishPlace) {
  return [...(place.scheduledActivityIds ?? []), ...(place.scheduledActivityId ? [place.scheduledActivityId] : [])]
}

function compactDate(date: string) {
  return displayDate(date).replace(/\s+周.*/, '')
}

function suggestedTime(trip: ReturnType<typeof useActiveTrip>, dayId: string) {
  const value = nextActivityTime(trip, dayId)
  // 当上一条安排跨到凌晨时，默认回到早间而非展示 00:00；用户仍可自行改成夜间时间。
  return value < '06:00' ? '09:00' : value
}

// 手机端唯一的地点库：检索、收藏、地图选点、删除和安排均留在一个底部抽屉里。
export default function MobileWishSheet({ onClose }: { onClose: () => void }) {
  const trip = useActiveTrip()
  const {
    activeDayId, amapWebServiceKey, placeSearchProvider, addWishPlace, removeWishPlace, restoreTrips,
    scheduleWishPlace, cancelWishSchedule, setActiveDay, selectActivity,
  } = useTripStore()
  const askConfirm = useConfirmStore((state) => state.ask)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [targetDayId, setTargetDayId] = useState(() => activeDayId || trip.days[0]?.id || '')
  const [time, setTime] = useState(() => suggestedTime(trip, activeDayId || trip.days[0]?.id || ''))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'empty' | 'results'>('idle')
  const [category, setCategory] = useState<ActivityCategory>('sight')
  const [showCustomMap, setShowCustomMap] = useState(false)
  const assignmentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedPlaceId) return
    const frame = window.requestAnimationFrame(() => assignmentRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }))
    return () => window.cancelAnimationFrame(frame)
  }, [selectedPlaceId])

  const scheduledItemsFor = (place: WishPlace) => Array.from(new Set(scheduledIds(place)))
    .map((id) => trip.activities.find((activity) => activity.id === id))
    .filter((activity): activity is NonNullable<typeof activity> => !!activity)
    .map((activity) => ({ id: activity.id, time: activity.time, day: trip.days.find((day) => day.id === activity.dayId) }))
    .sort((a, b) => (trip.days.findIndex((day) => day.id === a.day?.id) - trip.days.findIndex((day) => day.id === b.day?.id)) || a.time.localeCompare(b.time))

  const places = useMemo(() => [...trip.wishPlaces].sort((a, b) => Number(scheduledItemsFor(a).length > 0) - Number(scheduledItemsFor(b).length > 0)), [trip.activities, trip.wishPlaces])
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? null
  const targetDay = trip.days.find((day) => day.id === targetDayId) ?? trip.days[0]
  const targetActivities = trip.activities.filter((activity) => activity.dayId === targetDay?.id).sort((a, b) => a.time.localeCompare(b.time))
  const chosenMinutes = timeMinutes(time)
  const overlapping = targetActivities.find((activity) => chosenMinutes === timeMinutes(activity.time)
    || (chosenMinutes > timeMinutes(activity.time) && chosenMinutes < (endMinutes(activity) ?? timeMinutes(activity.time))))
  const previousActivity = [...targetActivities].reverse().find((activity) => timeMinutes(activity.time) <= chosenMinutes)
  const nextActivity = targetActivities.find((activity) => timeMinutes(activity.time) > chosenMinutes)
  const referenceDistances = selectedPlace?.geo ? [previousActivity, nextActivity].flatMap((activity) => activity?.geo
    ? [{ title: activity.title, meters: straightLineDistanceMeters(activity.geo, selectedPlace.geo!) }] : []) : []
  const unscheduledCount = places.filter((place) => scheduledItemsFor(place).length === 0).length
  const groupedResults = splitPlaceResults(results)

  useEffect(() => {
    const keyword = query.trim()
    if (keyword.length < 2) {
      setResults([])
      setSearchStatus('idle')
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setSearchStatus('loading')
        const next = await searchPlaces(keyword, controller.signal, amapWebServiceKey, placeSearchProvider, tripSearchContext(trip))
        if (controller.signal.aborted) return
        setResults(next)
        setSearchStatus(next.length ? 'results' : 'empty')
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setResults([])
          setSearchStatus('empty')
        }
      }
    }, 350)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [amapWebServiceKey, placeSearchProvider, query, trip])

  function clearAdd() {
    setQuery('')
    setResults([])
    setSearchStatus('idle')
  }

  function choosePlace(placeId: string) {
    if (placeId === selectedPlaceId) return setSelectedPlaceId(null)
    const dayId = targetDay?.id || activeDayId || trip.days[0]?.id || ''
    setTargetDayId(dayId)
    setTime(suggestedTime(trip, dayId))
    setSelectedPlaceId(placeId)
  }

  function chooseDay(dayId: string) {
    setTargetDayId(dayId)
    setTime(suggestedTime(trip, dayId))
  }

  function addFromResult(result: GeoResult) {
    const title = result.label.split(',')[0]
    const id = addWishPlace({ title, category, location: result.label, geo: { lat: result.lat, lng: result.lng } })
    setSelectedPlaceId(id)
    clearAdd()
    useToastStore.getState().show(`已收藏「${title}」`)
  }

  function addManual() {
    const title = query.trim()
    if (!title) return
    const id = addWishPlace({ title, category })
    setSelectedPlaceId(id)
    clearAdd()
    useToastStore.getState().show(`已收藏「${title}」`)
  }

  function removePlace(place: WishPlace) {
    const remove = () => {
      const { trips, activeTripId } = useTripStore.getState()
      removeWishPlace(place.id)
      setSelectedPlaceId((id) => id === place.id ? null : id)
      useToastStore.getState().show(`已从想去移出「${place.title}」`, { undo: () => restoreTrips(trips, activeTripId) })
    }
    if (scheduledItemsFor(place).length) {
      askConfirm({ title: `从想去移出「${place.title}」？`, message: '已排好的行程和花费会保留，只移除这个收藏地点。', danger: false, onConfirm: remove })
    } else remove()
  }

  function cancelAssignment(place: WishPlace, activityId: string) {
    askConfirm({
      title: `取消「${place.title}」的这次安排？`,
      message: '该行程条目会被删除，地点会继续留在想去中。',
      onConfirm: () => {
        const { trips, activeTripId } = useTripStore.getState()
        cancelWishSchedule(place.id, activityId)
        useToastStore.getState().show(`已取消「${place.title}」的安排`, { undo: () => restoreTrips(trips, activeTripId) })
      },
    })
  }

  function confirmAssignment() {
    if (!selectedPlace || !targetDay) return
    const activityId = scheduleWishPlace(selectedPlace.id, targetDay.id, {
      time, title: selectedPlace.title, category: selectedPlace.category, location: selectedPlace.location, note: selectedPlace.note, geo: selectedPlace.geo,
    })
    if (!activityId) return
    setActiveDay(targetDay.id)
    selectActivity(activityId)
    setTime(suggestedTime(useTripStore.getState().trips.find((item) => item.id === trip.id) ?? trip, targetDay.id))
    useToastStore.getState().show(`已安排「${selectedPlace.title}」到 ${targetDay.label} · ${time}`, {
      undo: () => {
        cancelWishSchedule(selectedPlace.id, activityId)
        useToastStore.getState().show(`已撤销「${selectedPlace.title}」的安排`, { tone: 'neutral' })
      },
    })
  }

  return (
    <>
      <ModalShell
        title={<><span>想去</span><span className="ml-2 text-text-muted">{places.length}</span></>}
        description={`待安排 ${unscheduledCount} · 已安排 ${places.length - unscheduledCount}`}
        onClose={onClose}
        size="md"
        bodyClassName="pt-2.5 pb-5"
      >
        <div className="mb-2 text-[11.5px] text-text-faint">搜索、收藏或选择一个地点安排到行程</div>
        <div className="relative mb-3 rounded-xl border border-border/80 bg-surface p-2.5">
          <div className="flex gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addManual()} placeholder="搜索或直接输入地点名称" aria-label="搜索并收藏新地点" className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-[16px] outline-none focus:border-accent sm:text-[13px]" />
            <button type="button" onClick={addManual} disabled={!query.trim()} className={`${overlayPrimaryButtonClass} min-h-9 shrink-0 px-3 text-[12px]`}>收藏</button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select value={category} onChange={(event) => setCategory(event.target.value as ActivityCategory)} className="min-w-0 flex-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11.5px] text-text-muted outline-none focus:border-accent">{(Object.keys(CATEGORY_META) as ActivityCategory[]).map((value) => <option key={value} value={value}>{CATEGORY_META[value].label}</option>)}</select>
            <button type="button" onClick={() => setShowCustomMap(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-text-muted hover:border-accent hover:text-accent"><MapIcon size={13} /> 地图选点</button>
          </div>
          {searchStatus === 'loading' && <div className="mt-2 text-[11px] text-text-faint">正在搜索…</div>}
          {results.length > 0 && <div className="mt-2 overflow-hidden rounded-lg border border-border bg-white">
            {groupedResults.trip.length > 0 && <div className="border-b border-border/70 bg-surface px-3 py-1.5 text-[10.5px] font-medium text-text-muted">旅行范围内</div>}
            {groupedResults.trip.map((result) => <button key={`${result.lat},${result.lng}`} type="button" onClick={() => addFromResult(result)} className="block w-full border-b border-border/70 px-3 py-2 text-left last:border-b-0 hover:bg-accent-soft"><span className="block truncate text-[12.5px] font-medium text-text">{result.label.split(',')[0]}</span><span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{result.label}</span></button>)}
            {groupedResults.broader.length > 0 && <><div className="border-y border-border/70 bg-surface px-3 py-1.5 text-[10.5px] font-medium text-text-faint">其他可能地点</div>{groupedResults.broader.map((result) => <button key={`${result.lat},${result.lng}`} type="button" onClick={() => addFromResult(result)} className="block w-full border-b border-border/70 px-3 py-2 text-left last:border-b-0 hover:bg-accent-soft"><span className="block truncate text-[12.5px] font-medium text-text">{result.label.split(',')[0]}</span><span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{result.label}</span></button>)}</>}
          </div>}
          {searchStatus === 'empty' && query.trim().length >= 2 && <div className="mt-2 text-[11px] leading-relaxed text-text-faint">没有找到这个地点；可以直接收藏「{query.trim()}」，或在地图上选点。</div>}
        </div>

        {places.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-[12px] leading-relaxed text-text-faint">还没有收藏地点。可以搜索，或从地图上选一个位置。</div> : <div className="divide-y divide-border/80">
          {places.map((place, index) => {
            const meta = CATEGORY_META[place.category]
            const Icon = CATEGORY_ICONS[place.category]
            const expanded = selectedPlace?.id === place.id
            const scheduledItems = scheduledItemsFor(place)
            const startsScheduled = scheduledItems.length > 0 && !places.slice(0, index).some((item) => scheduledItemsFor(item).length > 0)
            return <div key={place.id} className="py-2.5 first:pt-1.5">
              {startsScheduled && <div className="mb-1.5 flex items-center gap-2 text-[10.5px] font-medium text-text-faint"><span className="h-px flex-1 bg-border" />已安排到行程<span className="h-px flex-1 bg-border" /></div>}
              <div className={`flex items-center gap-2 rounded-xl px-1.5 py-1.5 transition-colors ${expanded ? 'bg-action-soft/55' : 'hover:bg-surface'}`}>
                <button type="button" onClick={() => choosePlace(place.id)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: meta.soft, color: meta.color }}><Icon size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-text">{place.title}</span><span className="mt-0.5 block truncate text-[11.5px] text-text-faint">{place.location || '未补充位置'}</span></span>
                </button>
                <button type="button" onClick={() => choosePlace(place.id)} className={`shrink-0 rounded-full px-2 py-1 text-[10.5px] font-semibold ${scheduledItems.length ? 'bg-surface-2 text-text-muted' : 'bg-action-soft text-action'}`}>{scheduledItems.length ? `已排 ${scheduledItems.length} 次` : '待安排'}</button>
                <button type="button" onClick={() => removePlace(place)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-faint hover:bg-red-50 hover:text-red-500" aria-label={`移出「${place.title}」`}><TrashIcon size={14} /></button>
              </div>

              {expanded && targetDay && <div ref={assignmentRef} className="mt-2.5 scroll-mt-2 rounded-xl border border-action/10 bg-action-soft/42 px-3 py-3">
                <div className="mb-2 truncate text-[12px] font-semibold text-text">安排「{place.title}」</div>
                {scheduledItems.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5"><span className="mr-1 self-center text-[10.5px] text-text-faint">已安排</span>{scheduledItems.map((item) => <span key={item.id} className="inline-flex items-center overflow-hidden rounded-md border border-border bg-white text-[10.5px]"><span className="px-1.5 py-1 text-text-muted">{item.day?.label ?? '未分配'} · {item.time}</span><button type="button" onClick={() => cancelAssignment(place, item.id)} className="border-l border-border px-1.5 py-1 text-text-faint hover:bg-red-50 hover:text-red-500" aria-label={`取消 ${item.day?.label ?? ''} ${item.time} 的安排`}>×</button></span>)}</div>}
                <div className="flex items-center justify-between gap-3"><span className="text-[11px] font-medium text-text-muted">{scheduledItems.length ? '再安排到' : '安排到'}</span><span className="truncate text-[11px] text-text-faint">{targetDay.label} · {targetDay.place || '待定'}</span></div>
                <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">{trip.days.map((day) => <button type="button" key={day.id} onClick={() => chooseDay(day.id)} className={`min-w-[74px] shrink-0 rounded-[10px] border px-2 py-2 text-center transition-colors ${day.id === targetDay.id ? 'border-action bg-white text-action shadow-[0_1px_4px_rgba(40,120,212,0.10)]' : 'border-border/80 bg-white/70 text-text-muted hover:border-action/35'}`}><span className="block text-[10.5px] leading-none">{compactDate(day.date)}</span><span className="mt-1 block text-[11.5px] font-semibold leading-none">{day.label}</span></button>)}</div>
                <section aria-label="目标日期行程预览" className="mt-2 rounded-lg border border-border/70 bg-white/85 px-2.5 py-2">
                  <div className="flex items-center justify-between text-[10.5px] text-text-muted"><span className="font-medium">当天已有安排</span><span>{targetActivities.length} 项</span></div>
                  {targetActivities.length === 0 ? <p className="mt-2 text-[11px] text-text-faint">这一天还是空白，可以从这个地点开始。</p>
                    : <div className="mt-1.5 max-h-[180px] overflow-y-auto overscroll-contain">
                      {targetActivities.map((activity, index) => {
                        const end = endMinutes(activity)
                        const next = targetActivities[index + 1]
                        const gap = end !== undefined && next ? timeMinutes(next.time) - end : 0
                        const after = end ?? timeMinutes(activity.time) + 30
                        return <div key={activity.id}>
                          <div className="flex items-center gap-2 py-1.5 text-[11px]">
                            <span className="w-[38px] shrink-0 tabular-nums text-text-faint">{activity.time}</span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-text">{activity.title}</span>{end !== undefined && <span className="block text-[10px] text-text-faint">{end >= 1440 ? '次日 ' : ''}{clockTime(end)} 结束</span>}</span>
                            {after < 1440 && <button type="button" onClick={() => setTime(clockTime(after))} aria-label={`排在${activity.title}后面`} className="shrink-0 rounded-md px-1.5 py-1.5 text-[10px] font-medium text-accent-hover hover:bg-action-soft">排在后面</button>}
                          </div>
                          {gap > 0 && <div className="ml-[46px] border-l border-border pl-2 text-[10px] text-text-faint">间隔 {gap >= 60 ? `${Math.floor(gap / 60)} 小时${gap % 60 ? ` ${gap % 60} 分钟` : ''}` : `${gap} 分钟`} · 含移动时间</div>}
                        </div>
                      })}
                    </div>}
                  {targetActivities.some((activity) => endMinutes(activity) === undefined) && <p className="mt-1 text-[10px] text-text-faint">未填时长的安排，默认在开始后 30 分钟；请预留游玩和交通时间。</p>}
                </section>
                {overlapping && <p role="status" className="mt-2 text-[11px] text-amber-700">所选时间与「{overlapping.title}」重叠，可修改时间后安排。</p>}
                {referenceDistances.length > 0 && <div className="mt-1.5 space-y-0.5 text-[10.5px] text-text-muted">{referenceDistances.map((distance, index) => <p key={`${distance.title}-${index}`} className="truncate">距「{distance.title}」直线约 {(distance.meters / 1000).toFixed(1)} km{distance.meters >= 15000 ? ' · 请预留交通时间' : ''}</p>)}</div>}
                <div className="mt-2.5 flex items-center gap-2 border-t border-action/10 pt-2.5"><label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-text-muted"><ClockIcon size={14} className="shrink-0 text-accent" /><span className="shrink-0">建议时间</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="min-w-0 flex-1 bg-transparent text-right text-[13px] font-semibold text-text outline-none" aria-label="安排时间" /></label><button type="button" onClick={confirmAssignment} className={`${overlayPrimaryButtonClass} min-h-9 shrink-0 px-4 text-[12px]`}>安排</button></div>
              </div>}
            </div>
          })}
        </div>}
      </ModalShell>
      {showCustomMap && <CustomMapWishDialog initialName={query.trim()} initialCategory={category} onSaved={(id) => { setSelectedPlaceId(id); clearAdd(); setShowCustomMap(false) }} onClose={() => setShowCustomMap(false)} />}
    </>
  )
}
