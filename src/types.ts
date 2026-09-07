// 核心数据类型

export type ViewKey = 'plan' | 'settings'

export type PlanTab = 'timeline' | 'places' | 'map' | 'budget'

export type ActivityCategory = 'traffic' | 'sight' | 'food' | 'stay' | 'shop'

// 到达当前安排所采用的交通方式；留空时根据地点距离智能判断步行或跨城移动。
export type TravelMode = 'walk' | 'drive' | 'train' | 'flight' | 'charter'

export interface GeoPoint {
  lat: number
  lng: number
}

// 单笔花费：挂在行程条目下，一个条目可有多笔
export interface Cost {
  id: string
  title?: string // 花费说明，如"门票"、"往返车票"
  amount: number
}

export interface Activity {
  id: string
  dayId: string
  time: string // "09:00"
  endTime?: string // "11:00"
  title: string
  category: ActivityCategory
  location?: string
  note?: string
  costs: Cost[] // 预算从行程条目聚合，不再有独立的手动记账
  duration?: string // 展示用："2小时"
  durationMinutes?: number // 用于排程与冲突检测的结构化时长（分钟）
  geo?: GeoPoint
  travelMode?: TravelMode
  sourceWishId?: string // 从想去清单安排时保留来源，便于同步状态
}

// 想去清单中的地点：先收集，确认日期与时间后再排入行程。
export interface WishPlace {
  id: string
  title: string
  category: ActivityCategory
  location?: string
  note?: string
  geo?: GeoPoint
  scheduledActivityIds?: string[] // 可关联多条已生成的行程
  scheduledActivityId?: string // 旧版单条关联字段，读取旧数据时自动迁移
}

export interface TripDay {
  id: string
  label: string // "第1天"
  date: string // "10月1日 周三"
  place: string // "大阪"
}

export type ExpenseCategory = ActivityCategory

export interface Trip {
  id: string
  name: string // "日本关西之旅"
  daysCount: number
  days: TripDay[]
  activities: Activity[]
  wishPlaces: WishPlace[]
  expenses: never[] // 兼容旧持久化数据的占位，已废弃：预算一律从 activities.costs 聚合
  totalBudget: number
}

export const CATEGORY_META: Record<
  ActivityCategory,
  { label: string; color: string; soft: string }
> = {
  traffic: { label: '交通', color: 'var(--color-cat-traffic)', soft: 'var(--color-cat-traffic-soft)' },
  sight: { label: '景点', color: 'var(--color-cat-sight)', soft: 'var(--color-cat-sight-soft)' },
  food: { label: '餐饮', color: 'var(--color-cat-food)', soft: 'var(--color-cat-food-soft)' },
  stay: { label: '住宿', color: 'var(--color-cat-stay)', soft: 'var(--color-cat-stay-soft)' },
  shop: { label: '购物', color: 'var(--color-cat-shop)', soft: 'var(--color-cat-shop-soft)' },
}
