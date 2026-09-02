import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { activitiesByDay, useActiveTrip, useTripStore } from '../store'

function pointIcon(label: string, active: boolean) {
  const color = active ? '#0f766e' : '#0d9488'
  return L.divIcon({
    className: '',
    html: `<div class="map-marker" style="border-color:${color};color:${color};${active ? 'background:#ccfbf1;' : ''}">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function FitPreview({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13)
    if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.2))
  }, [map, points])
  return null
}

export default function DayMapPreview({ dayId, selectedActivityId }: { dayId: string; selectedActivityId: string | null }) {
  const trip = useActiveTrip()
  const selectActivity = useTripStore((s) => s.selectActivity)
  const items = activitiesByDay(trip, dayId).filter((activity) => activity.geo)
  const points = useMemo(
    () => items.map((activity) => [activity.geo!.lat, activity.geo!.lng] as [number, number]),
    [items],
  )

  if (items.length === 0) {
    return (
      <div className="flex h-[176px] items-center justify-center rounded-lg border border-dashed border-border bg-surface text-center text-[12px] leading-relaxed text-text-faint">
        选择地点后会在这里显示当天路线
      </div>
    )
  }

  return (
    <div className="h-[176px] overflow-hidden rounded-lg border border-border">
      <MapContainer center={points[0]} zoom={13} className="h-full w-full" zoomControl={false} attributionControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitPreview points={points} />
        {points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#0d9488', weight: 3, opacity: 0.65 }} />}
        {items.map((activity, index) => (
          <Marker
            key={activity.id}
            position={[activity.geo!.lat, activity.geo!.lng]}
            icon={pointIcon(String(index + 1), selectedActivityId === activity.id)}
            eventHandlers={{ click: () => selectActivity(activity.id) }}
          />
        ))}
      </MapContainer>
    </div>
  )
}
