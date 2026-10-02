import type { ActivityCategory, AgentPlanDraft, TravelMode, Trip } from '../types'

export interface AgentPlanInput {
  mode?: 'create' | 'revise'
  destination: string
  days: number
  startDate?: string
  transport: string
  preferences: string
}

function validCategory(value: unknown): ActivityCategory {
  return value === 'traffic' || value === 'food' || value === 'stay' || value === 'shop' ? value : 'sight'
}

function validTravelMode(value: unknown): TravelMode | undefined {
  return value === 'walk' || value === 'drive' || value === 'train' || value === 'flight' || value === 'charter' ? value : undefined
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
        })) : [],
      }
    }),
  }
}

export async function requestAgentPlan(serviceUrl: string, input: AgentPlanInput, currentTrip?: Trip, signal?: AbortSignal) {
  if (!serviceUrl.trim()) throw new Error('请先在设置中连接规划助手服务')
  const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/v1/plan`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input,
      // 仅传递必要旅行摘要，不上传完整本地数据库。
      context: currentTrip ? {
        name: currentTrip.name,
        searchRegion: currentTrip.searchRegion,
        places: currentTrip.wishPlaces.slice(0, 30).map((place) => place.title),
        itinerary: currentTrip.days.slice(0, 30).map((day) => ({
          date: day.date, place: day.place,
          activities: currentTrip.activities.filter((activity) => activity.dayId === day.id).map((activity) => ({ time: activity.time, title: activity.title, category: activity.category })),
        })),
      } : undefined,
    }),
  })
  const body = await response.json().catch(() => null) as { draft?: unknown; error?: string } | null
  if (!response.ok) throw new Error(body?.error || `规划助手暂时不可用（${response.status}）`)
  return normalizeDraft(body?.draft)
}
