import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS, EditIcon } from './Icons'
import { CATEGORY_META, type ActivityCategory } from '../types'

const DONUT_COLORS: Record<ActivityCategory, string> = {
  stay: '#0d9488',
  traffic: '#f59e0b',
  food: '#ec4899',
  sight: '#8b5cf6',
  shop: '#6b7280',
}

// 预算行：从行程条目的花费聚合而来（预算不可在此页添加，请到行程条目中添加花费）
interface BudgetRow {
  costId: string
  activityId: string
  category: ActivityCategory
  activityTitle: string
  costTitle: string
  amount: number
  dayLabel: string
}

export default function BudgetView() {
  const { focusActivity, setBudget } = useTripStore()
  const trip = useActiveTrip()
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState('')

  const rows: BudgetRow[] = useMemo(
    () =>
      trip.activities.flatMap((a) => {
        const day = trip.days.find((d) => d.id === a.dayId)
        return a.costs.map((c) => ({
          costId: c.id,
          activityId: a.id,
          category: a.category,
          activityTitle: a.title,
          costTitle: c.title ?? '',
          amount: c.amount,
          dayLabel: day ? day.label : '—',
        }))
      }),
    [trip],
  )

  const totalPlanned = rows.reduce((s, r) => s + r.amount, 0)
  const remain = trip.totalBudget - totalPlanned

  const byCategory = (Object.keys(CATEGORY_META) as ActivityCategory[])
    .map((cat) => ({
      cat,
      total: rows.filter((r) => r.category === cat).reduce((s, r) => s + r.amount, 0),
    }))
    .filter((d) => d.total > 0)

  const hasData = byCategory.length > 0

  return (
    <div className="mx-auto max-w-[860px] px-8 pt-8 pb-10">
      {/* 头部 */}
      <div className="mb-5 flex items-center justify-between">
        <p className="text-[12px] leading-relaxed text-text-faint">
          预算自动聚合自各行程条目的花费（一个条目可记多笔）；要记账，请到行程中对应条目下添加。
        </p>
        <button
          onClick={() => {
            const data = JSON.stringify(
              rows.map((r) => ({
                分类: CATEGORY_META[r.category].label,
                条目: r.activityTitle,
                花费: r.costTitle,
                金额: r.amount,
                日程: r.dayLabel,
              })),
              null,
              2,
            )
            const blob = new Blob([data], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = '预算明细.json'
            a.click()
            URL.revokeObjectURL(url)
          }}
          className="shrink-0 rounded-md border border-border px-3.5 py-1.5 text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          导出
        </button>
      </div>

      {/* 概览三卡 */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-text-muted">总预算</span>
            {!editingBudget && (
              <button
                onClick={() => {
                  setBudgetDraft(String(trip.totalBudget))
                  setEditingBudget(true)
                }}
                className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-text-faint transition-colors hover:text-accent"
                title="修改总预算"
              >
                <EditIcon size={11} /> 修改
              </button>
            )}
          </div>
          {editingBudget ? (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[18px] font-semibold">¥</span>
              <input
                autoFocus
                type="number"
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                onBlur={() => {
                  setBudget(Math.max(0, Number(budgetDraft) || 0))
                  setEditingBudget(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditingBudget(false)
                }}
                className="w-[120px] rounded-md border border-accent px-2 py-0.5 text-[18px] font-semibold tabular-nums outline-none"
              />
            </div>
          ) : (
            <div className="mt-1 text-[24px] font-semibold tabular-nums">
              ¥{trip.totalBudget.toLocaleString()}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="text-[12px] text-text-muted">已规划</div>
          <div className="mt-1 text-[24px] font-semibold tabular-nums text-accent">
            ¥{totalPlanned.toLocaleString()}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.min(100, (totalPlanned / trip.totalBudget) * 100)}%` }}
            />
          </div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="text-[12px] text-text-muted">剩余</div>
          <div className={`mt-1 text-[24px] font-semibold tabular-nums ${remain < 0 ? 'text-red-500' : ''}`}>
            ¥{remain.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[300px_1fr] gap-6">
        {/* 分类占比 */}
        <div className="rounded-lg border border-border p-4">
          <div className="mb-1 text-[13px] font-semibold">分类占比</div>
          {hasData ? (
            <>
              <div className="h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="total"
                      nameKey="cat"
                      innerRadius={55}
                      outerRadius={82}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {byCategory.map((d) => (
                        <Cell key={d.cat} fill={DONUT_COLORS[d.cat]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {byCategory.map((d) => (
                  <div key={d.cat} className="flex items-center gap-2 text-[12.5px]">
                    <span className="h-2 w-2 rounded-full" style={{ background: DONUT_COLORS[d.cat] }} />
                    <span className="text-text-muted">{CATEGORY_META[d.cat].label}</span>
                    <span className="ml-auto tabular-nums">
                      ¥{d.total.toLocaleString()}
                      <span className="ml-1.5 text-text-faint">
                        {Math.round((d.total / totalPlanned) * 100)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-[190px] items-center justify-center text-[12px] text-text-faint">
              暂无花费记录
            </div>
          )}
        </div>

        {/* 明细表 */}
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[12px] text-text-muted">
                <th className="px-4 py-2.5 font-medium">分类</th>
                <th className="px-4 py-2.5 font-medium">条目</th>
                <th className="px-4 py-2.5 font-medium">花费</th>
                <th className="px-4 py-2.5 text-right font-medium">金额</th>
                <th className="px-4 py-2.5 font-medium">日程</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = CATEGORY_META[r.category]
                const Icon = CATEGORY_ICONS[r.category]
                return (
                  <tr
                    key={r.costId}
                    className="cursor-pointer border-b border-border last:border-none hover:bg-surface/60"
                    onClick={() => {
                      focusActivity(r.activityId)
                    }}
                    title="点击定位到行程条目"
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px]"
                        style={{ background: meta.soft, color: meta.color }}
                      >
                        <Icon size={12} /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{r.activityTitle}</td>
                    <td className="px-4 py-2.5 text-text-muted">{r.costTitle || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">¥{r.amount.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-text-muted">{r.dayLabel}</td>
                  </tr>
                )
              })}
              <tr className="bg-surface/60">
                <td className="px-4 py-2.5 font-medium" colSpan={3}>
                  合计
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-accent">
                  ¥{totalPlanned.toLocaleString()}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
