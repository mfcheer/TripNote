// OSRM 公共服务：步行路线（foot profile）。失败时回退直线连接。
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot'

export interface WalkingRoute {
  points: { lat: number; lng: number }[]
  durationMinutes: number | null
  distanceMeters: number | null
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
