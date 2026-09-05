// OSRM 公共服务：步行路线（foot profile）。失败时回退直线连接。
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot'

export interface WalkingRoute {
  points: { lat: number; lng: number }[]
  durationMinutes: number | null
  distanceMeters: number | null
}

const amapRouteCache = new Map<string, { lat: number; lng: number }[]>()

// 高德步行路线一次只处理一对起终点；结果转回 TripNote 统一使用的 WGS84 坐标。
export async function fetchAmapWalkingRoute(
  points: { lat: number; lng: number }[],
  key: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lng: number }[]> {
  if (points.length < 2 || !key) return points
  const segments = await Promise.all(points.slice(1).map(async (destination, index) => {
    const origin = points[index]
    const cacheKey = `${key}:${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`
    const cached = amapRouteCache.get(cacheKey)
    if (cached) return cached
    const from = wgs84ToGcj02(origin)
    const to = wgs84ToGcj02(destination)
    const url = `https://restapi.amap.com/v3/direction/walking?key=${encodeURIComponent(key)}&origin=${from.lng},${from.lat}&destination=${to.lng},${to.lat}`
    const response = await fetch(url, { signal })
    const data = await response.json() as { status?: string; route?: { paths?: Array<{ steps?: Array<{ polyline?: string }> }> } }
    if (!response.ok || data.status !== '1') throw new Error('高德步行路线请求失败')
    const path = data.route?.paths?.[0]?.steps?.flatMap((step) =>
      (step.polyline ?? '').split(';').flatMap((coordinate) => {
        const [lng, lat] = coordinate.split(',').map(Number)
        return Number.isFinite(lat) && Number.isFinite(lng) ? [gcj02ToWgs84({ lat, lng })] : []
      }),
    ) ?? []
    const result = path.length > 1 ? path : [origin, destination]
    amapRouteCache.set(cacheKey, result)
    return result
  }))
  return segments.flatMap((segment, index) => index === 0 ? segment : segment.slice(1))
}

// 包含距离与耗时的步行路线，供时间轴的相邻地点提示使用。
export async function fetchWalkingRouteInfo(
  points: { lat: number; lng: number }[],
  signal?: AbortSignal,
): Promise<WalkingRoute> {
  if (points.length < 2) return { points, durationMinutes: 0, distanceMeters: 0 }
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`

  try {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error(data.code || 'no route')
    const route = data.routes[0]
    const distanceMeters = Number.isFinite(route.distance) ? Math.round(route.distance) : null
    return {
      points: route.geometry.coordinates.map((c: [number, number]) => ({ lat: c[1], lng: c[0] })),
      // 公共 OSRM 实例的 foot profile 不保证返回真实步行速度；以路线距离和 4.8km/h 估算，避免误导。
      durationMinutes: distanceMeters ? Math.max(1, Math.round(distanceMeters / 80)) : null,
      distanceMeters,
    }
  } catch {
    // 网络失败/超时：地图仍可用直线连接，时间轴则不展示不可靠的耗时。
    return { points, durationMinutes: null, distanceMeters: null }
  }
}

export async function fetchWalkingRoute(
  points: { lat: number; lng: number }[],
  signal?: AbortSignal,
): Promise<{ lat: number; lng: number }[]> {
  return (await fetchWalkingRouteInfo(points, signal)).points
}

// 把一天内的地点按天序号批量请求（一天一条路线，避免请求数爆炸）
export async function fetchWalkingRoutes(
  dayGroups: { points: { lat: number; lng: number }[] }[],
  signal?: AbortSignal,
): Promise<{ lat: number; lng: number }[][]> {
  return Promise.all(dayGroups.map((g) => fetchWalkingRoute(g.points, signal)))
}
import { gcj02ToWgs84, wgs84ToGcj02 } from './coordinates'
