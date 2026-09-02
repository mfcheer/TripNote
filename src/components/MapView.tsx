import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { activitiesByDay, useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS } from './Icons'
import { CATEGORY_META } from '../types'
import { fetchWalkingRoute } from '../api/route'

const DAY_COLORS = ['#0d9488', '#f59e0b', '#ec4899', '#8b5cf6', '#0ea5e9']

function markerIcon(color: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<div class="map-marker" style="border-color:${color};color:${color}">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
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
function DayRoute({ dayId, color }: { dayId: string; color: string }) {
  const trip = useActiveTrip()
  const geoItems = useMemo(
    () => activitiesByDay(trip, dayId).filter((a) => a.geo),
    [trip, dayId],
  )
  const [path, setPath] = useState<[number, number][]>([])

  useEffect(() => {
    const pts = geoItems.map((a) => ({ lat: a.geo!.lat, lng: a.geo!.lng }))
    if (pts.length < 2) {
      setPath([])
      return
    }
    const ctrl = new AbortController()
    setPath(pts.map((p) => [p.lat, p.lng]))
    fetchWalkingRoute(pts, ctrl.signal).then((r) => {
      if (!ctrl.signal.aborted) setPath(r.map((p) => [p.lat, p.lng]))
    })
    return () => ctrl.abort()
  }, [geoItems.map((a) => `${a.id}@${a.geo!.lat},${a.geo!.lng}`).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (path.length < 2) return null
  return <Polyline positions={path} pathOptions={{ color, weight: 3, opacity: 0.8 }} />
}

export default function MapView() {
  const { setActiveDay } = useTripStore()
  const trip = useActiveTrip()
  const [filter, setFilter] = useState<'all' | string>('all')

  const visibleDays = filter === 'all' ? trip.days : trip.days.filter((d) => d.id === filter)

  const allPoints = visibleDays.flatMap((d) =>
    activitiesByDay(trip, d.id)
      .filter((a) => a.geo)
      .map((a) => [a.geo!.lat, a.geo!.lng] as [number, number]),
  )

  return (
    <div className="relative h-full w-full">
      {/* 天数筛选 */}
      <div className="absolute top-4 left-1/2 z-[500] -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-border bg-white p-1 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
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

      <MapContainer center={[34.9, 135.6]} zoom={9} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={allPoints} />

        {visibleDays.map((day) => {
          const color = DAY_COLORS[trip.days.indexOf(day) % DAY_COLORS.length]
          const geoItems = activitiesByDay(trip, day.id).filter((a) => a.geo)
          return (
            <div key={day.id}>
              <DayRoute dayId={day.id} color={color} />
              {geoItems.map((a, i) => {
                const Icon = CATEGORY_ICONS[a.category]
                return (
                  <Marker
                    key={a.id}
                    position={[a.geo!.lat, a.geo!.lng]}
                    icon={markerIcon(color, String(i + 1))}
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

      {/* 图例 */}
      <div className="absolute right-4 bottom-6 z-[500] rounded-lg border border-border bg-white/95 px-3.5 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="mb-1.5 text-[11px] font-semibold text-text-muted">按天路线</div>
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
            <span className="h-2 w-2 rounded-full" style={{ background: DAY_COLORS[i % DAY_COLORS.length] }} />
            {d.label} · {d.place}
          </button>
        ))}
      </div>

      {/* 当前选中类别说明（保持设计系统中分类色一致） */}
      <div className="absolute top-4 left-4 z-[500] rounded-lg border border-border bg-white/95 px-3 py-2 shadow-[0_2px_10px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="text-[12px] font-semibold">{trip.name}</div>
        <div className="mt-0.5 text-[11px] text-text-muted">
          {filter === 'all' ? `${trip.daysCount} 天行程` : trip.days.find((d) => d.id === filter)?.place}
        </div>
      </div>
      <span className="hidden">{CATEGORY_META.sight.label}</span>
    </div>
  )
}
