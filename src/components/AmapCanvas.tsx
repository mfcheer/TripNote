import { useEffect, useRef, useState } from 'react'
import { gcj02ToWgs84, wgs84ToGcj02 } from '../api/coordinates'
import { fetchWalkingRouteInfo } from '../api/route'
import type { GeoPoint } from '../types'

interface AmapLngLat {
  getLng: () => number
  getLat: () => number
}
interface AmapOverlay {
  on: (event: string, handler: () => void) => void
}
interface AmapMapInstance {
  add: (overlays: AmapOverlay[]) => void
  clearMap: () => void
  setFitView: (overlays?: AmapOverlay[], immediately?: boolean, avoid?: number[]) => void
  setZoomAndCenter: (zoom: number, center: [number, number]) => void
  on: (event: string, handler: (event: { lnglat: AmapLngLat }) => void) => void
  destroy: () => void
}
interface AmapApi {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AmapMapInstance
  Marker: new (options: Record<string, unknown>) => AmapOverlay
  Polyline: new (options: Record<string, unknown>) => AmapOverlay
  Pixel: new (x: number, y: number) => unknown
}

declare global {
  interface Window { AMap?: AmapApi }
}

let loadingKey = ''
let loadingPromise: Promise<AmapApi> | null = null

function loadAmap(key: string) {
  if (window.AMap) return Promise.resolve(window.AMap)
  if (loadingPromise && loadingKey === key) return loadingPromise
  loadingKey = key
  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
    script.async = true
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error('高德地图加载失败'))
    script.onerror = () => reject(new Error('高德地图加载失败'))
    document.head.appendChild(script)
  })
  return loadingPromise
}

export interface AmapMarker {
  id: string
  point: GeoPoint
  label?: string
  color?: string
  active?: boolean
  simple?: boolean
  wide?: boolean
  onClick?: () => void
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!))
}

export interface AmapLine {
  id: string
  points: GeoPoint[]
  color: string
  dashed?: boolean
  weight?: number
  route?: boolean
}

export default function AmapCanvas({
  apiKey,
  markers,
  lines = [],
  className,
  zoom = 11,
  onMapPick,
  onError,
  onRouteFallback,
}: {
  apiKey: string
  markers: AmapMarker[]
  lines?: AmapLine[]
  className: string
  zoom?: number
  onMapPick?: (point: GeoPoint) => void
  onError?: () => void
  onRouteFallback?: () => void
}) {
  const elementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<AmapMapInstance | null>(null)
  const onMapPickRef = useRef(onMapPick)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onMapPickRef.current = onMapPick
  }, [onMapPick])

  useEffect(() => {
    let cancelled = false
    const element = elementRef.current
    if (!element || !apiKey) return
    loadAmap(apiKey)
      .then((AMap) => {
        if (cancelled) return
        mapRef.current = new AMap.Map(element, { zoom, viewMode: '2D', resizeEnable: true })
        mapRef.current.on('click', (event) => {
          onMapPickRef.current?.(gcj02ToWgs84({ lat: event.lnglat.getLat(), lng: event.lnglat.getLng() }))
        })
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) onError?.()
      })
    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
      setReady(false)
    }
  }, [apiKey, onError, zoom])

  useEffect(() => {
    if (!ready || !mapRef.current || !window.AMap) return
    const controller = new AbortController()
    const render = async () => {
    const AMap = window.AMap
    if (!AMap || !mapRef.current) return
    let didFallback = false
    const resolvedLines = await Promise.all(lines.map(async (line) => {
      if (!line.route) return line
      const route = await fetchWalkingRouteInfo(line.points, controller.signal)
      didFallback ||= route.fallback
      return { ...line, points: route.points }
    }))
    if (controller.signal.aborted || !mapRef.current) return
    if (didFallback) onRouteFallback?.()
    mapRef.current.clearMap()
    const overlays: AmapOverlay[] = []
    for (const line of resolvedLines) {
      if (line.points.length < 2) continue
      const path = line.points.map((point) => {
          const converted = wgs84ToGcj02(point)
          return [converted.lng, converted.lat]
        })
      // 先画白色底描边，再叠加日期色；保证路线不会被复杂底图吞没。
      const outline = new AMap.Polyline({
        path,
        strokeColor: '#fffdf9',
        strokeWeight: (line.weight ?? 4) + 5,
        strokeOpacity: 0.9,
        strokeStyle: line.dashed ? 'dashed' : 'solid',
        strokeDasharray: line.dashed ? [8, 8] : undefined,
      })
      const polyline = new AMap.Polyline({
        path,
        strokeColor: line.color,
        strokeWeight: line.weight ?? 4,
        strokeOpacity: 0.98,
        strokeStyle: line.dashed ? 'dashed' : 'solid',
        strokeDasharray: line.dashed ? [8, 8] : undefined,
      })
      overlays.push(outline, polyline)
    }
    for (const marker of markers) {
      const point = wgs84ToGcj02(marker.point)
      const color = marker.color ?? '#3d6382'
      const className = marker.simple ? `wish-map-marker${marker.active ? ' is-active' : ''}` : marker.wide ? 'map-place-marker' : 'map-marker'
      const content = marker.simple
        ? `<div class="${className}" style="--wish-marker-color:${color}"></div>`
        : `<div class="${className}" style="border-color:${color};color:${color};${marker.active ? 'background:#e9f1f7;' : ''}">${escapeHtml(marker.label ?? '')}</div>`
      const markerOverlay = new AMap.Marker({
        position: [point.lng, point.lat],
        content,
        offset: new AMap.Pixel(marker.simple ? -9 : marker.wide ? -70 : -13, marker.simple ? -9 : marker.wide ? -14 : -13),
        zIndex: marker.active ? 200 : 100,
      })
      if (marker.onClick) markerOverlay.on('click', marker.onClick)
      overlays.push(markerOverlay)
    }
    mapRef.current.add(overlays)
    if (overlays.length === 1 && markers.length === 1) {
      const point = wgs84ToGcj02(markers[0].point)
      mapRef.current.setZoomAndCenter(zoom, [point.lng, point.lat])
    } else if (overlays.length > 0) {
      mapRef.current.setFitView(overlays, false, [36, 36, 36, 36])
    }
    }
    void render()
    return () => controller.abort()
  }, [ready, markers, lines, zoom, onRouteFallback])

  return <div ref={elementRef} className={className}>{!ready && <div className="flex h-full items-center justify-center bg-surface text-[12px] text-text-faint">正在加载高德地图…</div>}</div>
}
