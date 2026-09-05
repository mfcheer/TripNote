import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Activity, Cost, Trip, TripDay, ViewKey, PlanTab, WishPlace } from './types'
import type { ActivityFormValues } from './components/ActivityForm'
import { seedTrip } from './data/seed'

export interface TripCreateInput {
  name?: string
  destination?: string
  startDate?: string
  endDate?: string
  totalBudget?: number
}

interface TripState {
  trips: Trip[]
  activeTripId: string
  view: ViewKey
  planTab: PlanTab
  activeDayId: string
  selectedActivityId: string | null
  editingActivityId: string | null
  // 可选地图服务：留空时始终使用 OSM / Nominatim；Key 仅保存在当前浏览器。
  amapJsKey: string
  amapWebServiceKey: string
  mapRouteMode: 'direct' | 'walking'
  setAmapKeys: (keys: { jsKey: string; webServiceKey: string }) => void
  setMapRouteMode: (mode: 'direct' | 'walking') => void
  // 编辑表单草稿（切换天/视图/旅程时暂存，回来恢复，避免丢输入）
  activityDraft: { activityId: string; values: ActivityFormValues } | null
  saveActivityDraft: (draft: { activityId: string; values: ActivityFormValues } | null) => void
  setView: (v: ViewKey) => void
  setPlanTab: (t: PlanTab) => void
  setActiveDay: (dayId: string) => void
  selectActivity: (id: string | null) => void
  setEditingActivity: (id: string | null) => void
  // 跳转定位到某条目（地图标记/预算明细点击）：展开详情并切回行程视图
  focusActivity: (id: string) => void
  // 多旅程
  switchTrip: (tripId: string) => void
  createTrip: (input: string | TripCreateInput) => string
  deleteTrip: (tripId: string) => void
  renameTrip: (tripId: string, name: string) => void
  importTrip: (data: unknown) => boolean
  resetAll: () => void
  // 删除撤销：恢复删除前的 trips 快照
  restoreTrips: (snapshot: Trip[], activeTripId: string) => void
  // 行程条目
  reorderActivity: (activityId: string, toDayId: string, toIndex: number) => void
  addActivity: (activity: Omit<Activity, 'id'>) => string
  removeActivity: (activityId: string) => void
  addDay: (afterDayId?: string) => void
  removeDay: (dayId: string) => void
  updateDay: (dayId: string, patch: Partial<Pick<TripDay, 'date' | 'place'>>) => void
  updateActivity: (id: string, patch: Partial<Activity>) => void
  addCost: (activityId: string, cost: Omit<Cost, 'id'>) => void
  updateCost: (activityId: string, costId: string, patch: Partial<Cost>) => void
  removeCost: (activityId: string, costId: string) => void
  setBudget: (amount: number) => void
  // 想去清单
  addWishPlace: (place: Omit<WishPlace, 'id'>) => string
  removeWishPlace: (placeId: string) => void
  reorderWishPlace: (placeId: string, targetPlaceId: string) => void
  scheduleWishPlace: (placeId: string, dayId: string, values: ActivityFormValues) => string | null
  cancelWishSchedule: (placeId: string, activityId: string) => void
}

// 当前激活旅程（各视图统一从这里取数据）
export function useActiveTrip(): Trip {
  const trips = useTripStore((s) => s.trips)
  const activeTripId = useTripStore((s) => s.activeTripId)
  return trips.find((t) => t.id === activeTripId) ?? trips[0]
}

// 按天分组后排序工具
export const activitiesByDay = (trip: Trip, dayId: string) =>
  trip.activities
    .filter((a) => a.dayId === dayId)
    .sort((a, b) => a.time.localeCompare(b.time))

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function isDate(value?: string): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

// 新建旅程：有起止日期时自动铺好每天，避免用户从一个完全空白的旅程开始
function blankTrip(input: string | TripCreateInput): Trip {
  const options: TripCreateInput = typeof input === 'string' ? { name: input } : input
  const destination = options.destination?.trim() ?? ''
  const startDate = isDate(options.startDate) ? options.startDate : undefined
  const endDate = isDate(options.endDate) && (!startDate || options.endDate >= startDate)
    ? options.endDate
    : startDate
  const daysCount = startDate && endDate
    ? Math.min(60, Math.floor((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000) + 1)
    : 1
  const name = options.name?.trim() || (destination ? `${destination}之旅` : '新旅程')

  return {
    id: makeId('trip'),
    name,
    daysCount,
    days: Array.from({ length: daysCount }, (_, index) => ({
      id: makeId('day'),
      label: `第${index + 1}天`,
      date: startDate ? shiftDate(startDate, index) : '待定',
      place: destination,
    })),
    activities: [],
    wishPlaces: [],
    expenses: [],
    totalBudget: Number.isFinite(options.totalBudget) ? Math.max(0, options.totalBudget!) : 0,
  }
}

// 旧数据迁移：cost: number → costs: Cost[]；旧手动记账转移到占位条目
function migrateTrip(raw: unknown): Trip {
  const trip = raw as Omit<Trip, 'expenses'> & {
    expenses?: Array<{ id: string; category: string; title: string; amount: number; dayRef?: string }>
  }
  if (!trip || !Array.isArray(trip.activities)) return seedTrip
  const migrated: Trip = {
    ...trip,
    wishPlaces: Array.isArray((trip as Partial<Trip>).wishPlaces)
      ? (trip as Trip).wishPlaces.map(normalizeWishPlace)
      : [],
    expenses: [],
    activities: trip.activities.map((a, i) => {
      const legacy = a as Activity & { cost?: number }
      if (Array.isArray(legacy.costs)) return legacy
      return {
        ...legacy,
        costs: legacy.cost != null ? [{ id: `c-legacy-${i}`, amount: legacy.cost }] : [],
      }
    }),
  }
  const legacyExpenses = trip.expenses ?? []
  if (legacyExpenses.length > 0) {
    const firstDay = migrated.days[0]
    migrated.activities.push({
      id: 'a-legacy-expenses',
      dayId: firstDay.id,
      time: '23:59',
      title: '未分类支出（旧记账迁移）',
      category: 'shop',
      costs: legacyExpenses.map((e) => ({ id: `c-${e.id}`, title: e.title, amount: e.amount })),
    })
  }
  return migrated
}

// 校验导入数据是否为合法旅程
function normalizeImportedTrip(raw: unknown): Trip | null {
  type RawActivity = Partial<Activity> & { cost?: number }
  const t = raw as Partial<Trip> & { activities?: RawActivity[] }
  if (!t || !Array.isArray(t.days) || !Array.isArray(t.activities)) return null
  const rawActivities = t.activities as RawActivity[]
  return {
    ...blankTrip(String(t.name ?? '导入的旅程')),
    ...t,
    id: makeId('trip'),
    expenses: [],
    daysCount: t.days!.length,
    activities: rawActivities.map((a, i) => {
      if (Array.isArray(a.costs)) return a as Activity
      const withCosts = { ...a, costs: [] } as Activity
      if (a.cost != null) withCosts.costs = [{ id: `c-imp-${i}`, amount: a.cost }]
      return withCosts
    }),
    wishPlaces: Array.isArray(t.wishPlaces) ? t.wishPlaces.map(normalizeWishPlace) : [],
  } as Trip
}

function wishScheduledActivityIds(wish: WishPlace) {
  return Array.from(new Set([...(wish.scheduledActivityIds ?? []), ...(wish.scheduledActivityId ? [wish.scheduledActivityId] : [])]))
}

function normalizeWishPlace(wish: WishPlace): WishPlace {
  const ids = wishScheduledActivityIds(wish)
  const { scheduledActivityId: _legacyScheduledActivityId, ...rest } = wish
  return ids.length > 0 ? { ...rest, scheduledActivityIds: ids } : rest
}

function unlinkWishActivity(wish: WishPlace, activityId: string): WishPlace {
  const ids = wishScheduledActivityIds(wish).filter((id) => id !== activityId)
  const { scheduledActivityId: _legacyScheduledActivityId, ...rest } = wish
  return ids.length > 0 ? { ...rest, scheduledActivityIds: ids } : rest
}

// 天编号按位置重排（删除/插入后天数标签始终连续，避免重复编号）
function renumberDays(days: TripDay[]): TripDay[] {
  return days.map((d, i) => ({ ...d, label: `第${i + 1}天` }))
}

// "HH:MM" → 分钟
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// 分钟 → "HH:MM"
function toHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// 排序时用于顺延时间：优先使用结构化时长，兼容旧数据中的“2小时 / 50分钟”文本。
function schedulingDuration(activity: Activity): number {
  if (activity.endTime) {
    const end = toMinutes(activity.endTime)
    const start = toMinutes(activity.time)
    return end >= start ? end - start : end + 1440 - start
  }
  if (activity.durationMinutes && activity.durationMinutes > 0) return activity.durationMinutes
  const hours = activity.duration?.match(/(\d+(?:\.\d+)?)\s*小时/)
  const minutes = activity.duration?.match(/(\d+)\s*分钟/)
  const parsed = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
  return parsed > 0 ? parsed : 90
}

// 新增安排的建议时间：接在当天最后一个行程之后；空白天从 09:00 开始。
export function nextActivityTime(trip: Trip, dayId: string): string {
  const dayItems = activitiesByDay(trip, dayId)
  const last = dayItems[dayItems.length - 1]
  return last ? toHHMM(toMinutes(last.time) + schedulingDuration(last)) : '09:00'
}

// 天日期：标准格式 YYYY-MM-DD 时自动推算后续天（+1），非标准格式不动
export function shiftDate(dateStr: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 存储格式 → 显示格式：2026-10-01 → "10月1日 周三"
export function displayDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const d = new Date(dateStr + 'T00:00:00')
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week}`
}

export const useTripStore = create<TripState>()(
  persist(
    (set, get) => ({
      trips: [seedTrip],
      activeTripId: seedTrip.id,
      view: 'plan',
      planTab: 'timeline',
      activeDayId: 'd1',
      selectedActivityId: null,
      editingActivityId: null,
      amapJsKey: '',
      amapWebServiceKey: '',
      mapRouteMode: 'direct',
      setAmapKeys: ({ jsKey, webServiceKey }) => set({
        amapJsKey: jsKey.trim(),
        amapWebServiceKey: webServiceKey.trim(),
      }),
      setMapRouteMode: (mapRouteMode) => set({ mapRouteMode }),
      activityDraft: null,
      saveActivityDraft: (activityDraft) => set({ activityDraft }),

      setView: (view) => set({ view }),
      setPlanTab: (planTab) => set({ planTab }),
      setActiveDay: (activeDayId) => set({ activeDayId }),
      selectActivity: (selectedActivityId) => set({ selectedActivityId }),
      // 开始编辑时定位到对应天，并收起详情面板（表单内嵌在时间轴里）
      setEditingActivity: (editingActivityId) => {
        if (!editingActivityId) {
          set({ editingActivityId: null })
          return
        }
        const s = get()
        const act = s.trips
          .find((t) => t.id === s.activeTripId)!
          .activities.find((a) => a.id === editingActivityId)
        set({
          editingActivityId,
          selectedActivityId: null,
          ...(act ? { activeDayId: act.dayId } : {}),
        })
      },

      // 跳转定位到某条目：切回行程视图、定位到对应天、展开内嵌详情
      focusActivity: (id) => {
        const s = get()
        const act = s.trips
          .find((t) => t.id === s.activeTripId)
          ?.activities.find((a) => a.id === id)
        if (!act) return
        set({
          view: 'plan',
          planTab: 'timeline',
          activeDayId: act.dayId,
          selectedActivityId: id,
          editingActivityId: null,
        })
      },

      // ── 多旅程 ──
      switchTrip: (tripId) => {
        const s = get()
        const target = s.trips.find((t) => t.id === tripId)
        if (!target) return
        set({
          activeTripId: tripId,
          activeDayId: target.days[0]?.id ?? '',
          selectedActivityId: null,
          editingActivityId: null,
        })
      },

      createTrip: (input) => {
        const trip = blankTrip(input)
        set((s) => ({
          trips: [...s.trips, trip],
          activeTripId: trip.id,
          activeDayId: trip.days[0].id,
          selectedActivityId: null,
          editingActivityId: null,
          view: 'plan',
          planTab: 'timeline',
        }))
        return trip.id
      },

      deleteTrip: (tripId) => {
        set((s) => {
          const rest = s.trips.filter((t) => t.id !== tripId)
          // 至少保留一个旅程
          if (rest.length === 0) {
            const fresh = blankTrip('新旅程')
            return {
              trips: [fresh],
              activeTripId: fresh.id,
              activeDayId: fresh.days[0].id,
              selectedActivityId: null,
              editingActivityId: null,
            }
          }
          if (s.activeTripId === tripId) {
            const next = rest[0]
            return {
              trips: rest,
              activeTripId: next.id,
              activeDayId: next.days[0]?.id ?? '',
              selectedActivityId: null,
              editingActivityId: null,
            }
          }
          return { trips: rest }
        })
      },

      renameTrip: (tripId, name) =>
        set((s) => ({
          trips: s.trips.map((t) => (t.id === tripId ? { ...t, name: name.trim() || t.name } : t)),
        })),

      importTrip: (data) => {
        const trip = normalizeImportedTrip(data)
        if (!trip) return false
        set((s) => ({
          trips: [...s.trips, trip],
          activeTripId: trip.id,
          activeDayId: trip.days[0]?.id ?? '',
          selectedActivityId: null,
          editingActivityId: null,
          view: 'plan',
          planTab: 'timeline',
        }))
        return true
      },

      resetAll: () =>
        set({
          trips: [seedTrip],
          activeTripId: seedTrip.id,
          activeDayId: 'd1',
          selectedActivityId: null,
          editingActivityId: null,
          view: 'plan',
          planTab: 'timeline',
        }),

      restoreTrips: (snapshot, activeTripId) => set({ trips: snapshot, activeTripId }),

      // ── 行程条目（均作用于当前旅程） ──
      // 拖拽调整顺序后，目标天从落点起按各自预计时长顺延，保证时间顺序与视觉顺序一致。
      reorderActivity: (activityId, toDayId, toIndex) =>
        set((s) => ({
          trips: s.trips.map((t) => {
            if (t.id !== s.activeTripId) return t
            const idx = t.activities.findIndex((a) => a.id === activityId)
            if (idx === -1) return t
            const moved = { ...t.activities[idx], dayId: toDayId }
            const rest = t.activities.filter((_, i) => i !== idx)
            const dayIds = t.days.map((d) => d.id)
            const sameDay = rest
              .filter((a) => a.dayId === toDayId)
              .sort((a, b) => a.time.localeCompare(b.time))
            const insertAt = Math.max(0, Math.min(toIndex, sameDay.length))
            sameDay.splice(insertAt, 0, moved)

            // 起始时间：插到中间→前一条结束；插到首位→沿用该天原开始时间（原来是空天则 08:00）
            let cur =
              insertAt > 0
                ? toMinutes(sameDay[insertAt - 1].time) + schedulingDuration(sameDay[insertAt - 1])
                : sameDay.length > 1
                  ? toMinutes(sameDay[1].time)
                  : 8 * 60
            const renumbered = sameDay.map((a, i) => {
              if (i < insertAt) return a
              const time = toHHMM(cur)
              const duration = schedulingDuration(a)
              cur += duration
              return { ...a, time, ...(a.endTime || a.durationMinutes ? { endTime: toHHMM(cur) } : {}) }
            })

            const others = rest.filter((a) => a.dayId !== toDayId)
            const merged = [...others, ...renumbered]
            merged.sort((a, b) => dayIds.indexOf(a.dayId) - dayIds.indexOf(b.dayId))
            return { ...t, activities: merged }
          }),
        })),

      addActivity: (activity) => {
        const id = makeId('activity')
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? { ...t, activities: [...t.activities, { ...activity, id }] }
              : t,
          ),
        }))
        return id
      },

      removeActivity: (activityId) =>
        set((s) => ({
          trips: s.trips.map((t) => {
            if (t.id !== s.activeTripId) return t
            const removed = t.activities.find((activity) => activity.id === activityId)
            return {
              ...t,
              activities: t.activities.filter((activity) => activity.id !== activityId),
              wishPlaces: removed?.sourceWishId
                ? t.wishPlaces.map((wish) =>
                    wish.id === removed.sourceWishId
                      ? unlinkWishActivity(wish, activityId)
                      : wish,
                  )
                : t.wishPlaces,
            }
          }),
          selectedActivityId: s.selectedActivityId === activityId ? null : s.selectedActivityId,
          editingActivityId: s.editingActivityId === activityId ? null : s.editingActivityId,
        })),

      addDay: (afterDayId) => {
        const newId = makeId('day')
        set((s) => ({
          trips: s.trips.map((t) => {
            if (t.id !== s.activeTripId) return t
            const anchorIndex = afterDayId ? t.days.findIndex((d) => d.id === afterDayId) : t.days.length - 1
            const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : t.days.length
            const previousDay = t.days[insertIndex - 1]
            const suggestedDate = previousDay && isDate(previousDay.date)
              ? shiftDate(previousDay.date, 1)
              : '待定'
            const newDay: TripDay = {
              id: newId,
              label: '',
              date: suggestedDate,
              place: previousDay?.place ?? '',
            }

            // 从中间插入时，后续已有的标准日期整体顺延一天，避免产生重复日期。
            const shiftedTail = t.days.slice(insertIndex).map((day) =>
              isDate(day.date) ? { ...day, date: shiftDate(day.date, 1) } : day,
            )
            let days: TripDay[] = [
              ...t.days.slice(0, insertIndex),
              newDay,
              ...shiftedTail,
            ]
            days = renumberDays(days)
            return { ...t, days, daysCount: days.length }
          }),
          // 新增后直接切到该天
          activeDayId: newId,
        }))
      },

      removeDay: (dayId) =>
        set((s) => {
          const previous = s.trips.find((t) => t.id === s.activeTripId)!
          const removedIndex = previous.days.findIndex((d) => d.id === dayId)
          const trips = s.trips.map((t) => {
            if (t.id !== s.activeTripId) return t
            const days = renumberDays(t.days.filter((d) => d.id !== dayId))
            const removedWishActivityIds = new Map<string, string[]>()
            t.activities
              .filter((activity) => activity.dayId === dayId && activity.sourceWishId)
              .forEach((activity) => {
                const ids = removedWishActivityIds.get(activity.sourceWishId!) ?? []
                ids.push(activity.id)
                removedWishActivityIds.set(activity.sourceWishId!, ids)
              })
            return {
              ...t,
              days,
              daysCount: days.length,
              activities: t.activities.filter((a) => a.dayId !== dayId),
              wishPlaces: removedWishActivityIds.size > 0
                ? t.wishPlaces.map((wish) =>
                    removedWishActivityIds.has(wish.id)
                      ? removedWishActivityIds.get(wish.id)!.reduce(unlinkWishActivity, wish)
                      : wish,
                  )
                : t.wishPlaces,
            }
          })
          // 删的是当前激活天时，切到前一天（没有则第一天）
          const active = trips.find((t) => t.id === s.activeTripId)!
          const activeDayId = active.days.some((d) => d.id === s.activeDayId)
            ? s.activeDayId
            : active.days[Math.max(0, removedIndex - 1)]?.id ??
              active.days[0]?.id ??
              ''
          return { trips, activeDayId, selectedActivityId: null, editingActivityId: null }
        }),

      updateDay: (dayId, patch) =>
        set((s) => ({
          trips: s.trips.map((t) => {
            if (t.id !== s.activeTripId) return t
            const idx = t.days.findIndex((d) => d.id === dayId)
            if (idx === -1) return t
            const days = t.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d))
            // 修改任意一天的标准日期后，后续日期始终按天连续顺延。
            // 这样能避免用户改了出发日或中间日期后，出现重复、断档或旧日期残留。
            if (patch.date && /^\d{4}-\d{2}-\d{2}$/.test(patch.date)) {
              for (let i = idx + 1; i < days.length; i++) {
                days[i] = { ...days[i], date: shiftDate(patch.date, i - idx) }
              }
            }
            return { ...t, days }
          }),
        })),

      updateActivity: (id, patch) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? { ...t, activities: t.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) }
              : t,
          ),
        })),

      addCost: (activityId, cost) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? {
                  ...t,
                  activities: t.activities.map((a) =>
                    a.id === activityId
                      ? { ...a, costs: [...a.costs, { ...cost, id: makeId('cost') }] }
                      : a,
                  ),
                }
              : t,
          ),
        })),

      updateCost: (activityId, costId, patch) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? {
                  ...t,
                  activities: t.activities.map((a) =>
                    a.id === activityId
                      ? { ...a, costs: a.costs.map((c) => (c.id === costId ? { ...c, ...patch } : c)) }
                      : a,
                  ),
                }
              : t,
          ),
        })),

      removeCost: (activityId, costId) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? {
                  ...t,
                  activities: t.activities.map((a) =>
                    a.id === activityId ? { ...a, costs: a.costs.filter((c) => c.id !== costId) } : a,
                  ),
                }
              : t,
          ),
        })),

      setBudget: (amount) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId ? { ...t, totalBudget: amount } : t,
          ),
        })),

      // ── 想去清单 ──
      addWishPlace: (place) => {
        const id = makeId('wish')
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId ? { ...t, wishPlaces: [{ ...place, id }, ...t.wishPlaces] } : t,
          ),
        }))
        return id
      },

      removeWishPlace: (placeId) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? {
                  ...t,
                  wishPlaces: t.wishPlaces.filter((place) => place.id !== placeId),
                  // 移出想去清单不应静默删除已排好的行程，只解除来源关联。
                  activities: t.activities.map((activity) =>
                    activity.sourceWishId === placeId
                      ? { ...activity, sourceWishId: undefined }
                      : activity,
                  ),
                }
              : t,
          ),
        })),

      reorderWishPlace: (placeId, targetPlaceId) =>
        set((s) => ({
          trips: s.trips.map((trip) => {
            if (trip.id !== s.activeTripId || placeId === targetPlaceId) return trip
            const fromIndex = trip.wishPlaces.findIndex((place) => place.id === placeId)
            const toIndex = trip.wishPlaces.findIndex((place) => place.id === targetPlaceId)
            if (fromIndex < 0 || toIndex < 0) return trip
            const wishPlaces = [...trip.wishPlaces]
            const [moved] = wishPlaces.splice(fromIndex, 1)
            wishPlaces.splice(toIndex, 0, moved)
            return { ...trip, wishPlaces }
          }),
        })),

      scheduleWishPlace: (placeId, dayId, values) => {
        const state = get()
        const trip = state.trips.find((item) => item.id === state.activeTripId)
        const place = trip?.wishPlaces.find((item) => item.id === placeId)
        if (!trip || !place || !trip.days.some((day) => day.id === dayId)) return null
        const activityId = makeId('activity')
        set((s) => ({
          trips: s.trips.map((item) =>
            item.id === s.activeTripId
              ? {
                  ...item,
                  wishPlaces: item.wishPlaces.map((wish) =>
                    wish.id === placeId
                      ? normalizeWishPlace({ ...wish, scheduledActivityIds: [...wishScheduledActivityIds(wish), activityId] })
                      : wish,
                  ),
                  activities: [
                    ...item.activities,
                    {
                      id: activityId,
                      dayId,
                      time: values.time,
                      title: values.title,
                      category: values.category,
                      location: values.location,
                      note: values.note,
                      geo: values.geo,
                      duration: values.duration,
                      durationMinutes: values.durationMinutes,
                      endTime: values.endTime,
                      costs: values.firstCost != null
                        ? [{ id: makeId('cost'), amount: values.firstCost }]
                        : [],
                      sourceWishId: placeId,
                    },
                  ],
                }
              : item,
          ),
          activeDayId: dayId,
          selectedActivityId: activityId,
          editingActivityId: null,
        }))
        return activityId
      },

      cancelWishSchedule: (placeId, activityId) =>
        set((s) => ({
          trips: s.trips.map((trip) => {
            if (trip.id !== s.activeTripId) return trip
            const place = trip.wishPlaces.find((wish) => wish.id === placeId)
            if (!place || !wishScheduledActivityIds(place).includes(activityId)) return trip
            return {
              ...trip,
              activities: trip.activities.filter(
                (activity) => activity.id !== activityId,
              ),
              wishPlaces: trip.wishPlaces.map((wish) =>
                wish.id === placeId ? unlinkWishActivity(wish, activityId) : wish,
              ),
            }
          }),
          selectedActivityId: s.selectedActivityId === activityId ? null : s.selectedActivityId,
          editingActivityId: s.editingActivityId === activityId ? null : s.editingActivityId,
        })),
    }),
    {
      name: 'tripnote-store',
      version: 8,
      migrate: (persisted: unknown) => {
        const state = persisted as
          | { trips?: Trip[]; activeTripId?: string; trip?: unknown; theme?: unknown }
          | undefined
        if (!state) return persisted as object
        // v5：移除已废弃的深色主题偏好，统一使用优化后的浅色界面。
        const { theme: _legacyTheme, ...stateWithoutTheme } = state
        // v4：为既有多旅程补上想去清单字段，并继续兼容更早的花费结构。
        if (stateWithoutTheme.trips) {
          return { ...stateWithoutTheme, trips: stateWithoutTheme.trips.map((trip) => migrateTrip(trip)) }
        }
        // v2 及更早：单个 trip → 包装成数组
        if (stateWithoutTheme.trip) {
          const trip = migrateTrip(stateWithoutTheme.trip)
          return { ...stateWithoutTheme, trips: [trip], activeTripId: trip.id }
        }
        return stateWithoutTheme
      },
      partialize: (s) => ({
        trips: s.trips,
        activeTripId: s.activeTripId,
        amapJsKey: s.amapJsKey,
        amapWebServiceKey: s.amapWebServiceKey,
        mapRouteMode: s.mapRouteMode,
      }),
    },
  ),
)
