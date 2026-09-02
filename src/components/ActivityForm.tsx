import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type GeoResult } from '../api/geocode'
import { CATEGORY_ICONS } from './Icons'
import MapPicker from './MapPicker'
import { CATEGORY_META, type Activity, type ActivityCategory, type GeoPoint } from '../types'

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
  'rounded-md border border-border px-2.5 py-1.5 text-[13px] outline-none focus:border-accent'

// 行程条目表单：新增与编辑共用（展示与交互保持一致）
export default function ActivityForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onDraftChange,
}: {
  initial?: Partial<ActivityFormValues>
  submitLabel: string
  onSubmit: (values: ActivityFormValues) => void
  onCancel: () => void
  // 编辑模式：表单变化/卸载时上报草稿（防切换丢输入）
  onDraftChange?: (values: ActivityFormValues) => void
}) {
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
        const results = await searchPlaces(value.trim(), ctrl.signal)
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
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <input
          type="time"
          value={form.time}
          onChange={(e) => setForm({ ...form, time: e.target.value })}
          className={`${inputCls} w-[104px] shrink-0 tabular-nums`}
        />
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="行程名称，如：京都塔"
          className={`${inputCls} min-w-0 flex-1`}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      {/* 分类选择 */}
      <div className="flex flex-wrap gap-1">
        {(Object.keys(CATEGORY_META) as ActivityCategory[]).map((c) => {
          const meta = CATEGORY_META[c]
          const Icon = CATEGORY_ICONS[c]
          const active = form.category === c
          return (
            <button
              key={c}
              onClick={() => setForm({ ...form, category: c })}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-opacity"
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
      <div className="flex flex-wrap gap-2">
        {/* 地点输入 + 地理编码候选 */}
        <div className="relative min-w-[200px] flex-1">
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
            placeholder="地点（选填，自动定位地图）"
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
        <div className="relative w-[170px]">
          <input
          value={form.duration}
            onChange={(e) => setForm({ ...form, duration: e.target.value.replace(/[^\d]/g, '') })}
            placeholder="预计时长（选填）"
            inputMode="numeric"
            className={`${inputCls} w-full pr-9 tabular-nums`}
          />
          <span className="absolute top-2 right-2.5 text-[12px] text-text-faint">分钟</span>
        </div>
        <input
          value={form.cost}
          onChange={(e) => onCostChange(e.target.value)}
          placeholder="首笔花费 ¥（选填）"
          type="number"
          min="0"
          className={`${inputCls} w-[130px] tabular-nums`}
        />
        <button
          type="button"
          onClick={() => setShowMapPicker(!showMapPicker)}
          className={`rounded-md border px-2.5 py-1.5 text-[12.5px] transition-colors ${
            showMapPicker
              ? 'border-accent bg-accent-soft text-accent-hover'
              : 'border-border text-text-muted hover:border-accent hover:text-accent'
          }`}
        >
          🗺 {showMapPicker ? '收起地图' : '地图选点'}
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
      <textarea
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        placeholder="备注（选填）"
        rows={2}
        className={`${inputCls} resize-none leading-relaxed`}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!form.title.trim()}
          className="rounded-md bg-accent px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] text-text-muted hover:bg-surface"
        >
          取消
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
