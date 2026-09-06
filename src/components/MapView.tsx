import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { activitiesByDay, useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS } from './Icons'
import { CATEGORY_META } from '../types'
import { fetchWalkingRouteInfo } from '../api/route'
import AmapCanvas, { type AmapLine, type AmapMarker } from './AmapCanvas'

// 路线采用暖珊瑚红，和 OSM 的蓝绿水系、浅灰道路有足够反差；深浅仍表示行程推进。
const ROUTE_START_COLOR = '#ed8f79'
const ROUTE_END_COLOR = '#ad3f38'

function routeColor(dayIndex: number, totalDays: number) {
  if (totalDays <= 1) return ROUTE_END_COLOR
  const start = ROUTE_START_COLOR.match(/[a-f\d]{2}/gi)!.map((value) => Number.parseInt(value, 16))
  const end = ROUTE_END_COLOR.match(/[a-f\d]{2}/gi)!.map((value) => Number.parseInt(value, 16))
  const ratio = dayIndex / (totalDays - 1)
  const channel = (index: number) => Math.round(start[index] + (end[index] - start[index]) * ratio).toString(16).padStart(2, '0')
  return `#${channel(0)}${channel(1)}${channel(2)}`
}

function markerIcon(color: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<div class="map-place-marker" style="border-color:${color};color:${color}">${escapeHtml(label)}</div>`,
    iconSize: [140, 28],
    iconAnchor: [70, 14],
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!))
}

// 视角跟随筛选结果
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const key = points.join(',')
  useMemo(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 12)
    } else {
      map.fitBounds(L.latLngBounds(points).pad(0.15))
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// 一天的真实步行路线（OSRM，失败回退直线）
function DayRoute({ dayId, color, routeMode, onRouteFallback }: { dayId: string; color: string; routeMode: 'direct' | 'walking'; onRouteFallback: () => void }) {
  const trip = useActiveTrip()
  const geoItems = useMemo(
    () => activitiesByDay(trip, dayId).filter((a) => a.geo),
    [trip, dayId],
  )
  const [path, setPath] = useState<[number, number][]>([])

  useEffect(() => {
    const pts = geoItems.map((a) => ({ lat: a.geo!.lat, lng: a.geo!.lng }))
    if (pts.length < 2 || routeMode === 'direct') {
      setPath([])
      return
    }
    const ctrl = new AbortController()
    setPath(pts.map((p) => [p.lat, p.lng]))
    fetchWalkingRouteInfo(pts, ctrl.signal).then((route) => {
      if (!ctrl.signal.aborted) {
        if (route.fallback) onRouteFallback()
        setPath(route.points.map((p) => [p.lat, p.lng]))
      }
    })
    return () => ctrl.abort()
  }, [geoItems.map((a) => `${a.id}@${a.geo!.lat},${a.geo!.lng}`).join('|'), routeMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const directPath = geoItems.map((item) => [item.geo!.lat, item.geo!.lng] as [number, number])
  const visiblePath = routeMode === 'walking' ? path : directPath
  if (visiblePath.length < 2) return null
  return <Polyline positions={visiblePath} pathOptions={{ color, weight: 4, opacity: 0.94 }} />
}

export default function MapView() {
  const { setActiveDay, amapJsKey, mapRouteMode } = useTripStore()
  const trip = useActiveTrip()
  const [filter, setFilter] = useState<'all' | string>('all')
  const [amapUnavailable, setAmapUnavailable] = useState(false)
  const [routeFallback, setRouteFallback] = useState(false)

  const visibleDays = filter === 'all' ? trip.days : trip.days.filter((d) => d.id === filter)
  const routeRequestKey = visibleDays.flatMap((day) => activitiesByDay(trip, day.id).filter((activity) => activity.geo).map((activity) => `${activity.id}@${activity.geo!.lat},${activity.geo!.lng}`)).join('|')

  const allPoints = visibleDays.flatMap((d) =>
    activitiesByDay(trip, d.id)
      .filter((a) => a.geo)
      .map((a) => [a.geo!.lat, a.geo!.lng] as [number, number]),
  )

  // 总览中的跨日虚线把每天的路线串成完整旅程；虚线保留“过夜后继续”的语义。
  const crossDaySegments = useMemo(() => {
    if (filter !== 'all') return []
    return trip.days.flatMap((day, index) => {
      if (index === 0) return []
      const previousItems = activitiesByDay(trip, trip.days[index - 1].id).filter((activity) => activity.geo)
      const currentItems = activitiesByDay(trip, day.id).filter((activity) => activity.geo)
      const from = previousItems.at(-1)
      const to = currentItems.at(0)
      if (!from?.geo || !to?.geo) return []
      return [{ from, to, dayIndex: index }]
    })
  }, [filter, trip])

  useEffect(() => setAmapUnavailable(false), [amapJsKey])
  useEffect(() => setRouteFallback(false), [mapRouteMode, routeRequestKey])
  const handleAmapError = useCallback(() => setAmapUnavailable(true), [])
  const handleRouteFallback = useCallback(() => setRouteFallback(true), [])
  const useAmap = !!amapJsKey && !amapUnavailable
  const amapLines = useMemo<AmapLine[]>(() => [
    ...visibleDays.flatMap((day) => {
      const points = activitiesByDay(trip, day.id).filter((activity) => activity.geo).map((activity) => activity.geo!)
      return points.length > 1 ? [{ id: `day-${day.id}`, points, color: routeColor(trip.days.indexOf(day), trip.days.length), route: mapRouteMode === 'walking' }] : []
    }),
    ...crossDaySegments.map(({ from, to, dayIndex }) => ({
      id: `cross-${from.id}-${to.id}`,
      points: [from.geo!, to.geo!],
      color: routeColor(dayIndex, trip.days.length),
      dashed: true,
      weight: 3,
    })),
  ], [visibleDays, trip, crossDaySegments, mapRouteMode])
  const amapMarkers = useMemo<AmapMarker[]>(() => visibleDays.flatMap((day) => {
    const color = routeColor(trip.days.indexOf(day), trip.days.length)
    return activitiesByDay(trip, day.id)
      .filter((activity) => activity.geo)
      .map((activity) => ({
        id: activity.id,
        point: activity.geo!,
        label: activity.title,
        color,
        wide: true,
        onClick: () => useTripStore.getState().focusActivity(activity.id),
      }))
  }), [visibleDays, trip])

  return (
    <div className="trip-map-view relative h-full w-full">
      {/* 天数筛选 */}
      <div className="absolute inset-x-3 top-3 z-[500] overflow-x-auto pb-1 md:inset-x-auto md:top-4 md:left-1/2 md:-translate-x-1/2">
        <div className="mx-auto flex w-max items-center gap-1 rounded-full border border-border bg-white p-1 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
          {[{ id: 'all', label: '全部' }, ...trip.days.map((d) => ({ id: d.id, label: d.label }))].map((item) => {
            const active = filter === item.id
            return (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  active ? 'bg-accent text-white' : 'text-text-muted hover:bg-surface'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {useAmap ? (
        <AmapCanvas apiKey={amapJsKey} markers={amapMarkers} lines={amapLines} className="h-full w-full" zoom={9} onError={handleAmapError} onRouteFallback={handleRouteFallback} />
      ) : (
      <MapContainer center={[34.9, 135.6]} zoom={9} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={allPoints} />

        {crossDaySegments.map(({ from, to, dayIndex }) => (
          <Polyline
            key={`${from.id}-${to.id}`}
            positions={[[from.geo!.lat, from.geo!.lng], [to.geo!.lat, to.geo!.lng]]}
            pathOptions={{ color: routeColor(dayIndex, trip.days.length), weight: 3, opacity: 0.9, dashArray: '7 8' }}
          />
        ))}

        {visibleDays.map((day) => {
          const color = routeColor(trip.days.indexOf(day), trip.days.length)
          const geoItems = activitiesByDay(trip, day.id).filter((a) => a.geo)
          return (
            <div key={day.id}>
              <DayRoute dayId={day.id} color={color} routeMode={mapRouteMode} onRouteFallback={handleRouteFallback} />
              {geoItems.map((a) => {
                const Icon = CATEGORY_ICONS[a.category]
                return (
                  <Marker
                    key={a.id}
                    position={[a.geo!.lat, a.geo!.lng]}
                    icon={markerIcon(color, a.title)}
                    eventHandlers={{
                      click: () => {
                        useTripStore.getState().focusActivity(a.id)
                      },
                    }}
                  >
                    <Popup>
                      <div className="min-w-[160px]">
                        <div className="flex items-center gap-1.5 font-medium" style={{ color }}>
                          <Icon size={13} />
                          {a.title}
                        </div>
                        <div className="mt-1 text-[12px] text-text-muted">
                          {day.label} {a.time}
                          {a.location && ` · ${a.location}`}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </div>
          )
        })}
      </MapContainer>
      )}

      {/* 图例 */}
      <div className="absolute right-4 bottom-6 z-[500] hidden rounded-lg border border-border bg-white/95 px-3.5 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.08)] backdrop-blur md:block">
        <div className="mb-1.5 text-[11px] font-semibold text-text-muted">行程进度</div>
        <div className="mb-2 flex items-center gap-1 text-[10.5px] text-text-faint">
          <span>第 1 天</span>
          <span className="h-1 flex-1 rounded-full bg-[linear-gradient(90deg,#ed8f79,#ad3f38)]" />
          <span>最后一天</span>
        </div>
        {trip.days.map((d, i) => (
          <button
            key={d.id}
            onClick={() => {
              setFilter(d.id)
              setActiveDay(d.id)
            }}
            className={`flex w-full items-center gap-2 rounded px-1 py-[3px] text-[12px] transition-colors hover:bg-surface ${
              filter === d.id ? 'font-medium' : 'text-text-muted'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: routeColor(i, trip.days.length) }} />
            {d.label} · {d.place}
          </button>
        ))}
        {crossDaySegments.length > 0 && (
          <div className="mt-2 border-t border-border pt-2 text-[11px] text-text-faint">
            <span className="mr-1 inline-block w-5 align-middle border-t-2 border-dashed" style={{ borderColor: routeColor(1, Math.max(trip.days.length, 2)) }} />
            虚线为跨日衔接；{mapRouteMode === 'walking' ? '步行路线' : '直线连接'}由浅至深代表行程推进
          </div>
        )}
        {routeFallback && mapRouteMode === 'walking' && <div className="mt-1.5 text-[11px] text-amber-700">步行路线请求失败，已显示直线连线。</div>}
      </div>

      {/* 当前选中类别说明（保持设计系统中分类色一致） */}
      <div className="absolute top-4 left-[64px] z-[500] hidden rounded-lg border border-border bg-white/95 px-3 py-2 shadow-[0_2px_10px_rgba(0,0,0,0.08)] backdrop-blur md:block">
        <div className="text-[12px] font-semibold">{trip.name}</div>
        <div className="mt-0.5 text-[11px] text-text-muted">
          {filter === 'all' ? `${trip.daysCount} 天行程${useAmap ? ' · 高德地图' : ''}` : trip.days.find((d) => d.id === filter)?.place}
        </div>
      </div>
      <span className="hidden">{CATEGORY_META.sight.label}</span>
    </div>
  )
}
