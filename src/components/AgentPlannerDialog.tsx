import { useMemo, useState } from 'react'
import { requestAgentPlan, type AgentPlanInput } from '../api/agent'
import { useActiveTrip, useTripStore } from '../store'
import type { AgentPlanDraft } from '../types'
import ModalShell, { overlayPrimaryButtonClass, overlaySecondaryButtonClass } from './OverlayShell'
import { useToastStore } from './toastStore'

const today = new Date().toISOString().slice(0, 10)
type AssistantIntent = 'create' | 'revise' | 'check'

const intentMeta: Record<AssistantIntent, { title: string; description: string; action: string }> = {
  create: { title: '从一句话开始', description: '告诉我想去哪、玩几天、喜欢什么，我会先做一份可编辑草案。', action: '生成旅行草案' },
  revise: { title: '调整当前旅行', description: '说说想怎么改，我会保留合理安排并给出一份变更建议。', action: '生成调整建议' },
  check: { title: '检查当前行程', description: '我会检查节奏、跨城移动与待确认地点，并给出一份更顺的建议。', action: '检查并给出建议' },
}

function activityNames(values: Array<{ title: string }>) {
  return values.map((item) => item.title.trim()).filter(Boolean)
}

function isDayChanged(before: { place: string; activities: Array<{ title: string }> } | undefined, after: { place: string; activities: Array<{ title: string }> }) {
  if (!before) return true
  return before.place.trim() !== after.place.trim() || activityNames(before.activities).join('\u0000') !== activityNames(after.activities).join('\u0000')
}

function guessedDays(text: string, fallback: number) {
  const match = text.match(/(\d{1,2})\s*天/)
  if (match) return Math.max(1, Math.min(30, Number(match[1])))
  const chinese = text.match(/([一二三四五六七八九十])\s*天/)
  const values: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  return chinese ? values[chinese[1]] : fallback
}

export default function AgentPlannerDialog({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const trip = useActiveTrip()
  const { agentServiceUrl, agentAccessToken, agentConversations, addAgentConversationTurn, clearAgentConversation, createTripFromAgentDraft, applyAgentDraftToCurrent, restoreTrips, trips, activeTripId } = useTripStore()
  const [intent, setIntent] = useState<AssistantIntent>('create')
  const [message, setMessage] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [input, setInput] = useState<AgentPlanInput>({
    mode: 'create', destination: trip.searchRegion || trip.days[0]?.place || '', days: Math.max(1, Math.min(14, trip.days.length || 3)),
    startDate: trip.days[0]?.date && /^\d{4}-\d{2}-\d{2}$/.test(trip.days[0].date) ? trip.days[0].date : today,
    transport: '方式不限', preferences: '',
  })
  const [draft, setDraft] = useState<AgentPlanDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const revising = intent !== 'create'
  const meta = intentMeta[intent]
  const conversation = agentConversations[trip.id] ?? []

  const preparedInput = useMemo<AgentPlanInput>(() => ({
    ...input,
    mode: revising ? 'revise' : 'create',
    // 新旅行时把自然语言需求交给模型理解，避免先填一排参数；调整时保留当前旅行区域。
    destination: revising ? (trip.searchRegion || trip.days[0]?.place || trip.name) : message.trim(),
    days: guessedDays(message, input.days),
    preferences: intent === 'check'
      ? `请检查当前旅行的时间安排、跨城移动、地点距离与待确认项，并给出更顺的完整建议。用户补充：${message.trim()}`
      : message.trim(),
  }), [input, intent, message, revising, trip])

  function changeIntent(next: AssistantIntent) {
    setIntent(next)
    setError('')
    setMessage(next === 'create' ? '' : next === 'check' ? '帮我检查一下行程是否太赶、交通是否合理。' : '')
  }

  async function generate() {
    if (!message.trim()) return setError(revising ? '告诉我你希望怎么调整或检查' : '说说这次旅行想怎么安排')
    if (!agentServiceUrl) return setError('请先连接规划助手服务')
    setBusy(true)
    setError('')
    try {
      const nextDraft = await requestAgentPlan(agentServiceUrl, preparedInput, trip, undefined, agentAccessToken, conversation)
      setDraft(nextDraft)
      addAgentConversationTurn(trip.id, {
        intent,
        request: message.trim(),
        responseSummary: `${nextDraft.tripName} · ${nextDraft.days.length} 天${nextDraft.warnings.length ? ` · ${nextDraft.warnings.length} 项待确认` : ''}`,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成建议失败，请稍后重试')
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

  function applyToCurrentTrip() {
    if (!draft) return
    const snapshot = trips
    const previousActiveTripId = activeTripId
    applyAgentDraftToCurrent({ ...draft, tripName: trip.name })
    useToastStore.getState().show('已应用助手建议到当前旅行', {
      undo: () => { restoreTrips(snapshot, previousActiveTripId); useToastStore.getState().show('已恢复调整前的旅行', { tone: 'neutral' }) },
    })
    onClose()
  }

  const changedDays = draft && revising ? draft.days.filter((day, index) => isDayChanged({
    place: trip.days[index]?.place ?? '', activities: trip.activities.filter((activity) => activity.dayId === trip.days[index]?.id),
  }, day)).length : 0
  const locatedCount = draft?.days.flatMap((day) => day.activities).filter((activity) => activity.geo).length ?? 0

  if (draft) return <ModalShell title={revising ? '这是我整理后的建议' : '这份旅行可以这样开始'} description={revising ? `相对当前行程，建议调整 ${changedDays} 天；应用前仍可继续提要求。` : '先看重点与每天的安排，确认后才会写入旅行。'} onClose={onClose} size="lg" mobile="sheet" footer={revising ? <><button onClick={() => setDraft(null)} className={overlaySecondaryButtonClass}>继续调整</button><button onClick={applyDraft} className={overlaySecondaryButtonClass}>另存为新旅行</button><button onClick={applyToCurrentTrip} className={overlayPrimaryButtonClass}>应用建议</button></> : <><button onClick={() => setDraft(null)} className={overlaySecondaryButtonClass}>继续完善</button><button onClick={applyDraft} className={overlayPrimaryButtonClass}>创建这份旅行</button></>}>
    <div className="space-y-4">
      <section className="rounded-2xl border border-action/15 bg-[linear-gradient(135deg,rgba(238,247,253,.9),rgba(255,255,255,.96))] px-4 py-3.5">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[15px] font-semibold text-text">{draft.tripName}</div><div className="mt-1 text-[12px] text-text-muted">{draft.days.length} 天{draft.totalBudget ? ` · 预计 ¥${draft.totalBudget.toLocaleString()}` : ''}{locatedCount ? ` · 已定位 ${locatedCount} 个地点` : ''}</div></div><span className="rounded-full bg-white/80 px-2.5 py-1 text-[10.5px] font-medium text-accent-hover">草案</span></div>
        {draft.assumptions.length > 0 && <p className="mt-2.5 text-[11.5px] leading-relaxed text-text-muted">{draft.assumptions.slice(0, 2).join('；')}</p>}
      </section>
      {draft.warnings.length > 0 && <section className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-3 text-[11.5px] leading-relaxed text-amber-900"><div className="font-semibold">需要你确认</div><div className="mt-1">{draft.warnings.join('；')}</div></section>}
      {(draft.checks?.length ?? 0) > 0 && <section className="rounded-xl border border-border/75 bg-surface/65 px-3.5 py-3"><div className="text-[12px] font-semibold text-text">我已经帮你核验</div><div className="mt-2 space-y-2">{draft.checks!.map((check, index) => <div key={`${check.kind}-${index}`} className="text-[11px] leading-relaxed text-text-muted"><span className={`mr-1.5 font-medium ${check.tone === 'warning' ? 'text-amber-700' : 'text-accent-hover'}`}>{check.tone === 'warning' ? '需留意' : '已完成'} · {check.title}</span>{check.detail}</div>)}</div></section>}
      <section className="space-y-2">{draft.days.map((day, index) => {
        const before = trip.days[index]
        const beforeActivities = before ? trip.activities.filter((activity) => activity.dayId === before.id) : []
        const changed = isDayChanged(before ? { place: before.place, activities: beforeActivities } : undefined, day)
        const activities = day.activities.slice(0, 3)
        return <article key={`${day.date}-${index}`} className={`rounded-xl border bg-white px-3.5 py-3 ${revising && changed ? 'border-action/30' : 'border-border/75'}`}>
          <div className="flex items-center gap-2"><span className="text-[10.5px] font-semibold tracking-[.08em] text-accent">D{String(index + 1).padStart(2, '0')}</span><span className="truncate text-[13px] font-semibold text-text">{day.place}</span>{revising && <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] ${changed ? 'bg-action-soft text-accent-hover' : 'bg-surface-2 text-text-faint'}`}>{changed ? '建议调整' : '保持不变'}</span>}</div>
          {revising && changed && before && <div className="mt-2 text-[10.5px] text-text-faint">原安排：{activityNames(beforeActivities).join('、') || '暂无安排'}</div>}
          <div className="mt-2 space-y-1.5 text-[11.5px] text-text-muted">{activities.map((activity, activityIndex) => <div key={`${activity.time}-${activityIndex}`} className="flex gap-3"><span className="w-10 shrink-0 tabular-nums text-text-faint">{activity.time}</span><span className="truncate">{activity.title}</span></div>)}{day.activities.length > activities.length && <div className="pl-[52px] text-text-faint">还有 {day.activities.length - activities.length} 项安排</div>}</div>
        </article>
      })}</section>
    </div>
  </ModalShell>

  return <ModalShell title="北极熊旅行助手" description="不替代手动编排；先把想法说出来，我来整理成可确认的建议。" onClose={onClose} size="md" mobile="sheet" footer={<><button onClick={onClose} className={overlaySecondaryButtonClass}>取消</button><button onClick={generate} disabled={busy || !agentServiceUrl} className={overlayPrimaryButtonClass}>{busy ? '正在整理…' : meta.action}</button></>}>
    <div className="space-y-4">
      {!agentServiceUrl && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] leading-relaxed text-amber-800">还没有连接助手服务。手动规划不受影响；连接后才能生成建议。<button onClick={onOpenSettings} className="ml-1 font-semibold underline underline-offset-2">去设置连接</button></div>}
      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-2/80 p-1.5">
        {(Object.keys(intentMeta) as AssistantIntent[]).map((key) => <button key={key} onClick={() => changeIntent(key)} className={`rounded-[10px] px-2 py-2 text-[11.5px] font-medium transition-colors ${intent === key ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>{key === 'create' ? '规划旅行' : key === 'revise' ? '调整行程' : '检查行程'}</button>)}
      </div>
      {conversation.length > 0 && <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-[10.5px] text-text-faint"><span>已记住本次旅行最近 {conversation.length} 次助手建议（仅此浏览器）</span><button onClick={() => { clearAgentConversation(trip.id); useToastStore.getState().show('已清除本次旅行的助手对话记录', { tone: 'neutral' }) }} className="shrink-0 font-medium text-text-muted hover:text-text">清除</button></div>}
      <section className="rounded-xl border border-border/75 bg-white px-3.5 py-3"><div className="text-[13px] font-semibold text-text">{meta.title}</div><p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">{meta.description}</p><textarea autoFocus value={message} onChange={(event) => setMessage(event.target.value)} placeholder={revising ? (intent === 'check' ? '例如：每天不要太赶，重点看看交通和步行距离。' : '例如：第 3 天改成轻松一点，长白山多住一晚。') : '例如：去东北吉林玩 3 天，自驾，自然风景优先，每天别太赶。'} className="mt-3 min-h-24 w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-relaxed text-text outline-none placeholder:text-text-faint" /></section>
      <div className="flex flex-wrap gap-2">{(revising ? ['第 3 天别太赶', '减少步行', '把长白山多留一天'] : ['东北吉林 3 天，轻松自驾', '济州岛 4 天，咖啡和海边', '关西 5 天，亲子慢游']).map((suggestion) => <button key={suggestion} onClick={() => setMessage(suggestion)} className="rounded-full border border-border bg-white px-2.5 py-1 text-[10.5px] text-text-muted transition-colors hover:border-accent/30 hover:text-accent">{suggestion}</button>)}</div>
      <button onClick={() => setDetailsOpen((value) => !value)} className="text-[11.5px] font-medium text-text-muted hover:text-text">{detailsOpen ? '收起旅行细节' : '补充日期、天数和交通方式（可选）'}</button>
      {detailsOpen && <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface p-3"><label className="text-[11px] font-medium text-text-muted">出发日期<input type="date" value={input.startDate} onChange={(event) => setInput({ ...input, startDate: event.target.value })} className="mt-1.5 w-full rounded-md border border-border bg-white px-2 py-2 text-[12px] font-normal outline-none focus:border-accent" /></label><label className="text-[11px] font-medium text-text-muted">计划天数<input type="number" min="1" max="30" value={input.days} onChange={(event) => setInput({ ...input, days: Math.max(1, Math.min(30, Number(event.target.value) || 1)) })} className="mt-1.5 w-full rounded-md border border-border bg-white px-2 py-2 text-[12px] font-normal outline-none focus:border-accent" /></label><label className="col-span-2 text-[11px] font-medium text-text-muted">出行方式<input value={input.transport} onChange={(event) => setInput({ ...input, transport: event.target.value })} placeholder="例如：自驾、公共交通" className="mt-1.5 w-full rounded-md border border-border bg-white px-2.5 py-2 text-[12px] font-normal outline-none focus:border-accent" /></label></div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-600">{error}</div>}
    </div>
  </ModalShell>
}
