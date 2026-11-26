// 地图绘制无法直接读取 CSS 颜色变量，因此在这里集中维护与界面一致的路线与地点色。
export const ROUTE_PROGRESS_COLORS = ['#B85C14', '#C94D28', '#C43B35', '#A62B3D', '#7D2340']
export const MAP_ROUTE_ACTIVE = '#C43B35'
export const MAP_ROUTE_INACTIVE = '#B8B3A8'
export const WISH_PENDING = '#B84C32'
export const WISH_PENDING_TEXT = '#8F3620'
export const WISH_SCHEDULED = '#1E6B8C'
export const WISH_SCHEDULED_TEXT = '#154F69'

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
