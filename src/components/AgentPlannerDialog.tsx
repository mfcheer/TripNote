import { useState } from 'react'
import { requestAgentPlan, type AgentPlanInput } from '../api/agent'
import { useActiveTrip, useTripStore } from '../store'
import type { AgentPlanDraft } from '../types'
import ModalShell, { overlayPrimaryButtonClass, overlaySecondaryButtonClass } from './OverlayShell'
import { useToastStore } from './toastStore'

const today = new Date().toISOString().slice(0, 10)

function activityNames(values: Array<{ title: string }>) {
  return values.map((item) => item.title.trim()).filter(Boolean)
}

function isDayChanged(before: { place: string; activities: Array<{ title: string }> } | undefined, after: { place: string; activities: Array<{ title: string }> }) {
  if (!before) return true
  return before.place.trim() !== after.place.trim()
    || activityNames(before.activities).join('\u0000') !== activityNames(after.activities).join('\u0000')
}

export default function AgentPlannerDialog({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const trip = useActiveTrip()
  const { agentServiceUrl, agentAccessToken, createTripFromAgentDraft, applyAgentDraftToCurrent, restoreTrips, trips, activeTripId } = useTripStore()
  const [input, setInput] = useState<AgentPlanInput>({
    mode: 'create',
    destination: trip.searchRegion || trip.days[0]?.place || '', days: Math.max(1, Math.min(14, trip.days.length || 3)),
    startDate: trip.days[0]?.date && /^\d{4}-\d{2}-\d{2}$/.test(trip.days[0].date) ? trip.days[0].date : today,
    transport: '自驾 / 公共交通均可', preferences: '',
  })
  const [draft, setDraft] = useState<AgentPlanDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const revising = input.mode === 'revise'

  async function generate() {
    if (!input.destination.trim()) return setError('请先填写目的地或旅行区域')
    setBusy(true)
    setError('')
    try {
      setDraft(await requestAgentPlan(agentServiceUrl, input, trip, undefined, agentAccessToken))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成草案失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  function applyDraft() {
    if (!draft) return
    const nextDraft = revising && draft.tripName === trip.name ? { ...draft, tripName: `${trip.name}（调整稿）` } : draft
    createTripFromAgentDraft(nextDraft)
    useToastStore.getState().show(`已创建「${nextDraft.tripName}」，可继续逐项编辑`)
    onClose()
  }

  function applyToCurrentTrip() {
    if (!draft) return
    const snapshot = trips
    const previousActiveTripId = activeTripId
    // 当前旅行始终保留名称；Agent 的建议只调整其日期、地点、事项与预算。
    applyAgentDraftToCurrent({ ...draft, tripName: trip.name })
    useToastStore.getState().show('已应用助手调整到当前旅行', {
      undo: () => {
        restoreTrips(snapshot, previousActiveTripId)
        useToastStore.getState().show('已恢复调整前的旅行', { tone: 'neutral' })
      },
    })
    onClose()
  }

  const changedDays = draft && revising
    ? draft.days.filter((day, index) => isDayChanged({
      place: trip.days[index]?.place ?? '',
      activities: trip.activities.filter((activity) => activity.dayId === trip.days[index]?.id),
    }, day)).length
    : 0

  if (draft) return <ModalShell title={revising ? '确认行程调整' : '确认旅行草案'} description={revising ? '默认应用到当前旅行，可撤销；也可以另存为一份新旅行。' : '确认后会创建一份新的旅行，不会修改当前行程。'} onClose={onClose} size="lg" mobile="sheet" footer={revising ? <><button onClick={() => setDraft(null)} className={overlaySecondaryButtonClass}>返回修改</button><button onClick={applyDraft} className={overlaySecondaryButtonClass}>另存为新旅行</button><button onClick={applyToCurrentTrip} className={overlayPrimaryButtonClass}>应用到当前旅行</button></> : <><button onClick={() => setDraft(null)} className={overlaySecondaryButtonClass}>返回修改</button><button onClick={applyDraft} className={overlayPrimaryButtonClass}>创建这份旅行</button></>}>
    <div className="space-y-4">
      <div className="rounded-xl border border-action/15 bg-action-soft/35 px-4 py-3"><div className="text-[15px] font-semibold text-text">{draft.tripName}</div><div className="mt-1 text-[12px] text-text-muted">{draft.days.length} 天{draft.totalBudget ? ` · 预计 ¥${draft.totalBudget.toLocaleString()}` : ''}{revising ? ` · 调整 ${changedDays} 天` : ''}</div></div>
      {revising && <div className="rounded-lg border border-border/80 bg-surface px-3 py-2.5 text-[11.5px] leading-relaxed text-text-muted">以下按天对比当前旅行与助手草案。原行程会完整保留，确认后只创建一份新的调整稿。</div>}
      <div className="space-y-2.5">{draft.days.map((day, index) => {
        const before = trip.days[index]
        const beforeActivities = before ? trip.activities.filter((activity) => activity.dayId === before.id) : []
        const changed = isDayChanged(before ? { place: before.place, activities: beforeActivities } : undefined, day)
        return <div key={`${day.date}-${index}`} className={`rounded-lg border bg-white px-3.5 py-3 ${revising && changed ? 'border-action/35' : 'border-border/80'}`}>
          <div className="flex items-center justify-between gap-3"><div className="truncate text-[12.5px] font-semibold text-text">第 {index + 1} 天 · {day.place}</div>{revising && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${changed ? 'bg-action-soft text-accent-hover' : 'bg-surface-2 text-text-faint'}`}>{changed ? '有调整' : '基本不变'}</span>}</div>
          {revising && changed && before && <div className="mt-2 rounded-md bg-surface px-2.5 py-2 text-[10.5px] leading-relaxed text-text-faint"><div>原：{before.place || '未定'} · {activityNames(beforeActivities).join('、') || '暂无安排'}</div><div className="mt-1 text-text-muted">调整后：{day.place} · {activityNames(day.activities).join('、') || '暂无安排'}</div></div>}
          <div className="mt-1.5 space-y-1 text-[11.5px] text-text-muted">{day.activities.map((activity, activityIndex) => <div key={`${activity.time}-${activityIndex}`} className="flex gap-3"><span className="w-10 shrink-0 tabular-nums text-text-faint">{activity.time}</span><span>{activity.title}</span></div>)}</div>
        </div>
      })}</div>
      {draft.assumptions.length > 0 && <div className="rounded-lg bg-surface px-3 py-2.5 text-[11.5px] leading-relaxed text-text-muted">规划假设：{draft.assumptions.join('；')}</div>}
      {draft.warnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-800">需要留意：{draft.warnings.join('；')}</div>}
    </div>
  </ModalShell>

  return <ModalShell title={revising ? '让助手调整行程' : '让助手帮我规划'} description={revising ? '基于当前旅行生成一份调整后的副本，原行程不变。' : '用一句想法生成可编辑草案；生成前不会改变你的旅行。'} onClose={onClose} size="md" mobile="sheet" footer={<><button onClick={onClose} className={overlaySecondaryButtonClass}>取消</button><button onClick={generate} disabled={busy} className={overlayPrimaryButtonClass}>{busy ? '正在生成…' : revising ? '生成调整副本' : '生成草案'}</button></>}>
    <div className="space-y-4">
      {!agentServiceUrl && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] leading-relaxed text-amber-800">尚未连接规划助手服务。手动规划不受影响；连接服务后才能生成 AI 草案。<button onClick={onOpenSettings} className="ml-1 font-semibold underline underline-offset-2">去设置连接</button></div>}
      <div className="grid grid-cols-2 rounded-lg bg-surface-2/80 p-1"><button onClick={() => setInput({ ...input, mode: 'create' })} className={`rounded-md px-2 py-2 text-[12px] font-medium ${!revising ? 'bg-white text-text shadow-sm' : 'text-text-muted'}`}>新建旅行</button><button onClick={() => setInput({ ...input, mode: 'revise' })} className={`rounded-md px-2 py-2 text-[12px] font-medium ${revising ? 'bg-white text-text shadow-sm' : 'text-text-muted'}`}>调整当前旅行</button></div>
      <label className="block text-[12px] font-medium text-text-muted">目的地或旅行区域<input autoFocus value={input.destination} onChange={(event) => setInput({ ...input, destination: event.target.value })} placeholder="例如：东北吉林、济州岛、关西" className="mt-1.5 w-full rounded-md border border-border px-3 py-2.5 text-[13px] font-normal text-text outline-none focus:border-accent" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-[12px] font-medium text-text-muted">出发日期<input type="date" value={input.startDate} onChange={(event) => setInput({ ...input, startDate: event.target.value })} className="mt-1.5 w-full rounded-md border border-border px-2.5 py-2 text-[12px] font-normal outline-none focus:border-accent" /></label><label className="text-[12px] font-medium text-text-muted">计划天数<input type="number" min="1" max="30" value={input.days} onChange={(event) => setInput({ ...input, days: Math.max(1, Math.min(30, Number(event.target.value) || 1)) })} className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] font-normal outline-none focus:border-accent" /></label></div>
      <label className="block text-[12px] font-medium text-text-muted">出行方式<input value={input.transport} onChange={(event) => setInput({ ...input, transport: event.target.value })} placeholder="例如：自驾、公共交通、轻松步行" className="mt-1.5 w-full rounded-md border border-border px-3 py-2.5 text-[13px] font-normal outline-none focus:border-accent" /></label>
      <label className="block text-[12px] font-medium text-text-muted">{revising ? '想怎么调整' : '偏好与必去地点'} <span className="font-normal text-text-faint">（可选）</span><textarea value={input.preferences} onChange={(event) => setInput({ ...input, preferences: event.target.value })} placeholder={revising ? '例如：第 4 天太赶，拆成两天；长白山多住一晚；每天花费控制在 600 元内' : '例如：一定去长白山；自然风景优先；每天不赶路；预算 3000 元'} className="mt-1.5 min-h-20 w-full resize-none rounded-md border border-border px-3 py-2.5 text-[13px] font-normal outline-none focus:border-accent" /></label>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-600">{error}</div>}
    </div>
  </ModalShell>
}
