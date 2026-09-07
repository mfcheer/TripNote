import { useEffect, useRef, useState } from 'react'
import type { DragEvent, ReactElement } from 'react'
import { useActiveTrip, useTripStore, displayDate, nextActivityTime } from '../store'
import type { TripDay, ViewKey } from '../types'
import { CalendarIcon, ChevronDownIcon, DownloadIcon, EditIcon, LogoIcon, PlusIcon, SettingsIcon, TrashIcon } from './Icons'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'

const NAV_ITEMS: { key: ViewKey; label: string; Icon: (p: { size?: number }) => ReactElement }[] = [
  { key: 'plan', label: '行程规划', Icon: CalendarIcon },
  { key: 'settings', label: '设置', Icon: SettingsIcon },
]

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="创建旅程">
      <div className="max-h-[calc(100vh-32px)] w-full max-w-[440px] overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-1 text-[18px] font-semibold">创建旅程</div>
        <p className="mb-4 text-[12.5px] leading-relaxed text-text-muted">
          填好目的地和日期后，会自动生成每天的行程框架，之后再逐条补充安排即可。
        </p>
        <div className="flex flex-col gap-3">
          <label className="text-[12px] font-medium text-text-muted">
            旅程名称 <span className="font-normal text-text-faint">（可选）</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：日本关西之旅"
              className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] font-normal text-text outline-none focus:border-accent"
            />
          </label>
          <label className="text-[12px] font-medium text-text-muted">
            主要目的地 <span className="font-normal text-text-faint">（可选）</span>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="例如：大阪、京都、奈良"
              className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] font-normal text-text outline-none focus:border-accent"
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
                className="w-full rounded-md border border-border py-2 pr-3 pl-7 text-[13px] font-normal text-text outline-none focus:border-accent"
              />
            </div>
          </label>
          {error && <p className="text-[12px] text-red-500">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3.5 py-2 text-[13px] text-text-muted hover:bg-surface">
            取消
          </button>
          <button onClick={submit} className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-hover">
            创建并开始规划
          </button>
        </div>
      </div>
    </div>
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
        <div className={`absolute top-full z-[650] mt-1 rounded-lg border border-border bg-white py-1.5 shadow-lg ${compact ? 'left-0 w-[min(280px,calc(100vw-32px))]' : 'left-5 w-[calc(100%-40px)]'}`}>
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
    <header className="mobile-safe-top flex shrink-0 items-center gap-1.5 border-b border-border bg-surface/95 px-3 pb-2 backdrop-blur md:hidden">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-[#f8fafd] text-accent-hover shadow-[0_2px_8px_rgba(31,50,76,0.06)]" aria-label="途记">
        <LogoIcon size={21} />
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
  const { view, setView, planTab, setPlanTab, activeDayId, setActiveDay, selectActivity, scheduleWishPlace } =
    useTripStore()
  const trip = useActiveTrip()
  const [dropDayId, setDropDayId] = useState<string | null>(null)

  function scheduleDroppedWish(event: DragEvent<HTMLButtonElement>, day: TripDay) {
    event.preventDefault()
    setDropDayId(null)
    const placeId = event.dataTransfer.getData('application/x-tripnote-wish-id')
    const place = trip.wishPlaces.find((item) => item.id === placeId)
    if (!place) return
    const time = nextActivityTime(trip, day.id)
    const activityId = scheduleWishPlace(place.id, day.id, {
      time,
      title: place.title,
      category: place.category,
      location: place.location,
      note: place.note,
      geo: place.geo,
    })
    if (!activityId) return
    setView('plan')
    setPlanTab('timeline')
    selectActivity(activityId)
    useToastStore.getState().show(`已安排「${place.title}」到 ${day.label} · ${time}`)
  }

  return (
    <aside className="hidden h-full w-[252px] shrink-0 flex-col border-r border-border bg-surface md:flex">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-border bg-[#f8fafd] text-accent-hover shadow-[0_4px_12px_rgba(31,50,76,0.08)]">
          <LogoIcon size={23} />
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight tracking-[0.02em]">途记</div>
          <div className="mt-0.5 text-[10.5px] leading-tight tracking-[0.08em] text-text-faint">TripNote</div>
        </div>
      </div>

      {/* 旅程切换 */}
      <TripSwitcher />

      {/* 天列表 */}
      <nav className="mt-3 flex-1 overflow-y-auto px-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-faint">行程目录</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium text-text-muted">{trip.days.length} 天</span>
        </div>
        <div className="relative">
          {trip.days.length > 1 && <div className="absolute top-5 bottom-6 left-[23px] w-px bg-border" />}
        {trip.days.map((d, index) => {
          const active = d.id === activeDayId && view === 'plan' && planTab === 'timeline'
          const activityCount = trip.activities.filter((activity) => activity.dayId === d.id).length
          const date = /^\d{4}-\d{2}-\d{2}$/.test(d.date)
            ? displayDate(d.date).split(' ')[0]
            : d.date !== '待定'
              ? d.date
              : '待定日期'
          return (
            <button
              key={d.id}
              onClick={() => {
                setActiveDay(d.id)
                setView('plan')
                setPlanTab('timeline')
                selectActivity(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
                setDropDayId(d.id)
              }}
              onDragLeave={() => setDropDayId((id) => (id === d.id ? null : id))}
              onDrop={(event) => scheduleDroppedWish(event, d)}
              className={`relative mb-1 flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                dropDayId === d.id
                  ? 'bg-accent text-white shadow-[0_2px_8px_rgba(65,95,136,0.22)]'
                  : active
                  ? 'bg-accent-soft text-accent-hover'
                  : 'text-text-muted hover:bg-surface-2'
              }`}
            >
              <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums ${
                dropDayId === d.id
                  ? 'border-white/45 bg-white/15 text-white'
                  : active
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-white text-text-muted'
              }`}>
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[12.5px] font-medium">{d.place || '待定地点'}</span>
                  <span className={`shrink-0 text-[10.5px] ${dropDayId === d.id ? 'text-white/75' : 'text-text-faint'}`}>{date}</span>
                </span>
                <span className={`mt-0.5 block text-[10.5px] ${dropDayId === d.id ? 'text-white/75' : active ? 'text-accent/75' : 'text-text-faint'}`}>
                  {d.label} · {activityCount} 个安排
                </span>
              </span>
            </button>
          )
        })}
        </div>
        <button
          onClick={() => {
            const previousLastDay = trip.days.at(-1)
            useTripStore.getState().addDay()
            const newDay = useTripStore.getState().trips
              .find((item) => item.id === trip.id)
              ?.days.at(-1)
            useToastStore.getState().show(
              newDay?.date && newDay.date !== '待定'
                ? `已在${previousLastDay?.label ?? '最后一天'}后添加 ${displayDate(newDay.date)}`
                : '已添加一天，可继续设置日期和地点',
            )
          }}
          className="mt-2 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <PlusIcon size={15} /> 添加一天
        </button>
      </nav>

      {/* 底部导航 */}
      <nav className="border-t border-border p-3">
        {NAV_ITEMS.map(({ key, label, Icon }) => {
          const active = view === key
          return (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                active
                  ? 'bg-accent-soft font-medium text-accent-hover'
                  : 'text-text-muted hover:bg-surface-2'
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
