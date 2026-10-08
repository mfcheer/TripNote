import type { GeoPoint, Trip, WishPlace } from '../types'

/** 不把同名但异地的景点合并；坐标结果按名称及约一米范围匹配。 */
export function findSavedPlace(places: WishPlace[], title: string, geo?: GeoPoint) {
  const normalized = title.trim().toLocaleLowerCase()
  return places.find((place) => place.title.trim().toLocaleLowerCase() === normalized && (!geo || (place.geo
    && Math.abs(place.geo.lat - geo.lat) < 0.00001 && Math.abs(place.geo.lng - geo.lng) < 0.00001)))
}

// Nominatim 地理编码（OSM 官方，免费无 key，限频 1次/秒）
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse'

export interface GeoResult {
  lat: number
  lng: number
  label: string
  /** 搜索结果来自旅行范围内，还是为避免漏项补充的更广范围。 */
  scope?: 'trip' | 'broader'
}

export function splitPlaceResults(results: GeoResult[]) {
  return {
    trip: results.filter((result) => result.scope === 'trip'),
    broader: results.filter((result) => result.scope !== 'trip'),
  }
}

export interface PlaceSearchContext {
  /** 旅行的主要区域，用于没有坐标的新旅程。 */
  region?: string
  /** 整趟旅行的可用城市；高德按城市发起限定检索。 */
  cities?: string[]
  /** OSM 使用范围框优先查找，顺序为西、北、东、南。 */
  viewbox?: [number, number, number, number]
  /** 仅在可以从已有坐标可靠推断为中国境内时传递，避免误伤境外旅行。 */
  countryCode?: string
}

type RegionPreset = Required<Pick<PlaceSearchContext, 'region' | 'cities' | 'viewbox' | 'countryCode'>>

// 常见环线名称并不是标准行政区。用小型本地词库先消除这类歧义；其余目的地仍会通过名称和已收集地点逐步收敛。
const REGION_PRESETS: Array<{ aliases: string[]; context: RegionPreset }> = [
  { aliases: ['东北', '东北大环线', '东北环线'], context: { region: '东北地区', cities: ['哈尔滨', '伊春', '漠河', '吉林市', '延吉', '长白山'], viewbox: [118, 54.5, 135.5, 40.5], countryCode: 'cn' } },
  { aliases: ['关西', '日本关西'], context: { region: '日本关西', cities: ['大阪', '京都', '奈良', '神户'], viewbox: [134.2, 35.7, 136.5, 33.7], countryCode: 'jp' } },
]

// 开放地理库常只收录当地文字或罗马字。先覆盖少量高频旅行地别名，
// 并保留原词查询，让用户不需要理解底层语言或改用另一套地图服务。
const PLACE_ALIASES: Record<string, string[]> = {
  '涯月邑': ['애월읍', 'Aewol-eup'],
  '牛岛': ['우도', 'Udo'],
  '城山日出峰': ['성산일출봉', 'Seongsan Ilchulbong'],
  '汉拿山': ['한라산', 'Hallasan'],
  '济州岛': ['제주도', 'Jeju'],
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

function normalizeSearchRegion(value?: string) {
  return value?.replace(/[（(].*?[）)]/g, '').replace(/(?:旅行计划|旅行|行程|之旅)$/g, '').trim() || undefined
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

function normalizedSearchText(value: string) {
  return value.replace(/[\s·、,，'"（）()]/g, '').toLocaleLowerCase()
}

function queryVariants(query: string) {
  return [query, ...(PLACE_ALIASES[query.trim()] ?? [])]
}

function hasExactQueryMatch(results: GeoResult[], query: string) {
  const variants = queryVariants(query).map(normalizedSearchText)
  return results.some((result) => {
    const label = normalizedSearchText(result.label)
    return variants.some((variant) => label.includes(variant))
  })
}

// 本地有一个明确命中就优先保留，不能仅因候选较少而塞入全球同名地点。
function needsGlobalFallback(results: GeoResult[], query: string) {
  return !hasExactQueryMatch(results, query)
}

function withScope(results: GeoResult[], scope: NonNullable<GeoResult['scope']>) {
  return results.map((result) => ({ ...result, scope }))
}

async function searchWithAmap(query: string, key: string, signal?: AbortSignal, context?: PlaceSearchContext, global = false): Promise<GeoResult[]> {
  const cities = global ? [] : (context?.cities ?? []).slice(0, 5)
  const searches = cities.length ? cities : [undefined]
  const responses = await Promise.all(searches.map(async (city) => {
    const contextualQuery = !global && !city && context?.region ? `${context.region} ${query}` : query
    const params = new URLSearchParams({ key, keywords: contextualQuery, offset: '5', page: '1', extensions: 'base' })
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
      let localResults = await searchWithAmap(query, amapWebServiceKey, signal, context)
      if (needsGlobalFallback(localResults, query)) {
        for (const alias of queryVariants(query).slice(1)) {
          localResults = dedupeResults([...localResults, ...await searchWithAmap(alias, amapWebServiceKey, signal, context)])
          if (!needsGlobalFallback(localResults, query)) break
        }
      }
      localResults = withScope(localResults, context ? 'trip' : 'broader')
      // 区域内没有足够候选时自动补一次无范围检索，用户无需理解或切换搜索范围。
      if (!needsGlobalFallback(localResults, query) || !context) return localResults
      const expandedResults = rankResults(dedupeResults([...localResults, ...withScope(await searchWithAmap(query, amapWebServiceKey, signal, context, true), 'broader')]), context, query).slice(0, 8)
      // 高德对境外 POI 的覆盖不稳定；完全没有候选时继续使用 OSM 的全球兜底。
      if (!needsGlobalFallback(expandedResults, query)) return expandedResults
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error
      // Key 配置错误或服务暂不可用时，继续使用原有服务，避免搜索入口失效。
    }
  }
  await throttle()
  const contextualQuery = context?.region && !context.viewbox ? `${context.region} ${query}` : query
  const params = new URLSearchParams({ q: contextualQuery, format: 'json', limit: '8', 'accept-language': 'zh-CN' })
  if (context?.countryCode) params.set('countrycodes', context.countryCode)
  if (context?.viewbox) {
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
  let localResults: GeoResult[] = withScope(data.map((d) => ({
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    label: d.display_name,
  })), context ? 'trip' : 'broader')
  if (needsGlobalFallback(localResults, query) && context) {
    for (const alias of queryVariants(query).slice(1)) {
      await throttle()
      const aliasParams = new URLSearchParams(params)
      aliasParams.set('q', context.region && !context.viewbox ? `${context.region} ${alias}` : alias)
      const aliasResponse = await fetch(`${NOMINATIM_SEARCH}?${aliasParams}`, { signal, headers: { Accept: 'application/json' } })
      if (!aliasResponse.ok) continue
      const aliasData = (await aliasResponse.json()) as Array<{ lat: string; lon: string; display_name: string }>
      localResults = dedupeResults([...localResults, ...withScope(aliasData.map((d) => ({ lat: parseFloat(d.lat), lng: parseFloat(d.lon), label: d.display_name })), 'trip')])
      if (!needsGlobalFallback(localResults, query)) break
    }
  }
  if (!needsGlobalFallback(localResults, query) || !context?.viewbox) return localResults
  await throttle()
  const fallbackParams = new URLSearchParams({ q: query, format: 'json', limit: '8', 'accept-language': 'zh-CN' })
  // 这一轮是真正的全球兜底，不能沿用旅行区域的国家限制。
  const fallback = await fetch(`${NOMINATIM_SEARCH}?${fallbackParams}`, { signal, headers: { Accept: 'application/json' } })
  if (!fallback.ok) {
    if (localResults.length) return localResults
    throw new Error(`地理编码请求失败: ${fallback.status}`)
  }
  const fallbackData = (await fallback.json()) as Array<{ lat: string; lon: string; display_name: string }>
  return rankResults(dedupeResults([...localResults, ...withScope(fallbackData.map((d) => ({ lat: parseFloat(d.lat), lng: parseFloat(d.lon), label: d.display_name })), 'broader')]), context, query).slice(0, 8)
}

function rankResults(results: GeoResult[], context: PlaceSearchContext, query = '') {
  const tokens = [context.region, ...(context.cities ?? [])].filter(Boolean).map((value) => value!.toLocaleLowerCase())
  return results.map((result, index) => ({ result, index, score: tokens.reduce((score, token) => score + (result.label.toLocaleLowerCase().includes(token) ? 100 : 0), 0) + (hasExactQueryMatch([result], query) ? 500 : 0) + (result.scope === 'trip' ? 20 : 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ result }) => result)
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
 * 将旅行已有的区域、日期城市与坐标转为搜索上下文。用户无需在搜索时选择范围。
 */
export function tripSearchContext(trip: Trip): PlaceSearchContext | undefined {
  const allPoints = [
    ...trip.activities.flatMap((activity) => activity.geo ? [activity.geo] : []),
    ...trip.wishPlaces.flatMap((place) => place.geo ? [place.geo] : []),
  ]
  const tripCities = [...new Set(trip.days.map((day) => normalizeCity(day.place)).filter((city): city is string => Boolean(city)))]
  const region = normalizeSearchRegion(trip.searchRegion) ?? tripCities[0] ?? normalizeSearchRegion(trip.name)
  const preset = region ? REGION_PRESETS.find((item) => item.aliases.some((alias) => region.includes(alias)))?.context : undefined
  const inferredBox = bboxForPoints(allPoints, 0.35)
  if (!region && !inferredBox && tripCities.length === 0) return undefined
  return {
    region: preset?.region ?? region,
    cities: [...new Set([...(preset?.cities ?? []), ...tripCities])].slice(0, 5),
    viewbox: inferredBox ?? preset?.viewbox,
    countryCode: appearsInChina(allPoints) ? 'cn' : preset?.countryCode,
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
