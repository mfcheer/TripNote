// 地图绘制无法直接读取 CSS 颜色变量，因此在这里集中维护与界面一致的路线与地点色。
export const ROUTE_PROGRESS_COLORS = ['#AE5A16', '#C45231', '#C4453E', '#A63448', '#7D2B48']
export const MAP_ROUTE_ACTIVE = '#C4453E'
export const MAP_ROUTE_INACTIVE = '#B6B6B0'
export const WISH_PENDING = '#B3533D'
export const WISH_PENDING_TEXT = '#8D3A28'
export const WISH_SCHEDULED = '#1B6CA8'
export const WISH_SCHEDULED_TEXT = '#135384'

export function routeProgressColor(dayIndex: number, totalDays: number) {
  if (totalDays <= 1) return ROUTE_PROGRESS_COLORS.at(-1)!
  const position = (dayIndex / (totalDays - 1)) * (ROUTE_PROGRESS_COLORS.length - 1)
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.min(lowerIndex + 1, ROUTE_PROGRESS_COLORS.length - 1)
  const ratio = position - lowerIndex
  const lower = ROUTE_PROGRESS_COLORS[lowerIndex].match(/[a-f\d]{2}/gi)!.map((value) => Number.parseInt(value, 16))
  const upper = ROUTE_PROGRESS_COLORS[upperIndex].match(/[a-f\d]{2}/gi)!.map((value) => Number.parseInt(value, 16))
  const channel = (index: number) => Math.round(lower[index] + (upper[index] - lower[index]) * ratio).toString(16).padStart(2, '0')
  return `#${channel(0)}${channel(1)}${channel(2)}`
}
