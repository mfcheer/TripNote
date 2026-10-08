const categories = new Set(['traffic', 'sight', 'food', 'stay', 'shop'])
const modes = new Set(['walk', 'drive', 'train', 'flight', 'charter'])
export const validGeo = (geo) => Boolean(geo && Number.isFinite(geo.lat) && Math.abs(geo.lat) <= 90 && Number.isFinite(geo.lng) && Math.abs(geo.lng) <= 180)
export function timeToMinutes(value) {
  const match = typeof value === 'string' && value.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function selectPlaceGeo(results, title) {
  const normalize = (value) => String(value ?? '').toLocaleLowerCase().replace(/[\s·・,，()（）\-]/g, '')
  const name = normalize(title)
  if (!name) return undefined
  const matches = Array.isArray(results) ? results.filter((item) => normalize(item.name || item.display_name?.split(',')[0]).includes(name) && item.lat != null && item.lon != null && validGeo({ lat: Number(item.lat), lng: Number(item.lon) })) : []
  // 多个明显异地的同名候选不自动选第一个，交给用户确认。
  if (!matches.length || matches.some((item) => Math.abs(Number(item.lat) - Number(matches[0].lat)) > 0.3 || Math.abs(Number(item.lon) - Number(matches[0].lon)) > 0.3)) return undefined
  return { lat: Number(matches[0].lat), lng: Number(matches[0].lon) }
}
export function validateDraft(draft, expectedDays, revising = false) {
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.days)) return '没有 days 数组'
  if (draft.days.length !== expectedDays) return `需要 ${expectedDays} 天，实际返回 ${draft.days.length} 天`
  if (draft.totalBudget != null && (!Number.isFinite(draft.totalBudget) || draft.totalBudget < 0)) return '预算必须为非负数'
  for (const [index, day] of draft.days.entries()) {
    if (!day || typeof day.place !== 'string' || !day.place.trim() || !Array.isArray(day.activities) || (!revising && !day.activities.length) || day.activities.length > 30) return `第 ${index + 1} 天的地点或安排结构无效`
    if (day.date && !validDate(day.date)) return `第 ${index + 1} 天日期无效`
    let lastTime = -1
    for (const activity of day.activities) {
      if (!activity || typeof activity.title !== 'string' || !activity.title.trim()) return '每项安排必须有名称'
      const time = timeToMinutes(activity.time)
      if (time === null) return `「${activity.title}」需要有效的 24 小时时间 HH:MM`
      if (time < lastTime) return `第 ${index + 1} 天安排需要按时间排序`
      lastTime = time
      if (!categories.has(activity.category)) return `「${activity.title}」类别无效`
      if (activity.travelMode != null && !modes.has(activity.travelMode)) return `「${activity.title}」交通方式无效`
      if (activity.durationMinutes != null && (!Number.isInteger(activity.durationMinutes) || activity.durationMinutes < 0 || activity.durationMinutes > 1440)) return `「${activity.title}」时长必须为 0–1440 分钟的整数`
      if (activity.estimatedCost != null && (!Number.isFinite(activity.estimatedCost) || activity.estimatedCost < 0)) return `「${activity.title}」预计花费必须为非负数`
    }
  }
  return ''
}
const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).slice(0, 12) : []
// 模型的“已核验”声明和坐标不可信，只有上下文已有坐标或实际检索才可进入地图。
export function prepareDraft(draft, payload) {
  draft.assumptions = strings(draft.assumptions)
  draft.warnings = strings(draft.warnings)
  draft.checks = []
  const input = payload.input ?? {}
  const itinerary = payload.context?.itinerary ?? []
  const known = [...(payload.context?.places ?? []), ...itinerary.flatMap((day) => day.activities ?? [])]
  const usedIds = new Set()
  draft.days.forEach((day, index) => {
    if (input.mode === 'revise' && Number.isInteger(input.targetDayIndex) && input.targetDayIndex !== index) {
      const before = itinerary[index]
      if (before) Object.assign(day, { date: before.date, place: before.place, activities: (before.activities ?? []).map((activity) => ({ ...activity, sourceActivityId: activity.id, estimatedCost: activity.cost })) })
    }
    if (input.mode === 'create' && validDate(input.startDate)) {
      const date = new Date(`${input.startDate}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() + index)
      day.date = date.toISOString().slice(0, 10)
    } else if (input.mode === 'revise') day.date = itinerary[index]?.date || day.date
    for (const activity of day.activities) {
      const source = itinerary.flatMap((entry) => entry.activities ?? []).find((entry) => entry.id && entry.id === activity.sourceActivityId)
      const sourceInScope = !Number.isInteger(input.targetDayIndex) || (itinerary[index]?.activities ?? []).some((entry) => entry.id === source?.id)
      if (input.mode !== 'revise' || !source || !sourceInScope || usedIds.has(source.id)) delete activity.sourceActivityId
      else usedIds.add(source.id)
      const match = known.find((entry) => entry.title?.trim() === activity.title.trim() && (entry.location ?? '').trim() === (activity.location ?? '').trim() && validGeo(entry.geo))
      activity.geo = match ? { ...match.geo } : undefined
    }
  })
  return draft
}
export function basicDiagnosis(context = {}) {
  const issues = []
  const itinerary = Array.isArray(context.itinerary) ? context.itinerary : []
  itinerary.forEach((day, dayIndex) => {
    const activities = [...(Array.isArray(day.activities) ? day.activities : [])].sort((a, b) => (timeToMinutes(a.time) ?? 1440) - (timeToMinutes(b.time) ?? 1440))
    if (activities.length >= 6) issues.push({ id: `dense-${dayIndex}`, dayIndex, severity: 'warning', title: '当天安排偏多', detail: `第 ${dayIndex + 1} 天有 ${activities.length} 项安排，移动与排队时间需要另留余量。`, suggestion: '把非必去地点设为备选，避免压缩交通与休息时间。' })
    for (let index = 1; index < activities.length; index += 1) {
      const previous = activities[index - 1]; const current = activities[index]
      const previousTime = timeToMinutes(previous.time); const currentTime = timeToMinutes(current.time)
      const end = timeToMinutes(previous.endTime)
      const duration = Number(previous.durationMinutes) || (end !== null && previousTime !== null ? (end - previousTime + 1440) % 1440 : durationFromText(previous.duration))
      if (previousTime !== null && currentTime !== null && currentTime - previousTime < duration) {
        issues.push({ id: `time-${dayIndex}-${index}`, dayIndex, severity: 'warning', title: '安排时间重叠', detail: `「${previous.title}」停留 ${duration} 分钟，下一项「${current.title}」在 ${current.time} 开始，尚未计入交通就已重叠。`, suggestion: `延后「${current.title}」，或缩短/移走前一项安排。` })
      }
    }
    const unknown = activities.filter((activity) => activity.category !== 'traffic' && !validGeo(activity.geo))
    if (unknown.length) issues.push({ id: `location-${dayIndex}`, dayIndex, severity: 'info', title: '部分地点尚未定位', detail: `「${unknown.slice(0, 3).map((activity) => activity.title).join('、')}」缺少可靠坐标，不能据此确认路线与交通时间。`, suggestion: '核对具体地址或在地图上选点，再检查路线。' })
  })
  return issues.sort((a, b) => Number(b.severity === 'warning') - Number(a.severity === 'warning'))
}
function durationFromText(value = '') {
  if (typeof value !== 'string') return 0
  const hours = value.match(/(\d+(?:\.\d+)?)\s*小时/)
  const minutes = value.match(/(\d+)\s*分钟/)
  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
}
export function normalizeDiagnosis(value, fallback, dayCount) {
  const modelIssues = Array.isArray(value?.issues) ? value.issues.flatMap((issue, index) => {
    if (!issue || typeof issue.title !== 'string' || typeof issue.detail !== 'string') return []
    return [{ id: `model-${index}`, dayIndex: Number.isInteger(issue.dayIndex) && issue.dayIndex >= 0 && issue.dayIndex < dayCount ? issue.dayIndex : undefined, severity: issue.severity === 'warning' ? 'warning' : 'info', title: issue.title, detail: issue.detail, suggestion: typeof issue.suggestion === 'string' ? issue.suggestion : '按实际情况调整。' }]
  }) : []
  const seen = new Set()
  const issues = [...fallback, ...modelIssues].filter((issue) => { const key = `${issue.dayIndex}:${issue.title}:${issue.detail}`; if (seen.has(key)) return false; seen.add(key); return true }).slice(0, 8)
  return { summary: fallback.some((issue) => issue.severity === 'warning') ? '规则检查发现时间或节奏问题，请先核对下列提醒。' : (typeof value?.summary === 'string' && value.summary.trim() ? value.summary : (issues.length ? '有几处安排仍需确认。' : '未发现明显时间冲突；这不代表已核实营业时间、预约和实时交通。')), issues }
}
