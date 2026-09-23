import { useMemo, useState } from 'react'
import { displayDate, nextActivityTime, useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS, ClockIcon, HeartIcon, PlusIcon } from './Icons'
import ModalShell, { overlayPrimaryButtonClass } from './OverlayShell'
import { useToastStore } from './toastStore'
import { CATEGORY_META, type WishPlace } from '../types'

function scheduledIds(place: WishPlace) {
  return [...(place.scheduledActivityIds ?? []), ...(place.scheduledActivityId ? [place.scheduledActivityId] : [])]
}

function compactDate(date: string) {
  const display = displayDate(date)
  return display.replace(/\s+周.*/, '')
}

/**
 * 手机端的快速编排入口。地点仍在完整「想去」页里管理；这里专注于把一个待安排地点
 * 放进某一天，避免用户在行程与地点库之间反复跳转。
 */
export default function MobileWishSheet({ onClose, onOpenFullWishlist }: { onClose: () => void; onOpenFullWishlist: () => void }) {
  const trip = useActiveTrip()
  const { activeDayId, scheduleWishPlace, setActiveDay, selectActivity } = useTripStore()
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [targetDayId, setTargetDayId] = useState(() => activeDayId || trip.days[0]?.id || '')
  const [time, setTime] = useState(() => nextActivityTime(trip, activeDayId || trip.days[0]?.id || ''))

  const unscheduledPlaces = useMemo(
    () => trip.wishPlaces.filter((place) => !scheduledIds(place).some((id) => trip.activities.some((activity) => activity.id === id))),
    [trip.activities, trip.wishPlaces],
  )
  const selectedPlace = unscheduledPlaces.find((place) => place.id === selectedPlaceId) ?? null
  const targetDay = trip.days.find((day) => day.id === targetDayId) ?? trip.days[0]

  function choosePlace(placeId: string) {
    if (placeId === selectedPlaceId) {
      setSelectedPlaceId(null)
      return
    }
    const dayId = targetDay?.id || activeDayId || trip.days[0]?.id || ''
    setTargetDayId(dayId)
    setTime(nextActivityTime(trip, dayId))
    setSelectedPlaceId(placeId)
  }

  function chooseDay(dayId: string) {
    setTargetDayId(dayId)
    setTime(nextActivityTime(trip, dayId))
  }

  function confirmAssignment() {
    if (!selectedPlace || !targetDay) return
    const activityId = scheduleWishPlace(selectedPlace.id, targetDay.id, {
      time,
      title: selectedPlace.title,
      category: selectedPlace.category,
      location: selectedPlace.location,
      note: selectedPlace.note,
      geo: selectedPlace.geo,
    })
    if (!activityId) return
    setActiveDay(targetDay.id)
    selectActivity(activityId)
    useToastStore.getState().show(`已安排「${selectedPlace.title}」到 ${targetDay.label} · ${time}`)
    setSelectedPlaceId(null)
  }

  return (
    <ModalShell
      title={<><span>想去</span><span className="ml-2 text-text-muted">{unscheduledPlaces.length}</span></>}
      description="收藏的地点 · 选择后直接安排到行程"
      onClose={onClose}
      size="md"
      bodyClassName="pt-2.5 pb-5"
    >
      <div className="mb-2 flex items-center justify-end">
        <button type="button" onClick={onOpenFullWishlist} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-medium text-accent hover:bg-accent-soft">
          <HeartIcon size={13} /> 管理地点
        </button>
      </div>

      {unscheduledPlaces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center">
          <div className="text-[13px] font-medium text-text">所有想去地点都已安排</div>
          <div className="mt-1 text-[11.5px] leading-relaxed text-text-faint">需要再次安排或继续收藏地点，可进入完整清单。</div>
          <button type="button" onClick={onOpenFullWishlist} className={`${overlayPrimaryButtonClass} mt-4 min-h-9 px-3 text-[12px]`}>
            打开想去清单
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border/80">
          {unscheduledPlaces.map((place) => {
            const meta = CATEGORY_META[place.category]
            const Icon = CATEGORY_ICONS[place.category]
            const expanded = selectedPlace?.id === place.id
            return (
              <div key={place.id} className="py-2.5 first:pt-1.5">
                <button
                  type="button"
                  onClick={() => choosePlace(place.id)}
                  aria-expanded={expanded}
                  className={`flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition-colors ${expanded ? 'bg-action-soft/55' : 'hover:bg-surface'}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: meta.soft, color: meta.color }}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-text">{place.title}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-text-faint">{place.location || '未补充位置'}</span>
                  </span>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${expanded ? 'bg-action text-white shadow-[0_2px_7px_rgba(40,120,212,0.24)]' : 'bg-action-soft text-action'}`}>
                    <PlusIcon size={17} className={expanded ? 'rotate-45 transition-transform' : 'transition-transform'} />
                  </span>
                </button>

                {expanded && targetDay && (
                  <div className="mt-2.5 rounded-xl border border-action/10 bg-action-soft/42 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-medium text-text-muted">选择日期</span>
                      <span className="truncate text-[11px] text-text-faint">{targetDay.label} · {targetDay.place || '待定'}</span>
                    </div>
                    <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                      {trip.days.map((day) => {
                        const selected = day.id === targetDay.id
                        return (
                          <button
                            type="button"
                            key={day.id}
                            onClick={() => chooseDay(day.id)}
                            className={`min-w-[74px] shrink-0 rounded-[10px] border px-2 py-2 text-center transition-colors ${selected ? 'border-action bg-white text-action shadow-[0_1px_4px_rgba(40,120,212,0.10)]' : 'border-border/80 bg-white/70 text-text-muted hover:border-action/35'}`}
                          >
                            <span className="block text-[10.5px] leading-none">{compactDate(day.date)}</span>
                            <span className="mt-1 block text-[11.5px] font-semibold leading-none">{day.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 border-t border-action/10 pt-2.5">
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-text-muted">
                        <ClockIcon size={14} className="shrink-0 text-accent" />
                        <span className="shrink-0">建议时间</span>
                        <input
                          type="time"
                          value={time}
                          onChange={(event) => setTime(event.target.value)}
                          className="min-w-0 flex-1 bg-transparent text-right text-[13px] font-semibold text-text outline-none"
                          aria-label="安排时间"
                        />
                      </label>
                      <button type="button" onClick={confirmAssignment} className={`${overlayPrimaryButtonClass} min-h-9 shrink-0 px-4 text-[12px]`}>
                        安排
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </ModalShell>
  )
}
