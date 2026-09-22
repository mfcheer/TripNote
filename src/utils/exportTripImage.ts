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
const ROUTE_OVERVIEW_Y = 308
const ROUTE_OVERVIEW_HEIGHT = 224
const ITINERARY_START_Y = 564

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

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)} 小时 ${rest} 分钟` : `${minutes / 60} 小时`
}

function activityHeight(activity: Activity) {
  return activity.note ? 122 : (activity.location || activity.duration || activity.costs.length ? 96 : 76)
}

function transitHeight(from: Activity, to: Activity) {
  return from.geo && to.geo ? 38 : (to.travelMode ? 38 : 0)
}

function transitCopy(from: Activity, to: Activity) {
  const distance = from.geo && to.geo ? straightLineDistanceMeters(from.geo, to.geo) : 0
  const mode = to.travelMode
  const modeLabel = mode === 'drive' ? '自驾移动'
    : mode === 'train' ? '火车移动'
      : mode === 'flight' ? '飞机移动'
        : mode === 'charter' ? '包车移动'
          : mode === 'walk' ? '步行'
            : ''
  if (modeLabel) {
    if (!distance) return modeLabel
    if (mode === 'walk') return `步行约 ${formatMinutes(Math.max(1, Math.round(distance / 75)))} · ${formatMovement(distance)}`
    return `${modeLabel} · ${formatMovement(distance)}`
  }
  if (!distance) return ''
  if (distance < 15_000) return `步行约 ${formatMinutes(Math.max(1, Math.round(distance / 75)))} · ${formatMovement(distance)}`
  return `跨城移动 · ${formatMovement(distance)} · 建议补充交通安排`
}

function drawTransit(ctx: CanvasRenderingContext2D, from: Activity, to: Activity, y: number, accent: string) {
  const copy = transitCopy(from, to)
  if (!copy) return 0
  const width = WIDTH - PADDING - CONTENT_X
  ctx.fillStyle = '#f5f6f8'
  rounded(ctx, CONTENT_X + 10, y + 2, width - 10, 28, 10)
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(CONTENT_X + 26, y + 16, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#7c858f'
  ctx.font = '500 16px "PingFang SC", sans-serif'
  ctx.fillText(copy, CONTENT_X + 40, y + 21)
  return 38
}

type RouteOverviewPoint = { lat: number; lng: number; dayIndex: number; title: string; place: string }

function worldPoint(point: { lat: number; lng: number }, zoom: number) {
  const scale = 256 * 2 ** zoom
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat))
  const sin = Math.sin((latitude * Math.PI) / 180)
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

function overviewZoom(points: RouteOverviewPoint[], width: number, height: number) {
  for (let zoom = 14; zoom >= 1; zoom--) {
    const world = points.map((point) => worldPoint(point, zoom))
    const spanX = Math.max(...world.map((point) => point.x)) - Math.min(...world.map((point) => point.x))
    const spanY = Math.max(...world.map((point) => point.y)) - Math.min(...world.map((point) => point.y))
    if (spanX <= width - 40 && spanY <= height - 28) return zoom
  }
  return 1
}

function routeSpanMeters(points: RouteOverviewPoint[]) {
  if (points.length < 2) return 0
  return points.reduce((largest, point, index) =>
    Math.max(largest, ...points.slice(index + 1).map((other) => straightLineDistanceMeters(point, other))),
  0)
}

function overviewLabels(points: RouteOverviewPoint[], localRoute: boolean) {
  if (localRoute) {
    const first = points[0]
    const last = points.at(-1)!
    return [
      { point: first, label: `起点 · ${first.title}` },
      ...(last !== first ? [{ point: last, label: `终点 · ${last.title}` }] : []),
    ]
  }
  const byPlace = points.filter((point, index) => !point.place || !points.slice(0, index).some((previous) => previous.place === point.place))
  const source = byPlace.length >= 2 ? byPlace : points
  const limit = Math.min(5, source.length)
  return Array.from({ length: limit }, (_, index) => {
    const point = source[Math.round((index * (source.length - 1)) / Math.max(1, limit - 1))]
    return { point, label: point.place || `第${point.dayIndex + 1}天` }
  })
}

function drawOverviewLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
) {
  ctx.font = '600 13px "PingFang SC", sans-serif'
  const width = Math.min(mapW - 18, ctx.measureText(label).width + 18)
  const left = Math.max(mapX + 5, Math.min(mapX + mapW - width - 5, x - width / 2))
  const top = Math.max(mapY + 5, Math.min(mapY + mapH - 26, y - 29))
  ctx.fillStyle = 'rgba(255,255,255,.94)'
  rounded(ctx, left, top, width, 22, 8)
  ctx.fillStyle = '#4e5965'
  ctx.fillText(clip(ctx, label, width - 14), left + 8, top + 15)
}

function loadMapTile(zoom: number, x: number, y: number) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    const timer = window.setTimeout(() => resolve(null), 4500)
    image.onload = () => {
      window.clearTimeout(timer)
      resolve(image)
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    image.crossOrigin = 'anonymous'
    image.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
  })
}

async function drawRouteOverview(ctx: CanvasRenderingContext2D, trip: Trip) {
  const x = PADDING
  const y = ROUTE_OVERVIEW_Y
  const w = WIDTH - PADDING * 2
  const h = ROUTE_OVERVIEW_HEIGHT
  const points = trip.days.flatMap((day, dayIndex) =>
    activitiesByDay(trip, day.id)
      .filter((activity) => activity.geo)
      .map((activity) => ({ ...activity.geo!, dayIndex, title: activity.title, place: day.place })),
  )
  const localRoute = routeSpanMeters(points) <= 45_000

  ctx.fillStyle = '#fff'
  rounded(ctx, x, y, w, h, 18)
  ctx.fillStyle = '#59616c'
  ctx.font = '600 18px "PingFang SC", sans-serif'
  ctx.fillText(localRoute ? '城区路线图' : '城市路线概览', x + 22, y + 32)
  ctx.fillStyle = '#9299a3'
  ctx.font = '400 15px "PingFang SC", sans-serif'
  ctx.fillText(points.length ? `${localRoute ? '同城活动 · 放大查看地点顺序' : '跨城行程 · 查看主要停留城市'} · 已定位 ${points.length} 个地点` : '为行程地点补充坐标后，这里会显示全程路线', x + 22, y + 57)

  const mapX = x + 22
  const mapY = y + 70
  const mapW = w - 44
  const mapH = h - 88
  ctx.fillStyle = '#f3f6f7'
  rounded(ctx, mapX, mapY, mapW, mapH, 13)
  if (points.length === 0) return

  const zoom = overviewZoom(points, mapW, mapH)
  const world = points.map((point) => worldPoint(point, zoom))
  const centerX = (Math.min(...world.map((point) => point.x)) + Math.max(...world.map((point) => point.x))) / 2
  const centerY = (Math.min(...world.map((point) => point.y)) + Math.max(...world.map((point) => point.y))) / 2
  const startX = centerX - mapW / 2
  const startY = centerY - mapH / 2
  const tileStartX = Math.floor(startX / 256)
  const tileEndX = Math.floor((startX + mapW) / 256)
  const tileStartY = Math.floor(startY / 256)
  const tileEndY = Math.floor((startY + mapH) / 256)
  const tileCount = 2 ** zoom
  const tileJobs: Array<Promise<{ image: HTMLImageElement | null; x: number; y: number }>> = []
  for (let tileX = tileStartX; tileX <= tileEndX; tileX++) {
    for (let tileY = tileStartY; tileY <= tileEndY; tileY++) {
      if (tileY < 0 || tileY >= tileCount) continue
      const normalizedX = ((tileX % tileCount) + tileCount) % tileCount
      tileJobs.push(loadMapTile(zoom, normalizedX, tileY).then((image) => ({ image, x: tileX, y: tileY })))
    }
  }
  const tiles = await Promise.all(tileJobs)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(mapX, mapY, mapW, mapH, 13)
  ctx.clip()
  tiles.forEach(({ image, x: tileX, y: tileY }) => {
    if (image) ctx.drawImage(image, mapX + tileX * 256 - startX, mapY + tileY * 256 - startY, 256, 256)
  })
  ctx.restore()

  const toCanvasPoint = (point: { lat: number; lng: number }) => {
    const position = worldPoint(point, zoom)
    return { x: mapX + position.x - startX, y: mapY + position.y - startY }
  }
  const canvasPoints = points.map(toCanvasPoint)
  if (canvasPoints.length > 1) {
    ctx.beginPath()
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y)
    canvasPoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y))
    ctx.strokeStyle = '#e78a78'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }
  canvasPoints.forEach((point, index) => {
    ctx.fillStyle = dayColor(points[index].dayIndex, trip.days.length)
    ctx.beginPath()
    ctx.arc(point.x, point.y, index === 0 || index === canvasPoints.length - 1 ? 6 : 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  })
  overviewLabels(points, localRoute).forEach(({ point, label }) => {
    const mapPoint = toCanvasPoint(point)
    drawOverviewLabel(ctx, label, mapPoint.x, mapPoint.y, mapX, mapY, mapW, mapH)
  })
  ctx.fillStyle = 'rgba(255,255,255,.78)'
  rounded(ctx, mapX + 4, mapY + mapH - 19, 92, 15, 7)
  ctx.fillStyle = '#68727d'
  ctx.font = '400 10px "PingFang SC", sans-serif'
  ctx.fillText('© OpenStreetMap', mapX + 10, mapY + mapH - 8)
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
    const transitTotal = items.slice(1).reduce((total, item, index) => total + transitHeight(items[index], item), 0)
    return sum + 112 + (items.length ? items.reduce((itemSum, item) => itemSum + activityHeight(item) + 20, 0) + transitTotal : 76) + 18
  }, 0)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = ITINERARY_START_Y + itineraryHeight + 72
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
  await drawRouteOverview(ctx, trip)

  let y = ITINERARY_START_Y
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
      for (const [activityIndex, activity] of items.entries()) {
        y += drawActivity(ctx, activity, y, accent)
        if (items[activityIndex + 1]) y += drawTransit(ctx, activity, items[activityIndex + 1], y, accent)
      }
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
