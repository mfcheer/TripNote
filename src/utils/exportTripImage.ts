import { activitiesByDay, displayDate } from '../store'
import { type Activity, type Trip } from '../types'
import { straightLineDistanceMeters } from '../api/route'

const WIDTH = 1080
const PADDING = 72
const TIME_X = 178
const CONTENT_X = 226
// 导出卡片与应用主界面使用同一套安静的冷白材质与墨灰文字，
// 路线进度只保留一条克制的珊瑚色提示，避免回到旧版暖棕旅行手帐风格。
const INK = '#1d1d1f'
const MUTED = '#707784'
const PAPER = '#f7f7f9'
const LINE = '#e2e4e8'
const START = '#ef9b8a'
const END = '#df6555'

const CATEGORY = {
  traffic: { color: '#668698', soft: '#eaf1f4' },
  sight: { color: '#b87462', soft: '#f8eeeb' },
  food: { color: '#987b4d', soft: '#f6f1e8' },
  stay: { color: '#747c95', soft: '#f0f1f5' },
  shop: { color: '#9b7083', soft: '#f5eef1' },
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

function clip(ctx: CanvasRenderingContext2D, value: string, width: number) {
  if (ctx.measureText(value).width <= width) return value
  let result = value
  while (result && ctx.measureText(`${result}…`).width > width) result = result.slice(0, -1)
  return `${result}…`
}

function activityCost(activity: Activity) {
  return activity.costs.reduce((sum, item) => sum + item.amount, 0)
}

// 与左侧日期列表一致：当天内部相邻点，外加前一天末站到当天首站的衔接。
function dayMovementMeters(trip: Trip, dayIndex: number) {
  const todayPoints = activitiesByDay(trip, trip.days[dayIndex].id).flatMap((activity) => activity.geo ? [activity.geo] : [])
  if (todayPoints.length === 0) return 0
  const previousLastPoint = dayIndex > 0
    ? activitiesByDay(trip, trip.days[dayIndex - 1].id).flatMap((activity) => activity.geo ? [activity.geo] : []).at(-1)
    : undefined
  const points = previousLastPoint ? [previousLastPoint, ...todayPoints] : todayPoints
  return points.slice(1).reduce((total, point, index) => total + straightLineDistanceMeters(points[index], point), 0)
}

function formatMovement(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km`
  return `${Math.round(meters)} m`
}

function activityHeight(activity: Activity) {
  return activity.note ? 122 : (activity.location || activity.duration || activity.costs.length ? 96 : 76)
}

function dayColor(index: number, total: number) {
  const parse = (value: string) => value.match(/[a-f\d]{2}/gi)!.map((part) => Number.parseInt(part, 16))
  const from = parse(START)
  const to = parse(END)
  const ratio = total <= 1 ? 1 : index / (total - 1)
  return `#${from.map((value, i) => Math.round(value + (to[i] - value) * ratio).toString(16).padStart(2, '0')).join('')}`
}

function drawActivity(ctx: CanvasRenderingContext2D, activity: Activity, y: number, accent: string) {
  const h = activityHeight(activity)
  const meta = CATEGORY[activity.category]
  const total = activityCost(activity)
  const cardWidth = WIDTH - PADDING - CONTENT_X

  ctx.fillStyle = '#fff'
  rounded(ctx, CONTENT_X, y, cardWidth, h, 16)
  ctx.fillStyle = meta.soft
  rounded(ctx, CONTENT_X + 22, y + 20, 40, 40, 12)
  ctx.fillStyle = meta.color
  ctx.beginPath()
  ctx.arc(CONTENT_X + 42, y + 40, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = MUTED
  ctx.font = '600 22px "PingFang SC", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(activity.time, TIME_X, y + 35)
  ctx.fillStyle = LINE
  ctx.fillRect(TIME_X + 14, y + 42, 2, h + 18)
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(TIME_X + 15, y + 42, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.fillStyle = INK
  ctx.font = '600 26px "PingFang SC", sans-serif'
  ctx.fillText(clip(ctx, activity.title, total ? cardWidth - 204 : cardWidth - 102), CONTENT_X + 80, y + 37)
  if (total) {
    ctx.fillStyle = '#707784'
    ctx.font = '600 20px "PingFang SC", sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`¥${total.toLocaleString()}`, WIDTH - PADDING - 24, y + 37)
    ctx.textAlign = 'left'
  }
  const details = [activity.duration, activity.location].filter(Boolean).join('  ·  ')
  if (details) {
    ctx.fillStyle = '#707784'
    ctx.font = '400 19px "PingFang SC", sans-serif'
    ctx.fillText(clip(ctx, details, cardWidth - 104), CONTENT_X + 80, y + 67)
  }
  if (activity.note) {
    ctx.fillStyle = '#9aa1ab'
    ctx.font = '400 18px "PingFang SC", sans-serif'
    ctx.fillText(clip(ctx, activity.note, cardWidth - 104), CONTENT_X + 80, y + 96)
  }
  return h + 20
}

export async function exportTripImage(trip: Trip) {
  const itineraryHeight = trip.days.reduce((sum, day) => {
    const items = activitiesByDay(trip, day.id)
    return sum + 112 + (items.length ? items.reduce((itemSum, item) => itemSum + activityHeight(item) + 20, 0) : 76) + 18
  }, 0)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = 326 + itineraryHeight + 72
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持图片导出')

  const brandIcon = await new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = `${import.meta.env.BASE_URL}northward-icon-round.png`
  })

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, WIDTH, canvas.height)
  ctx.fillStyle = '#dfe6ed'
  ctx.fillRect(0, 0, WIDTH, 6)

  ctx.fillStyle = '#707784'
  ctx.font = '600 17px "PingFang SC", sans-serif'
  if (brandIcon) ctx.drawImage(brandIcon, PADDING, 26, 42, 42)
  ctx.fillText('TripNote', PADDING + (brandIcon ? 54 : 0), 58)
  ctx.fillStyle = INK
  ctx.font = '700 48px "PingFang SC", sans-serif'
  ctx.fillText(clip(ctx, trip.name, 820), PADDING, 124)
  const firstDay = trip.days[0]
  const lastDay = trip.days.at(-1)
  const dates = firstDay && lastDay
    ? [firstDay.date, lastDay.date].map((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? displayDate(date).replace(/ 周./, '') : date).join('  —  ')
    : '日期待定'
  const places = Array.from(new Set(trip.days.map((day) => day.place).filter(Boolean))).join(' · ')
  ctx.fillStyle = MUTED
  ctx.font = '400 21px "PingFang SC", sans-serif'
  ctx.fillText(clip(ctx, [dates, places].filter(Boolean).join('  /  '), 900), PADDING, 163)
  ctx.fillStyle = LINE
  ctx.fillRect(PADDING, 198, WIDTH - PADDING * 2, 1)
  const planned = trip.activities.reduce((sum, activity) => sum + activityCost(activity), 0)
  const stats = [`${trip.days.length} 天`, `${trip.activities.length} 项安排`, `${trip.activities.filter((activity) => activity.geo).length} 个地点`, `预计 ¥${planned.toLocaleString()}`]
  ctx.fillStyle = '#4f5965'
  ctx.font = '600 22px "PingFang SC", sans-serif'
  stats.forEach((value, index) => {
    const x = PADDING + index * 232
    ctx.fillText(value, x, 240)
    if (index < stats.length - 1) {
      ctx.fillStyle = LINE
      ctx.fillRect(x + 202, 219, 1, 28)
      ctx.fillStyle = '#4f5965'
    }
  })
  ctx.fillStyle = '#9aa1ab'
  ctx.font = '400 16px "PingFang SC", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`预算 ¥${trip.totalBudget.toLocaleString()}`, WIDTH - PADDING, 280)
  ctx.textAlign = 'left'

  let y = 326
  trip.days.forEach((day, index) => {
    const items = activitiesByDay(trip, day.id)
    const accent = dayColor(index, trip.days.length)
    const dayCost = items.reduce((sum, activity) => sum + activityCost(activity), 0)
    const movementMeters = dayMovementMeters(trip, index)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? displayDate(day.date) : day.date
    ctx.fillStyle = accent
    ctx.fillRect(PADDING, y + 3, 6, 62)
    ctx.fillStyle = accent
    ctx.font = '700 28px "PingFang SC", sans-serif'
    ctx.fillText(day.label, PADDING + 24, y + 29)
    ctx.fillStyle = '#59616c'
    ctx.font = '500 20px "PingFang SC", sans-serif'
    ctx.fillText(clip(ctx, [date, day.place].filter(Boolean).join('  ·  '), 510), PADDING + 132, y + 29)
    ctx.fillStyle = '#8a929d'
    ctx.font = '400 17px "PingFang SC", sans-serif'
    ctx.fillText(clip(ctx, `${items.length} 个安排${dayCost ? `  ·  ¥${dayCost.toLocaleString()}` : ''}${movementMeters > 0 ? `  ·  移动约 ${formatMovement(movementMeters)}` : ''}`, WIDTH - PADDING * 2 - 24), PADDING + 24, y + 58)
    y += 88

    if (!items.length) {
      ctx.fillStyle = '#fff'
      rounded(ctx, CONTENT_X, y, WIDTH - PADDING - CONTENT_X, 58, 14)
      ctx.fillStyle = '#8a929d'
      ctx.font = '400 19px "PingFang SC", sans-serif'
      ctx.fillText('这一天暂未安排，可留作自由活动。', CONTENT_X + 24, y + 36)
      y += 76
    } else {
      for (const activity of items) y += drawActivity(ctx, activity, y, accent)
    }
    y += 18
  })

  ctx.fillStyle = '#9aa1ab'
  ctx.font = '400 17px "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('TripNote · 祝你一路从容', WIDTH / 2, canvas.height - 34)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片生成失败')), 'image/png')
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${trip.name.replace(/[\\/:*?"<>|]/g, '-')}-行程.png`
  link.click()
  URL.revokeObjectURL(url)
}
