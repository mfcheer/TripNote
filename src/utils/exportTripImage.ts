import { activitiesByDay, displayDate } from '../store'
import { type Activity, type Trip } from '../types'

const WIDTH = 1080
const PADDING = 72
const TIME_X = 178
const CONTENT_X = 226
const INK = '#23313f'
const MUTED = '#788796'
const PAPER = '#faf8f4'
const LINE = '#e8e1d8'
const START = '#d98972'
const END = '#a74943'

const CATEGORY = {
  traffic: { color: '#4e88aa', soft: '#eaf3f7' },
  sight: { color: '#cf715b', soft: '#faece7' },
  food: { color: '#bd8a45', soft: '#faf1e2' },
  stay: { color: '#8172a5', soft: '#f0edf6' },
  shop: { color: '#b96b8f', soft: '#f8ebf0' },
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
    ctx.fillStyle = '#687687'
    ctx.font = '600 20px "PingFang SC", sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`¥${total.toLocaleString()}`, WIDTH - PADDING - 24, y + 37)
    ctx.textAlign = 'left'
  }
  const details = [activity.duration, activity.location].filter(Boolean).join('  ·  ')
  if (details) {
    ctx.fillStyle = '#6f7e8e'
    ctx.font = '400 19px "PingFang SC", sans-serif'
    ctx.fillText(clip(ctx, details, cardWidth - 104), CONTENT_X + 80, y + 67)
  }
  if (activity.note) {
    ctx.fillStyle = '#9aa5b1'
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
    image.src = `${import.meta.env.BASE_URL}northward-icon-128.png`
  })

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, WIDTH, canvas.height)
  const gradient = ctx.createLinearGradient(PADDING, 0, WIDTH - PADDING, 0)
  gradient.addColorStop(0, START)
  gradient.addColorStop(1, END)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, 10)

  ctx.fillStyle = '#9b766c'
  ctx.font = '600 17px "PingFang SC", sans-serif'
  if (brandIcon) ctx.drawImage(brandIcon, PADDING, 26, 42, 42)
  ctx.fillText('北向', PADDING + (brandIcon ? 54 : 0), 58)
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
  ctx.fillStyle = '#ded7cf'
  ctx.fillRect(PADDING, 198, WIDTH - PADDING * 2, 1)
  const planned = trip.activities.reduce((sum, activity) => sum + activityCost(activity), 0)
  const stats = [`${trip.days.length} 天`, `${trip.activities.length} 项安排`, `${trip.activities.filter((activity) => activity.geo).length} 个地点`, `预计 ¥${planned.toLocaleString()}`]
  ctx.fillStyle = '#546474'
  ctx.font = '600 22px "PingFang SC", sans-serif'
  stats.forEach((value, index) => {
    const x = PADDING + index * 232
    ctx.fillText(value, x, 240)
    if (index < stats.length - 1) {
      ctx.fillStyle = '#ded7cf'
      ctx.fillRect(x + 202, 219, 1, 28)
      ctx.fillStyle = '#546474'
    }
  })
  ctx.fillStyle = '#9aa4ae'
  ctx.font = '400 16px "PingFang SC", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`预算 ¥${trip.totalBudget.toLocaleString()}`, WIDTH - PADDING, 280)
  ctx.textAlign = 'left'

  let y = 326
  trip.days.forEach((day, index) => {
    const items = activitiesByDay(trip, day.id)
    const accent = dayColor(index, trip.days.length)
    const dayCost = items.reduce((sum, activity) => sum + activityCost(activity), 0)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? displayDate(day.date) : day.date
    ctx.fillStyle = accent
    ctx.fillRect(PADDING, y + 3, 6, 62)
    ctx.fillStyle = accent
    ctx.font = '700 28px "PingFang SC", sans-serif'
    ctx.fillText(day.label, PADDING + 24, y + 29)
    ctx.fillStyle = '#536273'
    ctx.font = '500 20px "PingFang SC", sans-serif'
    ctx.fillText(clip(ctx, [date, day.place].filter(Boolean).join('  ·  '), 510), PADDING + 132, y + 29)
    ctx.fillStyle = '#99a4af'
    ctx.font = '400 17px "PingFang SC", sans-serif'
    ctx.fillText(`${items.length} 个安排${dayCost ? `  ·  ¥${dayCost.toLocaleString()}` : ''}`, PADDING + 24, y + 58)
    y += 88

    if (!items.length) {
      ctx.fillStyle = '#fff'
      rounded(ctx, CONTENT_X, y, WIDTH - PADDING - CONTENT_X, 58, 14)
      ctx.fillStyle = '#98a3ae'
      ctx.font = '400 19px "PingFang SC", sans-serif'
      ctx.fillText('这一天暂未安排，可留作自由活动。', CONTENT_X + 24, y + 36)
      y += 76
    } else {
      for (const activity of items) y += drawActivity(ctx, activity, y, accent)
    }
    y += 18
  })

  ctx.fillStyle = '#a3adb6'
  ctx.font = '400 17px "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('北向 · 祝你一路从容', WIDTH / 2, canvas.height - 34)
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
