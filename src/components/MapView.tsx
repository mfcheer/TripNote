import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { activitiesByDay, useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS, MapIcon, PlusIcon } from './Icons'
import { CATEGORY_META, type Activity, type ActivityCategory, type GeoPoint, type TripDay } from '../types'
import { fetchWalkingRouteInfo, isWalkableRoute, straightLineDistanceMeters } from '../api/route'
import { reverseGeocode } from '../api/geocode'
import AmapCanvas, { type AmapLine, type AmapMarker } from './AmapCanvas'
import { useToastStore } from './toastStore'

// 高对比暖色阶：金橙至酒红表达行程推进，配合白色底描边确保在不同地图底色上清晰可见。
const ROUTE_COLORS = ['#E9A668', '#EA795A', '#D9534F', '#B63E44', '#7F344A']

function routeColor(dayIndex: number, totalDays: number) {
  if (totalDays <= 1) return ROUTE_COLORS.at(-1)!
  const position = (dayIndex / (totalDays - 1)) * (ROUTE_COLORS.length - 1)
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.min(lowerIndex + 1, ROUTE_COLORS.length - 1)
  const ratio = position - lowerIndex
  const lower = ROUTE_COLORS[lowerIndex].match(/[a-f\d]{2}/gi)!.map((value) => Number.parseInt(value, 16))
  const upper = ROUTE_COLORS[upperIndex].match(/[a-f\d]{2}/gi)!.map((value) => Number.parseInt(value, 16))
  const channel = (index: number) => Math.round(lower[index] + (upper[index] - lower[index]) * ratio).toString(16).padStart(2, '0')
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

function clusterIcon(count: number) {
  return L.divIcon({
    className: '',
    html: `<div class="map-marker" style="border-color:#3d6382;color:#3d6382">${count}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

const pickedPointIcon = L.divIcon({
  className: '',
  html: '<div class="map-marker map-picked-marker">+</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

interface MapMarkerItem {
  activity: Activity
  day: TripDay
  color: string
}
interface MapMarkerGroup {
  id: string
  point: { lat: number; lng: number }
  items: MapMarkerItem[]
}

function groupNearbyMarkers(items: MapMarkerItem[]) {
  const groups: MapMarkerGroup[] = []
  for (const item of items) {
    const existing = groups.find((group) => straightLineDistanceMeters(group.point, item.activity.geo!) <= 80)
    if (existing) {
      existing.items.push(item)
      existing.point = {
        lat: existing.items.reduce((sum, entry) => sum + entry.activity.geo!.lat, 0) / existing.items.length,
        lng: existing.items.reduce((sum, entry) => sum + entry.activity.geo!.lng, 0) / existing.items.length,
      }
    } else {
      groups.push({ id: item.activity.id, point: item.activity.geo!, items: [item] })
    }
  }
  return groups
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

function MapPickHandler({ enabled, onPick }: { enabled: boolean; onPick: (point: GeoPoint) => void }) {
  useMapEvents({
    click: (event) => {
      if (enabled) onPick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
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
  const hasManualTransit = geoItems.slice(1).some((item) => item.travelMode && item.travelMode !== 'walk')
  const canUseWalkingRoute = isWalkableRoute(geoItems.map((item) => ({ lat: item.geo!.lat, lng: item.geo!.lng }))) && !hasManualTransit

  useEffect(() => {
    const pts = geoItems.map((a) => ({ lat: a.geo!.lat, lng: a.geo!.lng }))
    if (pts.length < 2 || routeMode === 'direct' || !canUseWalkingRoute) {
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
  }, [geoItems.map((a) => `${a.id}@${a.geo!.lat},${a.geo!.lng}:${a.travelMode ?? ''}`).join('|'), routeMode, canUseWalkingRoute]) // eslint-disable-line react-hooks/exhaustive-deps

  const directPath = geoItems.map((item) => [item.geo!.lat, item.geo!.lng] as [number, number])
  // 跨城或手动指定交通方式时，保留直线作为行程脉络，不伪装成步行路线。
  const visiblePath = routeMode === 'walking' && canUseWalkingRoute ? path : directPath
  if (visiblePath.length < 2) return null
  return <>
    <Polyline positions={visiblePath} pathOptions={{ color: '#fffdf9', weight: 9, opacity: 0.9 }} />
    <Polyline positions={visiblePath} pathOptions={{ color, weight: 4, opacity: 0.98 }} />
  </>
}

export default function MapView() {
  const { setActiveDay, amapJsKey, amapWebServiceKey, mapRouteMode, addWishPlace, removeWishPlace } = useTripStore()
  const trip = useActiveTrip()
  const [filter, setFilter] = useState<'all' | string>('all')
  const [amapUnavailable, setAmapUnavailable] = useState(false)
  const [routeFallback, setRouteFallback] = useState(false)
  const [openCluster, setOpenCluster] = useState<MapMarkerGroup | null>(null)
  const [isPicking, setIsPicking] = useState(false)
  const [pickedPoint, setPickedPoint] = useState<GeoPoint | null>(null)
  const [pickedName, setPickedName] = useState('')
  const [pickedLocation, setPickedLocation] = useState('')
  const [pickedCategory, setPickedCategory] = useState<ActivityCategory>('sight')
  const [resolvingPoint, setResolvingPoint] = useState(false)
  const pickRequestRef = useRef(0)

  const visibleDays = filter === 'all' ? trip.days : trip.days.filter((d) => d.id === filter)
  const routeRequestKey = visibleDays.flatMap((day) => activitiesByDay(trip, day.id).filter((activity) => activity.geo).map((activity) => `${activity.id}@${activity.geo!.lat},${activity.geo!.lng}`)).join('|')

  const allPoints = visibleDays.flatMap((d) =>
    activitiesByDay(trip, d.id)
      .filter((a) => a.geo)
      .map((a) => [a.geo!.lat, a.geo!.lng] as [number, number]),
  )
  const markerGroups = useMemo(() => groupNearbyMarkers(visibleDays.flatMap((day) => {
    const color = routeColor(trip.days.indexOf(day), trip.days.length)
    return activitiesByDay(trip, day.id).filter((activity) => activity.geo).map((activity) => ({ activity, day, color }))
  })), [visibleDays, trip])

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
  useEffect(() => setOpenCluster(null), [filter])
  const handleAmapError = useCallback(() => setAmapUnavailable(true), [])
  const handleRouteFallback = useCallback(() => setRouteFallback(true), [])
  const handleMapPick = useCallback(async (point: GeoPoint) => {
    setPickedPoint(point)
    setPickedLocation(`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`)
    const requestId = ++pickRequestRef.current
    setResolvingPoint(true)
    try {
      const location = await reverseGeocode(point.lat, point.lng, amapWebServiceKey)
      if (requestId !== pickRequestRef.current) return
      if (!location) return
      setPickedLocation(location)
      setPickedName((current) => current || location.split(',')[0])
    } finally {
      if (requestId === pickRequestRef.current) setResolvingPoint(false)
    }
  }, [amapWebServiceKey])
  const stopPicking = useCallback(() => {
    pickRequestRef.current += 1
    setIsPicking(false)
    setPickedPoint(null)
    setPickedName('')
    setPickedLocation('')
    setResolvingPoint(false)
  }, [])
  const savePickedPlace = useCallback(() => {
    if (!pickedPoint || !pickedName.trim()) return
    const title = pickedName.trim()
    const id = addWishPlace({
      title,
      category: pickedCategory,
      location: pickedLocation.trim() || `${pickedPoint.lat.toFixed(5)}, ${pickedPoint.lng.toFixed(5)}`,
      geo: pickedPoint,
    })
    stopPicking()
    useToastStore.getState().show(`已收藏「${title}」到想去清单`, {
      undo: () => removeWishPlace(id),
    })
  }, [addWishPlace, pickedCategory, pickedLocation, pickedName, pickedPoint, removeWishPlace, stopPicking])
  const useAmap = !!amapJsKey && !amapUnavailable
  const amapLines = useMemo<AmapLine[]>(() => [
    ...visibleDays.flatMap((day) => {
      const points = activitiesByDay(trip, day.id).filter((activity) => activity.geo).map((activity) => activity.geo!)
      return points.length > 1 ? [{ id: `day-${day.id}`, points, color: routeColor(trip.days.indexOf(day), trip.days.length), route: mapRouteMode === 'walking' && isWalkableRoute(points) }] : []
    }),
    ...crossDaySegments.map(({ from, to, dayIndex }) => ({
      id: `cross-${from.id}-${to.id}`,
      points: [from.geo!, to.geo!],
      color: routeColor(dayIndex, trip.days.length),
      dashed: true,
      weight: 3,
    })),
  ], [visibleDays, trip, crossDaySegments, mapRouteMode])
  const amapMarkers = useMemo<AmapMarker[]>(() => [...markerGroups.map((group) => {
    const single = group.items[0]
    return group.items.length === 1
      ? { id: single.activity.id, point: group.point, label: single.activity.title, color: single.color, wide: true, onClick: () => useTripStore.getState().focusActivity(single.activity.id) }
      : { id: `cluster-${group.id}`, point: group.point, label: String(group.items.length), onClick: () => setOpenCluster(group) }
  }), ...(pickedPoint ? [{ id: 'picked-wish-place', point: pickedPoint, label: '+', color: '#c55e4e', active: true }] : [])], [markerGroups, pickedPoint])

  return (
    <div className={`trip-map-view relative h-full w-full ${isPicking ? 'cursor-crosshair' : ''}`}>
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

      <button
        onClick={() => isPicking ? stopPicking() : setIsPicking(true)}
        className={`absolute top-3 right-3 z-[550] flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition-colors md:top-4 md:right-4 ${
          isPicking ? 'border-accent bg-accent text-white' : 'border-border bg-white/95 text-text-muted hover:border-accent hover:text-accent'
        }`}
      >
        {isPicking ? '取消选点' : <><PlusIcon size={14} /> 选点收藏</>}
      </button>

      {isPicking && !pickedPoint && (
        <div className="absolute top-16 left-3 z-[550] rounded-lg border border-accent/30 bg-white/95 px-3 py-2 text-[12px] text-text-muted shadow-[0_2px_10px_rgba(0,0,0,0.08)] backdrop-blur md:top-[64px] md:left-4">
          点击地图空白处，收藏一个想去地点
        </div>
      )}

      {useAmap ? (
        <AmapCanvas apiKey={amapJsKey} markers={amapMarkers} lines={amapLines} className="h-full w-full" zoom={9} onMapPick={isPicking ? handleMapPick : undefined} onError={handleAmapError} onRouteFallback={handleRouteFallback} />
      ) : (
      <MapContainer center={[34.9, 135.6]} zoom={9} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={allPoints} />
        <MapPickHandler enabled={isPicking} onPick={handleMapPick} />

        {crossDaySegments.map(({ from, to, dayIndex }) => {
          const positions = [[from.geo!.lat, from.geo!.lng], [to.geo!.lat, to.geo!.lng]] as [number, number][]
          return <Fragment key={`${from.id}-${to.id}`}>
            <Polyline positions={positions} pathOptions={{ color: '#fffdf9', weight: 7, opacity: 0.86, dashArray: '7 8' }} />
            <Polyline positions={positions} pathOptions={{ color: routeColor(dayIndex, trip.days.length), weight: 3, opacity: 0.96, dashArray: '7 8' }} />
          </Fragment>
        })}

        {visibleDays.map((day) => <DayRoute key={day.id} dayId={day.id} color={routeColor(trip.days.indexOf(day), trip.days.length)} routeMode={mapRouteMode} onRouteFallback={handleRouteFallback} />)}
        {markerGroups.map((group) => group.items.length === 1 ? (() => {
          const { activity, day, color } = group.items[0]
          const Icon = CATEGORY_ICONS[activity.category]
          return <Marker key={activity.id} position={[group.point.lat, group.point.lng]} icon={markerIcon(color, activity.title)} eventHandlers={{ click: () => useTripStore.getState().focusActivity(activity.id) }}>
            <Popup><div className="min-w-[160px]"><div className="flex items-center gap-1.5 font-medium" style={{ color }}><Icon size={13} />{activity.title}</div><div className="mt-1 text-[12px] text-text-muted">{day.label} {activity.time}{activity.location && ` · ${activity.location}`}</div></div></Popup>
          </Marker>
        })() : (
          <Marker key={`cluster-${group.id}`} position={[group.point.lat, group.point.lng]} icon={clusterIcon(group.items.length)}>
            <Popup><div className="min-w-[180px]"><div className="mb-1.5 text-[12px] font-semibold">{group.items.length} 个重叠地点</div>{group.items.map(({ activity, day }) => <button key={activity.id} onClick={() => useTripStore.getState().focusActivity(activity.id)} className="block w-full truncate rounded px-1 py-1 text-left text-[12px] hover:bg-surface">{day.label} · {activity.title}</button>)}</div></Popup>
          </Marker>
        ))}
        {pickedPoint && <Marker position={[pickedPoint.lat, pickedPoint.lng]} icon={pickedPointIcon} interactive={false} />}
      </MapContainer>
      )}

      {isPicking && pickedPoint && (
        <div className="absolute inset-x-3 bottom-3 z-[600] rounded-xl border border-border bg-white p-3 shadow-[0_8px_24px_rgba(20,34,52,0.18)] md:inset-x-auto md:right-4 md:bottom-5 md:w-[310px]">
          <div className="mb-2 flex items-center justify-between gap-1.5 text-[12px] font-semibold text-text"><span className="flex items-center gap-1.5"><MapIcon size={14} /> 已选位置</span><button onClick={stopPicking} className="font-normal text-text-faint hover:text-text-muted">取消</button></div>
          <input value={pickedName} onChange={(event) => setPickedName(event.target.value)} placeholder="给这个地点起个名称" className="w-full rounded-md border border-border px-2.5 py-2 text-[12.5px] outline-none focus:border-accent" autoFocus />
          <div className="mt-2 flex gap-2">
            <select value={pickedCategory} onChange={(event) => setPickedCategory(event.target.value as ActivityCategory)} className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1.5 text-[12px] text-text-muted outline-none focus:border-accent">
              {(Object.keys(CATEGORY_META) as ActivityCategory[]).map((category) => <option key={category} value={category}>{CATEGORY_META[category].label}</option>)}
            </select>
            <button onClick={savePickedPlace} disabled={!pickedName.trim()} className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40">收藏到想去</button>
          </div>
          <div className="mt-2 truncate text-[11px] text-text-faint">{resolvingPoint ? '正在识别附近位置…' : pickedLocation}</div>
        </div>
      )}

      {openCluster && (
        <div className="absolute top-16 left-4 z-[600] w-[230px] rounded-lg border border-border bg-white p-2 shadow-[0_4px_16px_rgba(0,0,0,0.14)]">
          <div className="mb-1 flex items-center justify-between px-1"><span className="text-[12px] font-semibold">{openCluster.items.length} 个重叠地点</span><button onClick={() => setOpenCluster(null)} className="text-[16px] leading-none text-text-faint">×</button></div>
          {openCluster.items.map(({ activity, day }) => <button key={activity.id} onClick={() => useTripStore.getState().focusActivity(activity.id)} className="block w-full truncate rounded px-1.5 py-1.5 text-left text-[12px] hover:bg-surface"><span className="mr-1 text-text-faint">{day.label}</span>{activity.title}</button>)}
        </div>
      )}

      {/* 图例 */}
      <div className="absolute right-4 bottom-6 z-[500] hidden rounded-lg border border-border bg-white/95 px-3.5 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.08)] backdrop-blur md:block">
        <div className="mb-1.5 text-[11px] font-semibold text-text-muted">行程进度</div>
        <div className="mb-2 flex items-center gap-1 text-[10.5px] text-text-faint">
          <span>第 1 天</span>
          <span className="h-1 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${ROUTE_COLORS.join(', ')})` }} />
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
