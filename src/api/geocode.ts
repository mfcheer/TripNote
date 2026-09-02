// Nominatim 地理编码（OSM 官方，免费无 key，限频 1次/秒）
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse'

export interface GeoResult {
  lat: number
  lng: number
  label: string
}

// 简易节流：保证两次请求间隔 ≥1.1s（遵守 Nominatim 使用政策）
let lastCall = 0

async function throttle() {
  const wait = 1100 - (Date.now() - lastCall)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
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
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
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
