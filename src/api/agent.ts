import type { ActivityCategory, AgentConversationTurn, AgentDiagnosis, AgentDiagnosisIssue, AgentPlanCheck, AgentPlanDraft, GeoPoint, TravelMode, Trip } from '../types'

export interface AgentPlanInput {
  mode?: 'create' | 'revise' | 'check'
  destination: string
  days: number
  startDate?: string
  transport: string
  preferences: string
  /** 仅调整指定天；未指定时才允许给出整份旅行的调整草案。 */
  targetDayIndex?: number
}

function validCategory(value: unknown): ActivityCategory {
  return value === 'traffic' || value === 'food' || value === 'stay' || value === 'shop' ? value : 'sight'
}

function validTravelMode(value: unknown): TravelMode | undefined {
  return value === 'walk' || value === 'drive' || value === 'train' || value === 'flight' || value === 'charter' ? value : undefined
}

function validGeo(value: unknown): GeoPoint | undefined {
  const geo = value as Partial<GeoPoint>
  return typeof geo?.lat === 'number' && Number.isFinite(geo.lat) && typeof geo.lng === 'number' && Number.isFinite(geo.lng)
    ? { lat: geo.lat, lng: geo.lng }
    : undefined
}

function validChecks(value: unknown): AgentPlanCheck[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).flatMap((item) => {
    const check = item as Partial<AgentPlanCheck>
    if (typeof check?.title !== 'string' || typeof check.detail !== 'string') return []
    return [{
      kind: check.kind === 'route' || check.kind === 'schedule' ? check.kind : 'place',
      tone: check.tone === 'warning' ? 'warning' : 'info', title: check.title, detail: check.detail,
    }]
  })
}

// 服务端返回内容仍需在浏览器中收敛一次，避免模型偶发的自由文本直接污染本地行程。
function normalizeDraft(value: unknown): AgentPlanDraft {
  const raw = value as Partial<AgentPlanDraft>
  if (!raw || !Array.isArray(raw.days) || raw.days.length === 0) throw new Error('助手没有返回可用的行程草案')
  return {
    tripName: typeof raw.tripName === 'string' ? raw.tripName : 'AI 旅行草案',
    searchRegion: typeof raw.searchRegion === 'string' ? raw.searchRegion : undefined,
    totalBudget: typeof raw.totalBudget === 'number' && Number.isFinite(raw.totalBudget) ? raw.totalBudget : undefined,
    assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.filter((item): item is string => typeof item === 'string').slice(0, 6) : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((item): item is string => typeof item === 'string').slice(0, 6) : [],
    checks: validChecks(raw.checks),
    days: raw.days.slice(0, 30).map((day, index) => {
      const item = day as AgentPlanDraft['days'][number]
      return {
        date: typeof item.date === 'string' ? item.date : undefined,
        place: typeof item.place === 'string' ? item.place : `第${index + 1}天目的地`,
        activities: Array.isArray(item.activities) ? item.activities.slice(0, 10).map((activity) => ({
          time: typeof activity.time === 'string' ? activity.time : '09:00',
          title: typeof activity.title === 'string' ? activity.title : '待补充安排',
          category: validCategory(activity.category),
          location: typeof activity.location === 'string' ? activity.location : undefined,
          duration: typeof activity.duration === 'string' ? activity.duration : undefined,
          durationMinutes: typeof activity.durationMinutes === 'number' && Number.isFinite(activity.durationMinutes) ? activity.durationMinutes : undefined,
          note: typeof activity.note === 'string' ? activity.note : undefined,
          estimatedCost: typeof activity.estimatedCost === 'number' && Number.isFinite(activity.estimatedCost) ? activity.estimatedCost : undefined,
          travelMode: validTravelMode(activity.travelMode),
          geo: validGeo(activity.geo),
        })) : [],
      }
    }),
  }
}

export async function requestAgentPlan(serviceUrl: string, input: AgentPlanInput, currentTrip?: Trip, signal?: AbortSignal, accessToken = '', conversation: AgentConversationTurn[] = []) {
  if (!serviceUrl.trim()) throw new Error('请先在设置中连接规划助手服务')
  const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/v1/plan`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...(accessToken.trim() ? { Authorization: `Bearer ${accessToken.trim()}` } : {}) },
    body: JSON.stringify({ input, context: agentContext(currentTrip, conversation) }),
  })
  const body = await response.json().catch(() => null) as { draft?: unknown; error?: string } | null
  if (!response.ok) throw new Error(body?.error || `规划助手暂时不可用（${response.status}）`)
  return normalizeDraft(body?.draft)
}

function agentContext(currentTrip: Trip | undefined, conversation: AgentConversationTurn[]) {
  if (!currentTrip) return undefined
  // 按需传递当前旅行摘要与最近几轮本机对话，不上传完整本地数据库。
  return {
    name: currentTrip.name,
    searchRegion: currentTrip.searchRegion,
    places: currentTrip.wishPlaces.slice(0, 30).map((place) => ({ title: place.title, category: place.category, location: place.location, geo: place.geo })),
    itinerary: currentTrip.days.slice(0, 30).map((day) => ({
      date: day.date, place: day.place,
      activities: currentTrip.activities.filter((activity) => activity.dayId === day.id).map((activity) => ({
        time: activity.time, title: activity.title, category: activity.category, location: activity.location,
        durationMinutes: activity.durationMinutes, duration: activity.duration, travelMode: activity.travelMode, geo: activity.geo,
        cost: activity.costs.reduce((sum, cost) => sum + cost.amount, 0),
      })),
    })),
    totalBudget: currentTrip.totalBudget,
    conversation: conversation.slice(-4).map((turn) => ({ intent: turn.intent, request: turn.request, responseSummary: turn.responseSummary })),
  }
}

function normalizeDiagnosis(value: unknown): AgentDiagnosis {
  const raw = value as Partial<AgentDiagnosis>
  const issues = Array.isArray(raw?.issues) ? raw.issues.slice(0, 6).flatMap((item, index) => {
    const issue = item as Partial<AgentDiagnosisIssue>
    if (typeof issue?.title !== 'string' || typeof issue.detail !== 'string') return []
    return [{
      id: typeof issue.id === 'string' && issue.id ? issue.id : `issue-${index}`,
      dayIndex: typeof issue.dayIndex === 'number' && Number.isInteger(issue.dayIndex) && issue.dayIndex >= 0 ? issue.dayIndex : undefined,
      severity: issue.severity === 'warning' ? 'warning' as const : 'info' as const,
      title: issue.title,
      detail: issue.detail,
      suggestion: typeof issue.suggestion === 'string' ? issue.suggestion : '检查后按实际情况调整。',
    }]
  }) : []
  return {
    summary: typeof raw?.summary === 'string' && raw.summary.trim() ? raw.summary : (issues.length ? '发现几处可以再确认的安排。' : '当前行程节奏看起来不错。'),
    issues,
  }
}

export async function requestAgentCheck(serviceUrl: string, input: AgentPlanInput, currentTrip: Trip, signal?: AbortSignal, accessToken = '', conversation: AgentConversationTurn[] = []) {
  if (!serviceUrl.trim()) throw new Error('请先在设置中连接规划助手服务')
  const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/v1/check`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(accessToken.trim() ? { Authorization: `Bearer ${accessToken.trim()}` } : {}) },
    body: JSON.stringify({ input: { ...input, mode: 'check' }, context: agentContext(currentTrip, conversation) }),
  })
  const body = await response.json().catch(() => null) as { diagnosis?: unknown; error?: string } | null
  if (!response.ok) throw new Error(body?.error || `规划助手暂时不可用（${response.status}）`)
  return normalizeDiagnosis(body?.diagnosis)
}
