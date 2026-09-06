// OSRM 公共服务：步行路线（foot profile）。失败时回退直线连接。
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot'
const ROUTE_CACHE_KEY = 'tripnote-walking-route-cache-v1'
const ROUTE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000
const ROUTE_CACHE_MAX_ENTRIES = 80

export interface WalkingRoute {
  points: { lat: number; lng: number }[]
  durationMinutes: number | null
  distanceMeters: number | null
  fallback: boolean
}

type CachedRoute = Omit<WalkingRoute, 'fallback'> & { cachedAt: number }

const routeMemoryCache = new Map<string, CachedRoute>()

function cacheKeyFor(points: { lat: number; lng: number }[]) {
  // 五位小数约 1 米精度：相同两点重复规划会命中，同时避免 GPS 微小抖动产生无意义缓存。
  return points.map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join('|')
}

function isCachedRoute(value: unknown): value is CachedRoute {
  const route = value as Partial<CachedRoute>
  return !!route && typeof route.cachedAt === 'number' && Array.isArray(route.points)
    && route.points.every((point) => typeof point?.lat === 'number' && typeof point?.lng === 'number')
}

function readStoredRoutes(): Record<string, CachedRoute> {
  try {
    const value = JSON.parse(localStorage.getItem(ROUTE_CACHE_KEY) ?? '{}') as Record<string, unknown>
    return Object.entries(value).reduce<Record<string, CachedRoute>>((routes, [key, route]) => {
      if (isCachedRoute(route)) routes[key] = route
      return routes
    }, {})
  } catch {
    return {}
  }
}

function readCachedRoute(key: string): CachedRoute | null {
  const memoryRoute = routeMemoryCache.get(key)
  if (memoryRoute && Date.now() - memoryRoute.cachedAt < ROUTE_CACHE_TTL) return memoryRoute
  if (memoryRoute) routeMemoryCache.delete(key)

  const route = readStoredRoutes()[key]
  if (!route || Date.now() - route.cachedAt >= ROUTE_CACHE_TTL) return null
  routeMemoryCache.set(key, route)
  return route
}

function saveCachedRoute(key: string, route: Omit<WalkingRoute, 'fallback'>) {
  const cached = { ...route, cachedAt: Date.now() }
  routeMemoryCache.set(key, cached)
  try {
    const routes = readStoredRoutes()
    routes[key] = cached
    const retained = Object.entries(routes)
      .filter(([, value]) => cached.cachedAt - value.cachedAt < ROUTE_CACHE_TTL)
      .sort(([, a], [, b]) => b.cachedAt - a.cachedAt)
      .slice(0, ROUTE_CACHE_MAX_ENTRIES)
    localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(Object.fromEntries(retained)))
  } catch {
    // 本地存储不可用或空间不足时，内存缓存仍可让本次打开受益。
  }
}

// 包含距离与耗时的步行路线，供时间轴的相邻地点提示使用。
export async function fetchWalkingRouteInfo(
  points: { lat: number; lng: number }[],
  signal?: AbortSignal,
): Promise<WalkingRoute> {
  if (points.length < 2) return { points, durationMinutes: 0, distanceMeters: 0, fallback: false }
  const routeKey = cacheKeyFor(points)
  const cached = readCachedRoute(routeKey)
  if (cached) return { ...cached, fallback: false }
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`

  try {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error(data.code || 'no route')
    const route = data.routes[0]
    const distanceMeters = Number.isFinite(route.distance) ? Math.round(route.distance) : null
    const result = {
      points: route.geometry.coordinates.map((c: [number, number]) => ({ lat: c[1], lng: c[0] })),
      // 公共 OSRM 实例的 foot profile 不保证返回真实步行速度；以路线距离和 4.8km/h 估算，避免误导。
      durationMinutes: distanceMeters ? Math.max(1, Math.round(distanceMeters / 80)) : null,
      distanceMeters,
    }
    saveCachedRoute(routeKey, result)
    return { ...result, fallback: false }
  } catch {
    // 网络失败/超时：地图仍可用直线连接，时间轴则不展示不可靠的耗时。
    return { points, durationMinutes: null, distanceMeters: null, fallback: true }
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
