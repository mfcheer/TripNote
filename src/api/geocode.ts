import type { GeoPoint, Trip } from '../types'

// Nominatim 地理编码（OSM 官方，免费无 key，限频 1次/秒）
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse'

export interface GeoResult {
  lat: number
  lng: number
  label: string
}

export type PlaceSearchScope = 'day' | 'trip' | 'all'

export interface PlaceSearchContext {
  scope: PlaceSearchScope
  /** 当前天或整趟旅行的可用城市；高德按城市发起限定检索。 */
  cities?: string[]
  /** OSM 使用范围框做结果偏好或硬过滤，顺序为西、北、东、南。 */
  viewbox?: [number, number, number, number]
  /** 仅在可以从已有坐标可靠推断为中国境内时传递，避免误伤境外旅行。 */
  countryCode?: string
}

type AmapPlaceResponse = {
  status?: string
  pois?: Array<{ name?: string; address?: string; location?: string }>
}

type AmapReverseResponse = {
  status?: string
  regeocode?: { formatted_address?: string }
}

// 简易节流：保证两次请求间隔 ≥1.1s（遵守 Nominatim 使用政策）
let lastCall = 0

async function throttle() {
  const wait = 1100 - (Date.now() - lastCall)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
}

function normalizeCity(value?: string) {
  const city = value?.split(/[·、,，]/)[0]?.trim()
  return city && city !== '待定地点' && city !== '待定' ? city : undefined
}

function dedupeResults(results: GeoResult[]) {
  const seen = new Set<string>()
  return results.filter((result) => {
    const key = `${result.label}|${result.lat.toFixed(5)}|${result.lng.toFixed(5)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function searchWithAmap(query: string, key: string, signal?: AbortSignal, context?: PlaceSearchContext): Promise<GeoResult[]> {
  const cities = context?.scope === 'all' ? [] : (context?.cities ?? []).slice(0, 5)
  const searches = cities.length ? cities : [undefined]
  const responses = await Promise.all(searches.map(async (city) => {
    const params = new URLSearchParams({ key, keywords: query, offset: '5', page: '1', extensions: 'base' })
    if (city) {
      params.set('city', city)
      params.set('citylimit', 'true')
    }
    const res = await fetch(`https://restapi.amap.com/v3/place/text?${params}`, { signal })
    if (!res.ok) throw new Error(`高德地点搜索失败: ${res.status}`)
    const data = await res.json() as AmapPlaceResponse
    if (data.status !== '1') throw new Error('高德地点搜索失败')
    return (data.pois ?? []).flatMap((place) => {
      const [lng, lat] = (place.location ?? '').split(',').map(Number)
      if (!place.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return []
      const point = gcj02ToWgs84({ lat, lng })
      return [{ lat: point.lat, lng: point.lng, label: [place.name, place.address].filter(Boolean).join(', ') }]
    })
  }))
  return dedupeResults(responses.flat()).slice(0, 8)
}

export type PlaceSearchProvider = 'amap' | 'osm'

export async function searchPlaces(query: string, signal?: AbortSignal, amapWebServiceKey?: string, provider: PlaceSearchProvider = 'amap', context?: PlaceSearchContext): Promise<GeoResult[]> {
  if (provider === 'amap' && amapWebServiceKey) {
    try {
      return await searchWithAmap(query, amapWebServiceKey, signal, context)
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error
      // Key 配置错误或服务暂不可用时，继续使用原有服务，避免搜索入口失效。
    }
  }
  await throttle()
  const params = new URLSearchParams({ q: query, format: 'json', limit: '8', 'accept-language': 'zh-CN' })
  if (context?.countryCode) params.set('countrycodes', context.countryCode)
  if (context?.scope !== 'all' && context?.viewbox) {
    params.set('viewbox', context.viewbox.join(','))
    params.set('bounded', '1')
  }
  const url = `${NOMINATIM_SEARCH}?${params}`
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`地理编码请求失败: ${res.status}`)
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  return data.map((d) => ({
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    label: d.display_name,
  }))
}

function bboxForPoints(points: GeoPoint[], minimumDegrees: number) {
  if (!points.length) return undefined
  const lats = points.map((point) => point.lat)
  const lngs = points.map((point) => point.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latPadding = Math.max(minimumDegrees, (maxLat - minLat) * 0.35)
  const lngPadding = Math.max(minimumDegrees, (maxLng - minLng) * 0.35)
  return [minLng - lngPadding, maxLat + latPadding, maxLng + lngPadding, minLat - latPadding] as [number, number, number, number]
}

function appearsInChina(points: GeoPoint[]) {
  return points.length > 0 && points.every((point) => point.lat >= 17 && point.lat <= 54.5 && point.lng >= 73 && point.lng <= 135.5)
}

/**
 * 将当前旅行转换为服务可理解的搜索范围。当天优先使用小范围；整趟旅行则使用多城市 / 大范围；全国不附加限制。
 */
export function tripSearchContext(trip: Trip, activeDayId: string | null | undefined, scope: PlaceSearchScope): PlaceSearchContext {
  if (scope === 'all') return { scope }
  const allPoints = [
    ...trip.activities.flatMap((activity) => activity.geo ? [activity.geo] : []),
    ...trip.wishPlaces.flatMap((place) => place.geo ? [place.geo] : []),
  ]
  const activeDay = trip.days.find((day) => day.id === activeDayId)
  const dayPoints = activeDayId
    ? trip.activities.filter((activity) => activity.dayId === activeDayId).flatMap((activity) => activity.geo ? [activity.geo] : [])
    : []
  const dayCity = normalizeCity(activeDay?.place)
  const tripCities = [...new Set(trip.days.map((day) => normalizeCity(day.place)).filter((city): city is string => Boolean(city)))]
  if (scope === 'day') {
    const points = dayPoints.length ? dayPoints : allPoints
    return {
      scope,
      cities: dayCity ? [dayCity] : undefined,
      viewbox: bboxForPoints(points, 0.12),
      countryCode: appearsInChina(points) ? 'cn' : undefined,
    }
  }
  return {
    scope,
    cities: tripCities,
    viewbox: bboxForPoints(allPoints, 0.35),
    countryCode: appearsInChina(allPoints) ? 'cn' : undefined,
  }
}

// 逆地理编码：坐标 → 地名（地图选点用）
export async function reverseGeocode(lat: number, lng: number, amapWebServiceKey?: string, provider: PlaceSearchProvider = 'amap'): Promise<string | null> {
  if (provider === 'amap' && amapWebServiceKey) {
    try {
      const point = wgs84ToGcj02({ lat, lng })
      const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(amapWebServiceKey)}&location=${point.lng},${point.lat}&extensions=base`
      const res = await fetch(url)
      const data = await res.json() as AmapReverseResponse
      if (res.ok && data.status === '1') return data.regeocode?.formatted_address ?? null
    } catch {
      // 继续回退 Nominatim，选点不因第三方服务异常而中断。
    }
  }
  await throttle()
  const url = `${NOMINATIM_REVERSE}?lat=${lat}&lon=${lng}&format=json&accept-language=zh&zoom=16`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = (await res.json()) as { display_name?: string }
    return data.display_name ?? null
  } catch {
    return null
  }
}
import { gcj02ToWgs84, wgs84ToGcj02 } from './coordinates'
