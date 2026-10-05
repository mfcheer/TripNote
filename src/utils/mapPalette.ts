// 地图绘制无法直接读取 CSS 颜色变量，因此在这里集中维护与界面一致的路线与地点色。
export const ROUTE_PROGRESS_COLORS = ['#E9A668', '#EA795A', '#D65F58', '#B63E44', '#7F344A']
export const MAP_ROUTE_ACTIVE = '#D65F58'
export const MAP_ROUTE_INACTIVE = '#AEBFC8'
export const WISH_PENDING = '#B26F5E'
export const WISH_PENDING_TEXT = '#8B5044'
export const WISH_SCHEDULED = '#597988'
export const WISH_SCHEDULED_TEXT = '#405F6D'

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
