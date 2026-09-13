import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type GeoResult } from '../api/geocode'
import { CATEGORY_ICONS, MapIcon } from './Icons'
import MapPicker from './MapPicker'
import { CATEGORY_META, type Activity, type ActivityCategory, type GeoPoint } from '../types'
import { useTripStore } from '../store'

export interface ActivityFormValues {
  time: string
  title: string
  category: ActivityCategory
  location?: string
  firstCost?: number // 首笔花费金额
  duration?: string
  durationMinutes?: number
  endTime?: string
  note?: string
  geo?: GeoPoint
}

function parseDurationMinutes(value?: string): number | undefined {
  if (!value) return undefined
  const hours = value.match(/(\d+(?:\.\d+)?)\s*小时/)
  const minutes = value.match(/(\d+)\s*分钟/)
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
  return total > 0 ? total : undefined
}

function formatDuration(minutes: number) {
  if (minutes % 60 === 0) return `${minutes / 60}小时`
  if (minutes > 60) return `${Math.floor(minutes / 60)}小时${minutes % 60}分钟`
  return `${minutes}分钟`
}

function addMinutes(time: string, minutes: number) {
  const [hours, mins] = time.split(':').map(Number)
  const total = ((hours || 0) * 60 + (mins || 0) + minutes) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const inputCls =
  'min-h-10 rounded-md border border-border bg-white px-3 py-2 text-[13px] text-text outline-none transition-colors focus:border-accent'
const labelCls = 'text-[11.5px] font-medium text-text-muted'

// 行程条目表单：新增与编辑共用（展示与交互保持一致）
export default function ActivityForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onDraftChange,
  stickyActions = false,
}: {
  initial?: Partial<ActivityFormValues>
  submitLabel: string
  onSubmit: (values: ActivityFormValues) => void
  onCancel: () => void
  // 编辑模式：表单变化/卸载时上报草稿（防切换丢输入）
  onDraftChange?: (values: ActivityFormValues) => void
  stickyActions?: boolean
}) {
  const amapWebServiceKey = useTripStore((state) => state.amapWebServiceKey)
  const [form, setForm] = useState({
    time: initial?.time ?? '09:00',
    title: initial?.title ?? '',
    category: initial?.category ?? ('sight' as ActivityCategory),
    location: initial?.location ?? '',
    cost: initial?.firstCost != null ? String(initial.firstCost) : '',
    duration: String(initial?.durationMinutes ?? parseDurationMinutes(initial?.duration) ?? ''),
    note: initial?.note ?? '',
  })
  // 地理编码状态
  const [geoResults, setGeoResults] = useState<GeoResult[]>([])
  const [geoIndex, setGeoIndex] = useState(-1)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geo, setGeo] = useState<GeoPoint | undefined>(initial?.geo)
  const [geoLabel, setGeoLabel] = useState('') // 已解析提示
  const [showMapPicker, setShowMapPicker] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 地点输入防抖 → Nominatim 搜索
  function onLocationChange(value: string) {
    setForm((f) => ({ ...f, location: value }))
    setGeo(undefined)
    setGeoLabel('')
    setGeoIndex(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setGeoResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setGeoLoading(true)
      try {
        const results = await searchPlaces(value.trim(), ctrl.signal, amapWebServiceKey)
        setGeoResults(results)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setGeoResults([])
      } finally {
        setGeoLoading(false)
      }
    }, 500)
  }

  // 选中一个候选地点
  function pickGeo(r: GeoResult) {
    setGeo({ lat: r.lat, lng: r.lng })
    setGeoLabel(r.label)
    setGeoResults([])
    setGeoIndex(-1)
  }

  // 汇总当前表单值（草稿上报与提交共用）
  function currentValues(): ActivityFormValues {
    const durationMinutes = Number(form.duration) > 0 ? Math.round(Number(form.duration)) : undefined
    return {
      time: form.time || '09:00',
      title: form.title.trim(),
      category: form.category,
      location: form.location.trim() || undefined,
      firstCost: form.cost ? Number(form.cost) : undefined,
      duration: durationMinutes ? formatDuration(durationMinutes) : undefined,
      durationMinutes,
      endTime: durationMinutes ? addMinutes(form.time || '09:00', durationMinutes) : undefined,
      note: form.note.trim() || undefined,
      geo,
    }
  }

  // 表单变化时上报草稿（编辑模式防丢）
  useEffect(() => {
    if (onDraftChange) onDraftChange(currentValues())
  }, [form, geo]) // eslint-disable-line react-hooks/exhaustive-deps

  // 卸载时最后上报一次草稿（切换天/视图时表单被移除的场景）
  const draftRef = useRef(onDraftChange)
  draftRef.current = onDraftChange
  const valuesRef = useRef(currentValues)
  valuesRef.current = currentValues
  useEffect(() => {
    return () => draftRef.current?.(valuesRef.current())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 花费输入：只允许非负数字
  function onCostChange(v: string) {
    const cleaned = v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
    setForm((f) => ({ ...f, cost: cleaned }))
  }

  function submit() {
    if (!form.title.trim()) return
    onSubmit(currentValues())
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3 sm:grid-cols-[116px_1fr]">
        <label className={labelCls}>
          时间
          <input
            type="time"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
            className={`${inputCls} mt-1.5 w-full tabular-nums`}
          />
        </label>
        <label className={labelCls}>
          安排名称
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="例如：京都塔"
            className={`${inputCls} mt-1.5 w-full`}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
      </div>
      {/* 分类选择 */}
      <div>
        <div className={`${labelCls} mb-1.5`}>分类</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORY_META) as ActivityCategory[]).map((c) => {
            const meta = CATEGORY_META[c]
            const Icon = CATEGORY_ICONS[c]
            const active = form.category === c
            return (
              <button
                type="button"
                key={c}
                onClick={() => setForm({ ...form, category: c })}
                className="flex min-h-9 items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] transition-colors"
                style={{
                  background: active ? meta.soft : 'transparent',
                  color: active ? meta.color : 'var(--color-text-muted)',
                  border: `1px solid ${active ? meta.color + '55' : 'var(--color-border)'}`,
                }}
              >
                <Icon size={13} /> {meta.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* 地点输入 + 地理编码候选 */}
        <label className={`${labelCls} relative sm:col-span-2`}>
          地点 <span className="font-normal text-text-faint">（选填）</span>
          <div className="relative mt-1.5">
          <input
            value={form.location}
            onChange={(e) => onLocationChange(e.target.value)}
            onKeyDown={(e) => {
              if (geoResults.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setGeoIndex((i) => Math.min(i + 1, geoResults.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setGeoIndex((i) => Math.max(i - 1, -1))
                } else if (e.key === 'Enter' && geoIndex >= 0) {
                  e.preventDefault()
                  pickGeo(geoResults[geoIndex])
                }
              }
            }}
            placeholder="输入地点名称，可自动定位地图"
            className={`${inputCls} w-full`}
          />
          {geoLoading && (
            <span className="absolute top-2 right-2.5 text-[11px] text-text-faint">搜索中…</span>
          )}
          {geoLabel && (
            <div
              className="absolute top-1 right-2 h-4 w-4 rounded-full bg-accent text-center text-[10px] leading-4 text-white"
              title={geoLabel}
            >
              ✓
            </div>
          )}
          {geoResults.length > 0 && (
            <ul className="absolute top-full left-0 z-20 mt-1 w-[320px] max-w-full max-h-[220px] overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-lg">
              {geoResults.map((r, i) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button
                    onClick={() => pickGeo(r)}
                    onMouseEnter={() => setGeoIndex(i)}
                    className={`block w-full px-3 py-2 text-left text-[12.5px] leading-snug ${
                      i === geoIndex ? 'bg-accent-soft text-accent-hover' : 'hover:bg-surface'
                    }`}
                  >
                    <div className="truncate font-medium">{r.label.split(',')[0]}</div>
                    <div className="mt-0.5 truncate text-[11px] text-text-faint">{r.label}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>
        </label>
        <label className={labelCls}>
          预计时长 <span className="font-normal text-text-faint">（选填）</span>
          <div className="relative mt-1.5">
          <input
            value={form.duration}
            onChange={(e) => setForm({ ...form, duration: e.target.value.replace(/[^\d]/g, '') })}
            placeholder="例如：90"
            inputMode="numeric"
            className={`${inputCls} w-full pr-9 tabular-nums`}
          />
          <span className="absolute top-3 right-3 text-[12px] text-text-faint">分钟</span>
          </div>
        </label>
        <label className={labelCls}>
          花费 <span className="font-normal text-text-faint">（选填）</span>
          <div className="relative mt-1.5">
            <span className="absolute top-2.5 left-3 text-[13px] text-text-faint">¥</span>
            <input
              value={form.cost}
              onChange={(e) => onCostChange(e.target.value)}
              placeholder="0"
              type="number"
              min="0"
              className={`${inputCls} w-full pl-7 tabular-nums`}
            />
          </div>
        </label>
        <button
          type="button"
          onClick={() => setShowMapPicker(!showMapPicker)}
          className={`flex min-h-10 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] transition-colors sm:col-span-2 sm:justify-start ${
            showMapPicker
              ? 'border-accent bg-accent-soft text-accent-hover'
              : 'border-border text-text-muted hover:border-accent hover:text-accent'
          }`}
        >
          <MapIcon size={14} /> {showMapPicker ? '收起地图' : '在地图上选择位置'}
        </button>
      </div>
      {/* 地图手动选点 */}
      {showMapPicker && (
        <MapPicker
          point={geo}
          label={form.location}
          onPick={(p, label) => {
            setGeo(p)
            setGeoLabel(label)
            setGeoResults([])
            if (label) setForm((f) => ({ ...f, location: label.split(',')[0] }))
          }}
        />
      )}
      <label className={labelCls}>
        备注 <span className="font-normal text-text-faint">（选填）</span>
        <textarea
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="交通提醒、预约信息或其他备注"
          rows={2}
          className={`${inputCls} mt-1.5 w-full resize-none leading-relaxed`}
        />
      </label>
      <div className={`flex items-center justify-end gap-2 border-t border-border/80 ${stickyActions ? 'sticky bottom-0 z-10 bg-white py-3 shadow-[0_-8px_16px_rgba(255,255,255,0.96)]' : 'pt-3'}`}>
        <button
          onClick={onCancel}
          className="min-h-10 rounded-md border border-border bg-white px-4 py-2 text-[13px] font-medium text-text-muted hover:bg-surface-2 hover:text-text"
        >
          取消
        </button>
        <button
          onClick={submit}
          disabled={!form.title.trim()}
          className="min-h-10 rounded-md bg-action px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

// 从 Activity 提取表单初始值
export function activityToFormValues(a: Activity): Partial<ActivityFormValues> {
  return {
    time: a.time,
    title: a.title,
    category: a.category,
    location: a.location,
    firstCost: a.costs[0]?.amount,
    duration: a.duration,
    durationMinutes: a.durationMinutes ?? parseDurationMinutes(a.duration),
    endTime: a.endTime,
    note: a.note,
    geo: a.geo,
  }
}
