import type { GeoPoint } from '../types'

// 高德底图使用 GCJ-02；北向内部统一保存 WGS84，保证既有 OSM 数据和导出数据不变。
const PI = Math.PI
const AXIS = 6378245.0
const OFFSET = 0.006693421622965943

function outsideChina({ lat, lng }: GeoPoint) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(lng: number, lat: number) {
  let result = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  result += (20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2 / 3
  result += (20 * Math.sin(lat * PI) + 40 * Math.sin(lat / 3 * PI)) * 2 / 3
  return result + (160 * Math.sin(lat / 12 * PI) + 320 * Math.sin(lat * PI / 30)) * 2 / 3
}

function transformLng(lng: number, lat: number) {
  let result = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  result += (20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2 / 3
  result += (20 * Math.sin(lng * PI) + 40 * Math.sin(lng / 3 * PI)) * 2 / 3
  return result + (150 * Math.sin(lng / 12 * PI) + 300 * Math.sin(lng / 30 * PI)) * 2 / 3
}

export function wgs84ToGcj02(point: GeoPoint): GeoPoint {
  if (outsideChina(point)) return point
  const lng = point.lng - 105
  const lat = point.lat - 35
  let latOffset = transformLat(lng, lat)
  let lngOffset = transformLng(lng, lat)
  const radLat = point.lat / 180 * PI
  let magic = Math.sin(radLat)
  magic = 1 - OFFSET * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  latOffset = (latOffset * 180) / ((AXIS * (1 - OFFSET)) / (magic * sqrtMagic) * PI)
  lngOffset = (lngOffset * 180) / (AXIS / sqrtMagic * Math.cos(radLat) * PI)
  return { lat: point.lat + latOffset, lng: point.lng + lngOffset }
}

export function gcj02ToWgs84(point: GeoPoint): GeoPoint {
  if (outsideChina(point)) return point
  const converted = wgs84ToGcj02(point)
  return { lat: point.lat * 2 - converted.lat, lng: point.lng * 2 - converted.lng }
}
