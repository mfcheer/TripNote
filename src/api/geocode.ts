// Nominatim 地理编码（OSM 官方，免费无 key，限频 1次/秒）
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse'

export interface GeoResult {
  lat: number
  lng: number
  label: string
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

async function searchWithAmap(query: string, key: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const url = `https://restapi.amap.com/v3/place/text?key=${encodeURIComponent(key)}&keywords=${encodeURIComponent(query)}&offset=5&page=1&extensions=base`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`高德地点搜索失败: ${res.status}`)
  const data = await res.json() as AmapPlaceResponse
  if (data.status !== '1') throw new Error('高德地点搜索失败')
  return (data.pois ?? []).flatMap((place) => {
    const [lng, lat] = (place.location ?? '').split(',').map(Number)
    if (!place.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return []
    const point = gcj02ToWgs84({ lat, lng })
    return [{ lat: point.lat, lng: point.lng, label: [place.name, place.address].filter(Boolean).join(', ') }]
  })
}

export async function searchPlaces(query: string, signal?: AbortSignal, amapWebServiceKey?: string): Promise<GeoResult[]> {
  if (amapWebServiceKey) {
    try {
      return await searchWithAmap(query, amapWebServiceKey, signal)
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error
      // Key 配置错误或服务暂不可用时，继续使用原有服务，避免搜索入口失效。
    }
  }
  await throttle()
  const url = `${NOMINATIM_SEARCH}?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=zh`
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

// 逆地理编码：坐标 → 地名（地图选点用）
export async function reverseGeocode(lat: number, lng: number, amapWebServiceKey?: string): Promise<string | null> {
  if (amapWebServiceKey) {
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
