import { useMemo, useState, type DragEvent as NativeDragEvent } from 'react'
import { activitiesByDay, nextActivityTime, useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS, HeartIcon, MapIcon, PlusIcon } from './Icons'
import { CATEGORY_META, type WishPlace } from '../types'
import MapView from './MapView'
import { useToastStore } from './toastStore'

const ARRANGE_DRAG_TYPE = 'application/x-tripnote-arrange-wish-id'

function scheduledIds(place: WishPlace) {
  return [...(place.scheduledActivityIds ?? []), ...(place.scheduledActivityId ? [place.scheduledActivityId] : [])]
}

function daySummary(trip: ReturnType<typeof useActiveTrip>, dayId: string) {
  const items = activitiesByDay(trip, dayId)
  if (items.length === 0) return '当天尚未安排地点'
  const titles = items.slice(0, 2).map((item) => item.title).join(' · ')
  return items.length > 2 ? `${titles} · 等 ${items.length} 项` : titles
}

export default function ArrangeView() {
  const trip = useActiveTrip()
  const { scheduleWishPlace } = useTripStore()
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ placeId: string; dayId: string } | null>(null)
  const [dropDayId, setDropDayId] = useState<string | null>(null)

  const unscheduledPlaces = useMemo(
    () => trip.wishPlaces.filter((place) => !scheduledIds(place).some((id) => trip.activities.some((activity) => activity.id === id))),
    [trip.activities, trip.wishPlaces],
  )
  const selectedPlace = unscheduledPlaces.find((place) => place.id === selectedPlaceId) ?? null
  const pendingPlace = pending ? trip.wishPlaces.find((place) => place.id === pending.placeId) : null
  const pendingDay = pending ? trip.days.find((day) => day.id === pending.dayId) : null

  function proposeAssignment(placeId: string, dayId: string) {
    setSelectedPlaceId(placeId)
    setPending({ placeId, dayId })
    setDropDayId(null)
  }

  function confirmAssignment() {
    if (!pending || !pendingPlace || !pendingDay) return
    const time = nextActivityTime(trip, pendingDay.id)
    const activityId = scheduleWishPlace(pendingPlace.id, pendingDay.id, {
      time,
      title: pendingPlace.title,
      category: pendingPlace.category,
      location: pendingPlace.location,
      note: pendingPlace.note,
      geo: pendingPlace.geo,
    })
    if (!activityId) return
    useToastStore.getState().show(`已将「${pendingPlace.title}」安排到 ${pendingDay.label} · ${time}`)
    setSelectedPlaceId(null)
    setPending(null)
  }

  function handlePlaceDragStart(event: NativeDragEvent<HTMLElement>, placeId: string) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(ARRANGE_DRAG_TYPE, placeId)
    setSelectedPlaceId(placeId)
  }

  function handleDayDrop(event: NativeDragEvent<HTMLElement>, dayId: string) {
    event.preventDefault()
    const placeId = event.dataTransfer.getData(ARRANGE_DRAG_TYPE)
    if (placeId) proposeAssignment(placeId, dayId)
  }

  return (
    <div className="hidden h-full min-w-0 flex-col bg-bg lg:flex">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[276px] shrink-0 flex-col border-r border-border/80 bg-white/72">
          <div className="border-b border-border/70 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-text">待安排地点</div>
                <div className="mt-0.5 text-[11.5px] text-text-faint">拖到下方日期，或先选地点再安排</div>
              </div>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-hover">{unscheduledPlaces.length}</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {unscheduledPlaces.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] leading-relaxed text-text-faint">
                已经安排完所有想去地点。<br />可以回到「想去」继续收集。
              </div>
            ) : unscheduledPlaces.map((place) => {
              const meta = CATEGORY_META[place.category]
              const Icon = CATEGORY_ICONS[place.category]
              const active = selectedPlace?.id === place.id
              return (
                <button
                  key={place.id}
                  draggable
                  onDragStart={(event) => handlePlaceDragStart(event, place.id)}
                  onClick={() => setSelectedPlaceId(active ? null : place.id)}
                  className={`group mb-1.5 flex w-full items-start gap-2 rounded-md border px-2.5 py-2.5 text-left transition-colors ${
                    active ? 'border-accent/50 bg-accent-soft/58 shadow-[0_1px_4px_rgba(39,50,58,0.05)]' : 'border-transparent hover:border-border/80 hover:bg-white'
                  }`}
                  title="拖动到下方日期即可安排"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: meta.soft, color: meta.color }}><Icon size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-text">{place.title}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-text-faint">{place.location || '未补充位置'}</span>
                  </span>
                  <span className="mt-1 text-text-faint opacity-0 transition-opacity group-hover:opacity-100">＋</span>
                </button>
              )
            })}
          </div>
          <div className="border-t border-border/70 px-4 py-3 text-[11px] leading-relaxed text-text-faint">
            <span className="inline-flex items-center gap-1"><HeartIcon size={12} /> 已安排的地点仍保留在「想去」清单。</span>
          </div>
        </aside>

        <div className="relative min-w-0 flex-1">
          <MapView initialDayId="all" highlightWishPlace={selectedPlace} />
          {selectedPlace && !pending && (
            <div className="absolute left-4 bottom-5 z-[650] rounded-lg border border-white/80 bg-white/95 px-3 py-2.5 shadow-[0_6px_20px_rgba(32,40,46,0.12)] backdrop-blur-md">
              <div className="flex items-center gap-2 text-[12px] font-medium text-text"><MapIcon size={13} className="text-accent" />已选「{selectedPlace.title}」</div>
              <div className="mt-0.5 text-[10.5px] text-text-faint">选择下方某一天，查看建议安排时间</div>
            </div>
          )}
          {pending && pendingPlace && pendingDay && (
            <div className="absolute left-1/2 bottom-5 z-[700] w-[min(430px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-border bg-white/96 p-3 shadow-[0_10px_30px_rgba(32,40,46,0.16)] backdrop-blur-md">
              <div className="flex items-start gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"><PlusIcon size={15} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold">{pendingPlace.title} → {pendingDay.label} · {pendingDay.place || '待定地点'}</div>
                  <div className="mt-0.5 text-[11px] text-text-faint">建议安排在 {nextActivityTime(trip, pendingDay.id)}，可在行程页继续调整时间与交通。</div>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setPending(null)} className="rounded-md px-2.5 py-1.5 text-[11.5px] text-text-muted hover:bg-surface-2">换一天</button>
                <button onClick={confirmAssignment} className="rounded-md bg-action px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-action-hover">确认安排</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="shrink-0 border-t border-border/80 bg-white/96 px-4 py-3 shadow-[0_-4px_16px_rgba(32,40,46,0.035)]">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-[12px] font-semibold text-text">按天编排</div>
          <div className="text-[10.5px] text-text-faint">拖动地点到某一天，先确认再写入行程</div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
          {trip.days.map((day) => {
            const isDropTarget = dropDayId === day.id
            return (
              <button
                key={day.id}
                onClick={() => selectedPlace && proposeAssignment(selectedPlace.id, day.id)}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropDayId(day.id) }}
                onDragLeave={() => setDropDayId((current) => current === day.id ? null : current)}
                onDrop={(event) => handleDayDrop(event, day.id)}
                className={`min-w-0 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  isDropTarget ? 'border-action bg-action-soft shadow-[0_2px_8px_rgba(175,105,89,0.12)]' : 'border-border/80 bg-surface hover:border-accent/45 hover:bg-white'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11.5px] font-semibold text-text">{day.label} · {day.place || '待定'}</span>
                  <span className="shrink-0 text-[10px] text-text-faint">{activitiesByDay(trip, day.id).length} 项</span>
                </span>
                <span className="mt-1 block truncate text-[10.5px] text-text-faint">{daySummary(trip, day.id)}</span>
                <span className={`mt-2 flex items-center gap-1 text-[10.5px] font-medium ${isDropTarget ? 'text-action-hover' : selectedPlace ? 'text-accent-hover' : 'text-text-faint'}`}><PlusIcon size={11} /> {isDropTarget ? `安排「${selectedPlace?.title ?? ''}」` : selectedPlace ? '安排到这一天' : '选择地点后安排'}</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
