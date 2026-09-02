import { activitiesByDay, displayDate } from '../store'
import { type Activity, type Trip } from '../types'

const WIDTH = 1080
const PADDING = 64
const IMAGE_CATEGORY_COLORS = {
  traffic: { color: '#0ea5e9', soft: '#e0f2fe' },
  sight: { color: '#0d9488', soft: '#ccfbf1' },
  food: { color: '#f59e0b', soft: '#fef3c7' },
  stay: { color: '#8b5cf6', soft: '#ede9fe' },
  shop: { color: '#ec4899', soft: '#fce7f3' },
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fill()
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let result = text
  while (result.length > 0 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1)
  return `${result}…`
}

function itemHeight(activity: Activity) {
  return activity.note || activity.location || activity.duration || activity.costs.length > 0 ? 116 : 92
}

function drawActivity(ctx: CanvasRenderingContext2D, activity: Activity, y: number) {
  const cardX = 196
  const cardWidth = WIDTH - PADDING - cardX
  const height = itemHeight(activity)
  const imageMeta = IMAGE_CATEGORY_COLORS[activity.category]
  const total = activity.costs.reduce((sum, cost) => sum + cost.amount, 0)

  ctx.fillStyle = '#ffffff'
  roundedRect(ctx, cardX, y, cardWidth, height, 18)
  ctx.fillStyle = imageMeta.soft
  roundedRect(ctx, cardX + 22, y + 22, 44, 44, 12)
  ctx.fillStyle = imageMeta.color
  ctx.beginPath()
  ctx.arc(cardX + 44, y + 44, 7, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#64748b'
  ctx.font = '500 25px "PingFang SC", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(activity.time, 160, y + 39)
  ctx.fillStyle = '#cbd5e1'
  ctx.fillRect(173, y + 46, 2, height + 22)
  ctx.fillStyle = imageMeta.color
  ctx.beginPath()
  ctx.arc(174, y + 46, 7, 0, Math.PI * 2)
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.fillStyle = '#172033'
  ctx.font = '600 27px "PingFang SC", sans-serif'
  ctx.fillText(clipText(ctx, activity.title, total > 0 ? cardWidth - 230 : cardWidth - 112), cardX + 82, y + 41)
  if (total > 0) {
    ctx.fillStyle = '#475569'
    ctx.font = '600 23px "PingFang SC", sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`¥${total.toLocaleString()}`, cardX + cardWidth - 24, y + 41)
    ctx.textAlign = 'left'
  }

  const details = [activity.duration, activity.location].filter(Boolean).join(' · ')
  if (details) {
    ctx.fillStyle = '#64748b'
    ctx.font = '400 21px "PingFang SC", sans-serif'
    ctx.fillText(clipText(ctx, details, cardWidth - 110), cardX + 82, y + 73)
  }
  if (activity.note) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = '400 19px "PingFang SC", sans-serif'
    ctx.fillText(clipText(ctx, activity.note, cardWidth - 110), cardX + 82, y + 101)
  }
  return height + 22
}

export async function exportTripImage(trip: Trip) {
  const contentHeight = trip.days.reduce(
    (sum, day) => sum + 88 + activitiesByDay(trip, day.id).reduce((itemSum, item) => itemSum + itemHeight(item) + 22, 0) + 30,
    0,
  )
  const height = 230 + contentHeight + 96
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持图片导出')

  ctx.fillStyle = '#f5f7fb'
  ctx.fillRect(0, 0, WIDTH, height)
  ctx.fillStyle = '#0f766e'
  ctx.fillRect(0, 0, WIDTH, 12)
  ctx.fillStyle = '#ffffff'
  roundedRect(ctx, PADDING, 46, WIDTH - PADDING * 2, 144, 24)
  ctx.fillStyle = '#172033'
  ctx.font = '700 42px "PingFang SC", sans-serif'
  ctx.fillText(trip.name, PADDING + 32, 104)
  ctx.fillStyle = '#64748b'
  ctx.font = '400 22px "PingFang SC", sans-serif'
  ctx.fillText(`${trip.days.length} 天行程 · 由 TripNote 生成`, PADDING + 32, 145)
  const planned = trip.activities.flatMap((activity) => activity.costs).reduce((sum, cost) => sum + cost.amount, 0)
  ctx.fillStyle = '#0f766e'
  ctx.font = '600 23px "PingFang SC", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`已规划 ¥${planned.toLocaleString()} / 预算 ¥${trip.totalBudget.toLocaleString()}`, WIDTH - PADDING - 32, 145)
  ctx.textAlign = 'left'

  let y = 230
  for (const day of trip.days) {
    const items = activitiesByDay(trip, day.id)
    ctx.fillStyle = '#e6fffb'
    roundedRect(ctx, PADDING, y, WIDTH - PADDING * 2, 60, 16)
    ctx.fillStyle = '#0f766e'
    ctx.font = '700 25px "PingFang SC", sans-serif'
    ctx.fillText(day.label, PADDING + 24, y + 38)
    ctx.fillStyle = '#475569'
    ctx.font = '400 21px "PingFang SC", sans-serif'
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? displayDate(day.date) : day.date
    ctx.fillText([date, day.place].filter(Boolean).join(' · '), PADDING + 120, y + 38)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#64748b'
    ctx.fillText(`${items.length} 个安排`, WIDTH - PADDING - 24, y + 38)
    ctx.textAlign = 'left'
    y += 82
    if (items.length === 0) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '400 21px "PingFang SC", sans-serif'
      ctx.fillText('这一天暂未安排', 196, y + 30)
      y += 54
    } else {
      for (const activity of items) y += drawActivity(ctx, activity, y)
    }
    y += 8
  }
  ctx.fillStyle = '#94a3b8'
  ctx.font = '400 19px "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('途记 TripNote · 祝你旅途愉快', WIDTH / 2, height - 42)

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
