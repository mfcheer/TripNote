import { useEffect, useRef, useState } from 'react'
import { useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS, ClockIcon, CoinIcon, EditIcon, NoteIcon, PinIcon, TrashIcon } from './Icons'
import { useConfirmStore } from './confirmStore'
import { useToastStore } from './toastStore'
import { CATEGORY_META, type Activity } from '../types'

// 备注输入：本地草稿，失焦或卸载时写入 store（避免每次按键触发整树重渲染）
function NoteField({ value, onSave }: { value: string; onSave: (note: string) => void }) {
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(draft)
  draftRef.current = draft

  // 组件卸载兜底：面板被收起/切换时 DOM 移除不触发 blur
  useEffect(
    () => () => {
      if (draftRef.current !== value) onSave(draftRef.current)
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      placeholder="点击填写备注…"
      className="w-full resize-none border-none bg-transparent text-[13px] leading-relaxed outline-none placeholder:text-text-faint"
      rows={3}
    />
  )
}

// 单笔花费行：说明 + 金额本地草稿，失焦或卸载时提交（DOM 移除不触发 blur）
function CostRow({
  title,
  amount,
  onTitleChange,
  onAmountChange,
  onRemove,
}: {
  title: string
  amount: number
  onTitleChange: (t: string) => void
  onAmountChange: (a: number) => void
  onRemove: () => void
}) {
  const [titleDraft, setTitleDraft] = useState(title)
  const [amountDraft, setAmountDraft] = useState(String(amount))

  const latest = useRef({ titleDraft, amountDraft, title, amount })
  latest.current = { titleDraft, amountDraft, title, amount }

  useEffect(
    () => () => {
      const cur = latest.current
      if (cur.titleDraft !== cur.title) onTitleChange(cur.titleDraft)
      const v = parseFloat(cur.amountDraft)
      const n = isNaN(v) ? 0 : v
      if (n !== cur.amount) onAmountChange(n)
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  function commitAmount() {
    const v = parseFloat(amountDraft)
    const n = isNaN(v) ? 0 : v
    if (n !== amount) onAmountChange(n)
    if (amountDraft !== String(n)) setAmountDraft(String(n))
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={() => titleDraft !== title && onTitleChange(titleDraft)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder="说明，如：门票"
        className="min-w-0 flex-1 rounded border border-transparent bg-white/70 px-2 py-1 text-[12.5px] outline-none focus:border-accent"
      />
      <input
        value={amountDraft}
        onChange={(e) => setAmountDraft(e.target.value)}
        onBlur={commitAmount}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        inputMode="decimal"
        className="w-[72px] rounded border border-transparent bg-white/70 px-2 py-1 text-right text-[12.5px] tabular-nums outline-none focus:border-accent"
      />
      <button
        onClick={onRemove}
        className="rounded p-1 text-text-faint transition-colors hover:text-red-500"
        title="删除该笔花费"
      >
        <TrashIcon size={13} />
      </button>
    </div>
  )
}

// 内嵌详情：展开在时间轴卡片下方（与添加/编辑同区域）
export default function InlineActivityDetail({ activity }: { activity: Activity }) {
  const { updateActivity, reorderActivity, addCost, updateCost, removeCost, setEditingActivity, selectActivity, removeActivity } =
    useTripStore()
  const trip = useActiveTrip()
  const askConfirm = useConfirmStore((s) => s.ask)
  const meta = CATEGORY_META[activity.category]
  const Icon = CATEGORY_ICONS[activity.category]

  return (
    <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
      {/* 头部：编辑 / 收起 */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: meta.color }}>
          <Icon size={13} />
          <span className="font-medium">{meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditingActivity(activity.id)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-accent transition-colors hover:bg-accent-soft"
          >
            <EditIcon size={12} /> 编辑
          </button>
          <button
            onClick={() => selectActivity(null)}
            className="rounded px-1.5 py-0.5 text-[12px] text-text-muted transition-colors hover:bg-surface-2"
          >
            收起
          </button>
        </div>
      </div>

      {/* 信息行 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <ClockIcon size={13} /> {activity.time}
          {activity.endTime && ` - ${activity.endTime}`}
          {activity.duration && <span className="text-text-faint">（{activity.duration}）</span>}
        </span>
        {activity.location && (
          <span className="flex min-w-0 items-center gap-1.5">
            <PinIcon size={13} /> <span className="truncate">{activity.location}</span>
          </span>
        )}
      </div>

      {/* 花费管理：一个条目可记多笔 */}
      <div className="mt-3 rounded-lg border border-border bg-white p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
          <CoinIcon size={13} /> 花费
          {activity.costs.length > 0 && (
            <span className="ml-1 tabular-nums">
              共 ¥{activity.costs.reduce((s, c) => s + c.amount, 0).toLocaleString()}（{activity.costs.length}笔）
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {activity.costs.map((c) => (
            <CostRow
              key={c.id}
              title={c.title ?? ''}
              amount={c.amount}
              onTitleChange={(t) => updateCost(activity.id, c.id, { title: t })}
              onAmountChange={(a) => updateCost(activity.id, c.id, { amount: a })}
              onRemove={() => removeCost(activity.id, c.id)}
            />
          ))}
          <button
            onClick={() => addCost(activity.id, { amount: 0 })}
            className="rounded-md border border-dashed border-border px-2 py-1 text-[12px] text-text-muted transition-colors hover:border-accent hover:text-accent"
          >
            ＋ 添加花费
          </button>
        </div>
      </div>

      {/* 备注：失焦即时保存 */}
      <div className="mt-2.5 rounded-lg border border-border bg-white p-2.5">
        <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
          <NoteIcon size={13} /> 备注
        </div>
        <NoteField
          key={activity.id}
          value={activity.note ?? ''}
          onSave={(note) => updateActivity(activity.id, { note })}
        />
      </div>

      {/* 底部操作：跨天移动 / 删除 */}
      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-text-faint">移动到</span>
          {trip.days
            .filter((d) => d.id !== activity.dayId)
            .map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  const items = useTripStore
                    .getState()
                    .trips.find((t) => t.id === useTripStore.getState().activeTripId)!
                    .activities.filter((a) => a.dayId === d.id)
                  reorderActivity(activity.id, d.id, items.length)
                }}
                className="rounded-md border border-border bg-white px-2 py-0.5 text-[12px] text-text-muted transition-colors hover:border-accent hover:text-accent"
              >
                {d.label}
              </button>
            ))}
        </div>
        <button
          onClick={() =>
            askConfirm({
            title: `删除「${activity.title}」？`,
            message: '该行程及其全部花费将一并删除。',
            onConfirm: () => {
              const { trips, activeTripId } = useTripStore.getState()
              removeActivity(activity.id)
              useToastStore.getState().show(`已删除「${activity.title}」`, {
                undo: () => useTripStore.getState().restoreTrips(trips, activeTripId),
              })
            },
          })
          }
          className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-text-faint transition-colors hover:text-red-500"
        >
          <TrashIcon size={13} /> 删除
        </button>
      </div>
    </div>
  )
}
