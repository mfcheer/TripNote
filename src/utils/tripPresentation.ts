import type { Trip } from '../types'

function compactDate(value?: string) {
  const match = value?.match(/^\d{4}-(\d{2})-(\d{2})$/)
  return match ? `${Number(match[1])}.${Number(match[2])}` : value && value !== '待定' ? value : ''
}

export function tripDateRange(trip: Trip) {
  const start = compactDate(trip.days[0]?.date)
  const end = compactDate(trip.days.at(-1)?.date)
  if (start && end && start !== end) return `${start} — ${end}`
  return start || end || '日期待定'
}

export function tripPlanningProgress(trip: Trip) {
  if (!trip.days.length) return 0
  const plannedDays = trip.days.filter((day) => trip.activities.some((activity) => activity.dayId === day.id)).length
  return Math.round(plannedDays / trip.days.length * 100)
}

export function tripTagline(trip: Trip) {
  const places = trip.days.map((day) => (day.place || '').trim()).filter((place) => place && place !== '待定')
  const unique = places.filter((place, index) => places.indexOf(place) === index)
  if (unique.length >= 2) return `从 ${unique[0]} 到 ${unique.at(-1)}`
  return unique[0] ? `${unique[0]}，慢慢展开` : `${trip.searchRegion || '下一站'}，从想去开始`
}
