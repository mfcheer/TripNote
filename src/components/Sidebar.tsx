import { useEffect, useRef, useState } from 'react'
import type { DragEvent, PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { activitiesByDay, useActiveTrip, useTripStore, displayDate, nextActivityTime } from '../store'
import { straightLineDistanceMeters } from '../api/route'
import type { TripDay, ViewKey } from '../types'
import { CalendarIcon, ChevronDownIcon, DownloadIcon, EditIcon, LogoIcon, PlusIcon, SettingsIcon, TrashIcon } from './Icons'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'
import ModalShell, { overlayPrimaryButtonClass, overlaySecondaryButtonClass } from './OverlayShell'

const NAV_ITEMS: { key: ViewKey; label: string; Icon: (p: { size?: number }) => ReactElement }[] = [
  { key: 'plan', label: '行程规划', Icon: CalendarIcon },
  { key: 'settings', label: '设置', Icon: SettingsIcon },
]

const SIDEBAR_WIDTH_KEY = 'tripnote-sidebar-width-v1'

function savedSidebarWidth() {
  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  return Number.isFinite(saved) ? saved : null
}

// 一天的移动里程按连续动线累计：当天内部相邻地点，加上前一天最后一个定位点到当天第一个定位点。
// 使用直线里程作为不调用路线服务的稳定概览；打开智能地图后可看到对应的道路路线。
function dayMovementMeters(trip: ReturnType<typeof useActiveTrip>, dayIndex: number) {
  const day = trip.days[dayIndex]
  const todayPoints = activitiesByDay(trip, day.id).flatMap((activity) => activity.geo ? [activity.geo] : [])
  if (todayPoints.length === 0) return 0
  const previousLastPoint = dayIndex > 0
    ? activitiesByDay(trip, trip.days[dayIndex - 1].id).flatMap((activity) => activity.geo ? [activity.geo] : []).at(-1)
    : undefined
  const points = previousLastPoint ? [previousLastPoint, ...todayPoints] : todayPoints
  return points.slice(1).reduce((total, point, index) => total + straightLineDistanceMeters(points[index], point), 0)
}

function formatMovement(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km`
  return `${Math.round(meters)} m`
}

function CreateTripDialog({ onClose }: { onClose: () => void }) {
  const createTrip = useTripStore((s) => s.createTrip)
  const today = new Date().toISOString().slice(0, 10)
  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [budget, setBudget] = useState('')
  const [error, setError] = useState('')
  const daysCount = Math.max(
    1,
    Math.floor(
      (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) /
        86400000,
    ) + 1,
  )

  function submit() {
    if (endDate < startDate) {
      setError('返程日期不能早于出发日期')
      return
    }
    createTrip({
      name,
      destination,
      startDate,
      endDate,
      totalBudget: budget === '' ? undefined : Number(budget),
    })
    onClose()
  }

  return (
    <ModalShell
      title="创建旅程"
      description="先确定去哪里和哪几天，名称会自动生成。"
      onClose={onClose}
      size="md"
      mobile="fullscreen"
      footer={<>
        <button onClick={onClose} className={overlaySecondaryButtonClass}>取消</button>
        <button onClick={submit} className={overlayPrimaryButtonClass}>创建并开始规划</button>
      </>}
    >
      <div className="flex flex-col gap-4">
          <label className="text-[12px] font-medium text-text-muted">
            主要目的地
            <input
              autoFocus
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="例如：大阪、京都、奈良"
              className="mt-1.5 w-full rounded-md border border-border px-3 py-2.5 text-[14px] font-normal text-text outline-none focus:border-accent"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-medium text-text-muted">
              出发日期
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const nextStartDate = e.target.value
                  setStartDate(nextStartDate)
                  if (endDate < nextStartDate) setEndDate(nextStartDate)
                  setError('')
                }}
                className="mt-1.5 w-full rounded-md border border-border px-2.5 py-2 text-[13px] font-normal text-text outline-none focus:border-accent"
              />
            </label>
            <label className="text-[12px] font-medium text-text-muted">
              返程日期
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setError('')
                }}
                className="mt-1.5 w-full rounded-md border border-border px-2.5 py-2 text-[13px] font-normal text-text outline-none focus:border-accent"
              />
            </label>
          </div>
          <div className="rounded-md bg-accent-soft px-3 py-2 text-[12px] text-accent-hover">
            将自动创建 <span className="font-semibold">{daysCount} 天</span>的连续行程，从 {displayDate(startDate)} 到 {displayDate(endDate)}。
          </div>
          <details className="group rounded-lg border border-border/80 bg-surface/60">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[12.5px] font-medium text-text-muted [&::-webkit-details-marker]:hidden">
              更多选项 <span className="text-[11px] text-text-faint transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-border/70 px-3 py-3">
              <label className="text-[12px] font-medium text-text-muted">
                旅程名称 <span className="font-normal text-text-faint">（不填则按目的地生成）</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={destination.trim() ? `${destination.trim()}之旅` : '例如：日本关西之旅'}
                  className="mt-1.5 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] font-normal text-text outline-none focus:border-accent"
                />
              </label>
              <label className="text-[12px] font-medium text-text-muted">
                总预算 <span className="font-normal text-text-faint">（可选）</span>
                <div className="relative mt-1.5">
                  <span className="absolute top-2 left-3 text-[13px] text-text-faint">¥</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="例如：12000"
                    className="w-full rounded-md border border-border bg-white py-2 pr-3 pl-7 text-[13px] font-normal text-text outline-none focus:border-accent"
                  />
                </div>
              </label>
            </div>
          </details>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>
    </ModalShell>
  )
}

// 旅程切换器：点击展开下拉，支持切换 / 重命名 / 新建 / 删除
function TripSwitcher({ compact = false }: { compact?: boolean }) {
  const { trips, activeTripId, switchTrip, deleteTrip, renameTrip } = useTripStore()
  const trip = useActiveTrip()
  const [open, setOpen] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const askConfirm = useConfirmStore((s) => s.ask)
  const boxRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function confirmRename(id: string) {
    if (renameDraft.trim()) renameTrip(id, renameDraft)
    setRenamingId(null)
  }

  return (
    <div ref={boxRef} className={compact ? 'relative min-w-0 flex-1' : 'relative px-5'}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full min-w-0 items-center gap-2 rounded-lg text-left transition-colors ${
          compact
            ? 'px-2 py-1.5 active:bg-surface-2'
            : 'border border-border bg-white px-3 py-2.5 hover:border-accent/60'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{trip.name}</div>
          <div className={`${compact ? 'text-[10.5px]' : 'mt-0.5 text-[12px]'} text-text-muted`}>{trip.days.length} 天</div>
        </div>
        <ChevronDownIcon size={14} />
      </button>

      {open && (
        <div className={`z-[950] max-h-[min(360px,60dvh)] overflow-y-auto rounded-lg border border-border bg-white py-1.5 shadow-lg ${compact ? 'fixed top-[62px] right-3 left-3' : 'absolute top-full left-5 mt-1 w-[calc(100%-40px)]'}`}>
          {trips.map((t) => {
            const active = t.id === activeTripId
            const renaming = renamingId === t.id
            return (
              <div
                key={t.id}
                className={`group flex items-center gap-1 px-2 py-1.5 ${active ? 'bg-accent-soft' : 'hover:bg-surface'}`}
              >
                {renaming ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => confirmRename(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename(t.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    className="min-w-0 flex-1 rounded border border-accent px-1.5 py-1 text-[13px] outline-none"
                  />
                ) : (
                  <>
                    <button
                      onClick={() => {
                        if (!active) switchTrip(t.id)
                        else setOpen(false)
                      }}
                      onDoubleClick={() => {
                        setRenamingId(t.id)
                        setRenameDraft(t.name)
                      }}
                      className="min-w-0 flex-1 truncate text-left text-[13px]"
                      title={active ? '双击可重命名' : undefined}
                    >
                      <span className={active ? 'font-medium text-accent-hover' : ''}>{t.name}</span>
                      <span className="ml-1.5 text-[11px] text-text-faint">{t.days.length}天</span>
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(t.id)
                        setRenameDraft(t.name)
                      }}
                      className="shrink-0 rounded p-1 text-text-faint transition-colors hover:bg-accent-soft hover:text-accent"
                      title="重命名"
                    >
                      <EditIcon size={12} />
                    </button>
                    {trips.length > 1 && (
                      <button
                        onClick={() =>
                          askConfirm({
                            title: `删除旅程「${t.name}」？`,
                            message: '其全部行程和花费将一并删除。',
                            onConfirm: () => {
                              const { trips, activeTripId } = useTripStore.getState()
                              deleteTrip(t.id)
                              useToastStore.getState().show(`已删除旅程「${t.name}」`, {
                                undo: () => useTripStore.getState().restoreTrips(trips, activeTripId),
                              })
                            },
                          })
                        }
                        className="shrink-0 rounded p-1 text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                        title="删除旅程"
                      >
                        <TrashIcon size={12} />
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}
          <div className="mt-1 border-t border-border pt-1">
            <button
              onClick={() => {
                setOpen(false)
                setShowCreateDialog(true)
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-[13px] text-text-muted transition-colors hover:text-accent"
            >
              <PlusIcon size={14} /> 新建旅程
            </button>
          </div>
        </div>
      )}
      {showCreateDialog && <CreateTripDialog onClose={() => setShowCreateDialog(false)} />}
    </div>
  )
}

export function MobileHeader({ onExport, exporting }: { onExport: () => void; exporting: boolean }) {
  const { view, setView } = useTripStore()

  return (
    <header className="trip-topbar mobile-safe-top relative z-[900] flex shrink-0 items-center gap-1.5 border-b border-border px-3 pb-2 backdrop-blur md:hidden">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center" aria-label="北向">
        <LogoIcon size={36} />
      </div>
      <TripSwitcher compact />
      <button
        onClick={onExport}
        disabled={exporting}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted active:bg-accent-soft active:text-accent disabled:opacity-50"
        aria-label={exporting ? '正在生成行程卡片' : '导出行程卡片'}
        title="导出行程卡片"
      >
        <DownloadIcon size={18} />
      </button>
      <button
        onClick={() => setView(view === 'settings' ? 'plan' : 'settings')}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${view === 'settings' ? 'bg-accent-soft text-accent-hover' : 'text-text-muted active:bg-accent-soft active:text-accent'}`}
        aria-label={view === 'settings' ? '返回行程' : '打开设置'}
        title={view === 'settings' ? '返回行程' : '设置'}
      >
        <SettingsIcon size={18} />
      </button>
    </header>
  )
}

export default function Sidebar() {
  const { view, setView, planTab, setPlanTab, activeDayId, setActiveDay, selectActivity, scheduleWishPlace, addDay, copyDay } =
    useTripStore()
  const trip = useActiveTrip()
  const [dropDayId, setDropDayId] = useState<string | null>(null)
  const [expandedDayId, setExpandedDayId] = useState(activeDayId)
  const [showAddDayOptions, setShowAddDayOptions] = useState(false)
  const [customWidth, setCustomWidth] = useState<number | null>(savedSidebarWidth)
  const [isResizing, setIsResizing] = useState(false)
  const isWishlist = view === 'plan' && planTab === 'places'
  const sidebarWidth = customWidth ?? (isWishlist ? 310 : 240)

  useEffect(() => {
    if (!isWishlist || trip.days.some((day) => day.id === expandedDayId)) return
    setExpandedDayId(activeDayId || trip.days[0]?.id || '')
  }, [activeDayId, expandedDayId, isWishlist, trip.days])

  function scheduleDroppedWish(event: DragEvent<HTMLElement>, day: TripDay) {
    event.preventDefault()
    setDropDayId(null)
    const placeId = event.dataTransfer.getData('application/x-tripnote-wish-id')
    const place = trip.wishPlaces.find((item) => item.id === placeId)
    if (!place) return
    const time = nextActivityTime(trip, day.id)
    const scheduled = scheduleWishPlace(place.id, day.id, {
      time,
      title: place.title,
      category: place.category,
      location: place.location,
      note: place.note,
      geo: place.geo,
    })
    if (!scheduled) return
    useToastStore.getState().show(`已安排「${place.title}」到 ${day.label} · ${time}`)
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    setIsResizing(true)
    const startX = event.clientX
    const startWidth = sidebarWidth
    let nextWidth = startWidth
    const maxWidth = Math.min(420, Math.max(280, window.innerWidth * 0.42))
    const onMove = (moveEvent: PointerEvent) => {
      nextWidth = Math.max(220, Math.min(maxWidth, startWidth + moveEvent.clientX - startX))
      setCustomWidth(nextWidth)
    }
    const onEnd = () => {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(nextWidth)))
      setIsResizing(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd, { once: true })
  }

  return (
    <aside style={{ width: sidebarWidth }} className={`relative hidden h-full shrink-0 flex-col border-r border-border/80 bg-[#f8f9f9] transition-[width] ${isResizing ? 'duration-0' : 'duration-200'} md:flex`}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <div className="flex h-10 w-10 items-center justify-center">
          <LogoIcon size={40} />
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight tracking-[0.08em]">北向</div>
          <div className="mt-1 text-[9px] font-medium leading-tight tracking-[0.18em] text-text-faint">NORTHWARD</div>
        </div>
      </div>

      {/* 旅程切换 */}
      <TripSwitcher />

      {/* 天列表 */}
      <nav className="mt-3 flex-1 overflow-y-auto px-3">
        <div className="mb-2.5 flex items-center justify-between px-2">
          <span className="text-[10px] font-semibold tracking-[0.16em] text-text-faint">行程目录</span>
          <span className="text-[11px] font-medium tabular-nums text-text-muted">{trip.days.length} 天</span>
        </div>
        <div className="relative">
        {trip.days.map((d, index) => {
          const active = d.id === activeDayId && view === 'plan' && planTab === 'timeline'
          const activityCount = trip.activities.filter((activity) => activity.dayId === d.id).length
          const geoCount = trip.activities.filter((activity) => activity.dayId === d.id && activity.geo).length
          const dayCost = trip.activities
            .filter((activity) => activity.dayId === d.id)
            .reduce((sum, activity) => sum + activity.costs.reduce((costSum, cost) => costSum + cost.amount, 0), 0)
          const movementMeters = dayMovementMeters(trip, index)
          const dayItems = activitiesByDay(trip, d.id)
          const expanded = isWishlist && expandedDayId === d.id
          const date = /^\d{4}-\d{2}-\d{2}$/.test(d.date)
            ? displayDate(d.date).split(' ')[0]
            : d.date !== '待定'
              ? d.date
              : '待定日期'
          return (
            <div
              key={d.id}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
                setDropDayId(d.id)
              }}
              onDragLeave={() => setDropDayId((id) => (id === d.id ? null : id))}
              onDrop={(event) => scheduleDroppedWish(event, d)}
              className={`relative mb-1 overflow-hidden rounded-md border-l-2 transition-[background-color,border-color,box-shadow] ${
                dropDayId === d.id
                  ? 'border-action bg-accent text-white shadow-[0_3px_10px_rgba(32,40,46,0.12)]'
                  : active
                  ? 'border-action bg-white text-text shadow-[0_1px_4px_rgba(32,40,46,0.06)]'
                  : expanded
                  ? 'border-border bg-white/90 text-text shadow-[0_3px_12px_rgba(39,50,58,0.045)]'
                  : 'border-transparent text-text-muted hover:bg-white/70'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5 px-2.5 py-2.5">
                <button
                  onClick={() => {
                    if (isWishlist) {
                      setExpandedDayId(d.id)
                      return
                    }
                    setActiveDay(d.id)
                    setView('plan')
                    setPlanTab('timeline')
                    selectActivity(null)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span className={`relative z-10 w-7 shrink-0 text-[10px] font-semibold tracking-[0.08em] tabular-nums ${
                    dropDayId === d.id
                      ? 'text-white/80'
                      : active
                        ? 'text-action'
                        : 'text-text-faint'
                  }`}>
                    D{String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold">{d.place || '待定地点'}</span>
                      <span className={`shrink-0 text-[11px] ${dropDayId === d.id ? 'text-white/75' : 'text-text-muted'}`}>{date}</span>
                    </span>
                    <span className={`mt-0.5 block text-[11px] ${dropDayId === d.id ? 'text-white/75' : 'text-text-faint'}`}>
                      {d.label} · {geoCount} 个地点{dayCost > 0 ? ` · ¥${dayCost.toLocaleString()}` : ` · ${activityCount} 个安排`}
                    </span>
                    {movementMeters > 0 && (
                      <span className={`mt-0.5 block text-[10.5px] tabular-nums ${dropDayId === d.id ? 'text-white/70' : 'text-text-muted'}`}>
                        移动约 {formatMovement(movementMeters)}
                      </span>
                    )}
                  </span>
                </button>
                {isWishlist && (
                  <button
                    onClick={() => setExpandedDayId((id) => id === d.id ? '' : d.id)}
                    className={`shrink-0 rounded p-1 transition-colors ${dropDayId === d.id ? 'text-white hover:bg-white/15' : 'text-text-faint hover:bg-surface-2 hover:text-text'}`}
                    aria-label={`${expanded ? '收起' : '展开'}${d.label}安排`}
                    title={`${expanded ? '收起' : '展开'}当天安排`}
                  >
                    <ChevronDownIcon size={15} className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                )}
              </div>
              {expanded && (
                <div className={`mx-2 mb-2 rounded-md border px-2.5 py-2.5 ${dropDayId === d.id ? 'border-white/25 bg-white/10' : 'border-border/80 bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]'}`}>
                  <div className={`mb-1.5 flex items-center justify-between text-[9.5px] font-semibold tracking-[0.12em] ${dropDayId === d.id ? 'text-white/65' : 'text-text-faint'}`}>
                    <span>当天安排</span>
                    <span className="tracking-normal tabular-nums">{dayItems.length} 项</span>
                  </div>
                  {dayItems.length > 0 ? (
                    <div className="space-y-0.5">
                      {dayItems.slice(0, 4).map((activity) => (
                        <div key={activity.id} className={`flex min-w-0 items-center gap-2 rounded px-1.5 py-1 text-[11.5px] ${dropDayId === d.id ? 'text-white/88' : 'text-text-muted'}`}>
                          <span className={`w-9 shrink-0 tabular-nums ${dropDayId === d.id ? 'text-white/65' : 'text-text-faint'}`}>{activity.time}</span>
                          <span className="truncate font-medium">{activity.title}</span>
                        </div>
                      ))}
                      {dayItems.length > 4 && <div className={`px-1.5 pt-0.5 pl-11 text-[10.5px] ${dropDayId === d.id ? 'text-white/65' : 'text-text-faint'}`}>还有 {dayItems.length - 4} 项安排</div>}
                    </div>
                  ) : (
                    <div className={`px-1.5 py-1 text-[11.5px] ${dropDayId === d.id ? 'text-white/75' : 'text-text-faint'}`}>当天还没有安排。</div>
                  )}
                  <div className={`mt-2 rounded border border-dashed px-2.5 py-1.5 text-[10.5px] font-medium ${dropDayId === d.id ? 'border-white/40 bg-white/10 text-white' : 'border-accent/35 bg-accent-soft/55 text-accent-hover'}`}>
                    拖到这里安排 · 建议 {nextActivityTime(trip, d.id)}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        </div>
        <div className="relative mt-2">
          <button
            onClick={() => setShowAddDayOptions((open) => !open)}
            className="flex w-full items-center gap-2.5 rounded-md border border-transparent bg-surface-2/70 px-3 py-2.5 text-[12.5px] font-medium text-text-muted transition-colors hover:border-border hover:bg-white hover:text-text"
          >
            <PlusIcon size={15} /> 添加一天
          </button>
          {showAddDayOptions && (
            <div className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-full rounded-lg border border-border bg-white p-1.5 shadow-lg">
              <button
                onClick={() => {
                  addDay()
                  setShowAddDayOptions(false)
                  useToastStore.getState().show('已添加空白一天')
                }}
                className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-[12px] text-text-muted hover:bg-surface-2"
              >
                空白一天
              </button>
              <button
                disabled={!trip.days.length}
                onClick={() => {
                  const previousDay = trip.days.at(-1)
                  if (previousDay) copyDay(previousDay.id)
                  setShowAddDayOptions(false)
                  useToastStore.getState().show('已复制上一天的地点与安排')
                }}
                className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-[12px] text-text-muted hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                复制上一天
              </button>
            </div>
          )}
        </div>
      </nav>
      <div
        role="separator"
        aria-label="调整左侧栏宽度"
        aria-orientation="vertical"
        title="拖动调整左侧栏宽度"
        onPointerDown={startResize}
        className="group absolute top-0 right-[-5px] z-30 hidden h-full w-2 cursor-col-resize touch-none items-center justify-center md:flex"
      >
        <span className="h-12 w-px rounded-full bg-transparent transition-colors group-hover:bg-accent/70 group-active:bg-accent" />
      </div>

      {/* 底部导航 */}
      <nav className="border-t border-border/80 p-3">
        {NAV_ITEMS.map(({ key, label, Icon }) => {
          const active = view === key
          return (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-md border-l-2 px-2.5 py-2 text-[13px] transition-colors ${
                active
                  ? 'border-action bg-white font-medium text-text'
                  : 'border-transparent text-text-muted hover:bg-white/70'
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
