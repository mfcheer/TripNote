import { useState } from 'react'
import { requestAgentPlan, type AgentPlanInput } from '../api/agent'
import { useActiveTrip, useTripStore } from '../store'
import type { AgentPlanDraft } from '../types'
import ModalShell, { overlayPrimaryButtonClass, overlaySecondaryButtonClass } from './OverlayShell'
import { useToastStore } from './toastStore'

const today = new Date().toISOString().slice(0, 10)

export default function AgentPlannerDialog({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const trip = useActiveTrip()
  const { agentServiceUrl, createTripFromAgentDraft } = useTripStore()
  const [input, setInput] = useState<AgentPlanInput>({
    destination: trip.searchRegion || trip.days[0]?.place || '', days: Math.max(1, Math.min(14, trip.days.length || 3)),
    startDate: trip.days[0]?.date && /^\d{4}-\d{2}-\d{2}$/.test(trip.days[0].date) ? trip.days[0].date : today,
    transport: '自驾 / 公共交通均可', preferences: '',
  })
  const [draft, setDraft] = useState<AgentPlanDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    if (!input.destination.trim()) return setError('请先填写目的地或旅行区域')
    setBusy(true)
    setError('')
    try {
      setDraft(await requestAgentPlan(agentServiceUrl, input, trip))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成草案失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  function applyDraft() {
    if (!draft) return
    createTripFromAgentDraft(draft)
    useToastStore.getState().show(`已创建「${draft.tripName}」，可继续逐项编辑`)
    onClose()
  }

  if (draft) return <ModalShell title="确认旅行草案" description="确认后会创建一份新的旅行，不会修改当前行程。" onClose={onClose} size="lg" mobile="sheet" footer={<><button onClick={() => setDraft(null)} className={overlaySecondaryButtonClass}>返回修改</button><button onClick={applyDraft} className={overlayPrimaryButtonClass}>创建这份旅行</button></>}>
    <div className="space-y-4">
      <div className="rounded-xl border border-action/15 bg-action-soft/35 px-4 py-3"><div className="text-[15px] font-semibold text-text">{draft.tripName}</div><div className="mt-1 text-[12px] text-text-muted">{draft.days.length} 天{draft.totalBudget ? ` · 预计 ¥${draft.totalBudget.toLocaleString()}` : ''}</div></div>
      <div className="space-y-2.5">{draft.days.map((day, index) => <div key={`${day.date}-${index}`} className="rounded-lg border border-border/80 bg-white px-3.5 py-3"><div className="text-[12.5px] font-semibold text-text">第 {index + 1} 天 · {day.place}</div><div className="mt-1.5 space-y-1 text-[11.5px] text-text-muted">{day.activities.map((activity, activityIndex) => <div key={`${activity.time}-${activityIndex}`} className="flex gap-3"><span className="w-10 shrink-0 tabular-nums text-text-faint">{activity.time}</span><span>{activity.title}</span></div>)}</div></div>)}</div>
      {draft.assumptions.length > 0 && <div className="rounded-lg bg-surface px-3 py-2.5 text-[11.5px] leading-relaxed text-text-muted">规划假设：{draft.assumptions.join('；')}</div>}
      {draft.warnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-800">需要留意：{draft.warnings.join('；')}</div>}
    </div>
  </ModalShell>

  return <ModalShell title="让助手帮我规划" description="用一句想法生成可编辑草案；生成前不会改变你的旅行。" onClose={onClose} size="md" mobile="sheet" footer={<><button onClick={onClose} className={overlaySecondaryButtonClass}>取消</button><button onClick={generate} disabled={busy} className={overlayPrimaryButtonClass}>{busy ? '正在生成…' : '生成草案'}</button></>}>
    <div className="space-y-4">
      {!agentServiceUrl && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] leading-relaxed text-amber-800">尚未连接规划助手服务。手动规划不受影响；连接服务后才能生成 AI 草案。<button onClick={onOpenSettings} className="ml-1 font-semibold underline underline-offset-2">去设置连接</button></div>}
      <label className="block text-[12px] font-medium text-text-muted">目的地或旅行区域<input autoFocus value={input.destination} onChange={(event) => setInput({ ...input, destination: event.target.value })} placeholder="例如：东北吉林、济州岛、关西" className="mt-1.5 w-full rounded-md border border-border px-3 py-2.5 text-[13px] font-normal text-text outline-none focus:border-accent" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-[12px] font-medium text-text-muted">出发日期<input type="date" value={input.startDate} onChange={(event) => setInput({ ...input, startDate: event.target.value })} className="mt-1.5 w-full rounded-md border border-border px-2.5 py-2 text-[12px] font-normal outline-none focus:border-accent" /></label><label className="text-[12px] font-medium text-text-muted">计划天数<input type="number" min="1" max="30" value={input.days} onChange={(event) => setInput({ ...input, days: Math.max(1, Math.min(30, Number(event.target.value) || 1)) })} className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-[13px] font-normal outline-none focus:border-accent" /></label></div>
      <label className="block text-[12px] font-medium text-text-muted">出行方式<input value={input.transport} onChange={(event) => setInput({ ...input, transport: event.target.value })} placeholder="例如：自驾、公共交通、轻松步行" className="mt-1.5 w-full rounded-md border border-border px-3 py-2.5 text-[13px] font-normal outline-none focus:border-accent" /></label>
      <label className="block text-[12px] font-medium text-text-muted">偏好与必去地点 <span className="font-normal text-text-faint">（可选）</span><textarea value={input.preferences} onChange={(event) => setInput({ ...input, preferences: event.target.value })} placeholder="例如：一定去长白山；自然风景优先；每天不赶路；预算 3000 元" className="mt-1.5 min-h-20 w-full resize-none rounded-md border border-border px-3 py-2.5 text-[13px] font-normal outline-none focus:border-accent" /></label>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-600">{error}</div>}
    </div>
  </ModalShell>
}
