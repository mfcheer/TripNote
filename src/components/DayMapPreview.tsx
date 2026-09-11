import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { activitiesByDay, useActiveTrip, useTripStore } from '../store'
import AmapCanvas, { type AmapMarker } from './AmapCanvas'

function pointIcon(label: string, selected: boolean, highlighted: boolean, showLabels: boolean) {
  const color = selected ? '#3f4953' : '#59636e'
  const activeStyle = selected ? 'background:#e9f1f7;' : highlighted ? 'background:#f2f7fb;' : ''
  return L.divIcon({
    className: '',
    html: showLabels
      ? `<div class="map-place-marker" style="border-color:${color};color:${color};${activeStyle}">${escapeHtml(label)}</div>`
      : `<div class="map-marker map-dot${highlighted || selected ? ' is-highlighted' : ''}" style="border-color:${color};color:${color};${activeStyle}"></div>`,
    iconSize: showLabels ? [140, 28] : [26, 26],
    iconAnchor: showLabels ? [70, 14] : [13, 13],
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!))
}

function FitPreview({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13)
    if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.2))
  }, [map, points])
  return null
}

export default function DayMapPreview({
  dayId,
  selectedActivityId,
  highlightedActivityId,
  showLabels = true,
}: {
  dayId: string
  selectedActivityId: string | null
  highlightedActivityId?: string | null
  showLabels?: boolean
}) {
  const trip = useActiveTrip()
  const focusActivity = useTripStore((s) => s.focusActivity)
  const amapJsKey = useTripStore((s) => s.amapJsKey)
  const items = activitiesByDay(trip, dayId).filter((activity) => activity.geo)
  const points = useMemo(
    () => items.map((activity) => [activity.geo!.lat, activity.geo!.lng] as [number, number]),
    [items],
  )
  const amapMarkers: AmapMarker[] = items.map((activity) => ({
    id: activity.id,
    point: activity.geo!,
    label: showLabels ? activity.title : '',
    active: selectedActivityId === activity.id || highlightedActivityId === activity.id,
    simple: !showLabels,
    wide: showLabels,
    onClick: () => focusActivity(activity.id),
  }))

  if (items.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-border bg-surface text-center text-[12px] leading-relaxed text-text-faint">
        选择地点后会在这里显示当天路线
      </div>
    )
  }

  return (
    <div className="h-[240px] overflow-hidden rounded-lg border border-border">
      {amapJsKey ? (
        <AmapCanvas apiKey={amapJsKey} markers={amapMarkers} lines={points.length > 1 ? [{ id: dayId, points: items.map((activity) => activity.geo!), color: '#c55e4e', weight: 3 }] : []} className="h-full w-full" zoom={13} />
      ) : (
      <MapContainer center={points[0]} zoom={13} className="h-full w-full" zoomControl={false} attributionControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitPreview points={points} />
        {points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#c55e4e', weight: 3, opacity: 0.7 }} />}
        {items.map((activity) => (
          <Marker
            key={activity.id}
            position={[activity.geo!.lat, activity.geo!.lng]}
            icon={pointIcon(activity.title, selectedActivityId === activity.id, highlightedActivityId === activity.id, showLabels)}
            eventHandlers={{ click: () => focusActivity(activity.id) }}
          />
        ))}
      </MapContainer>
      )}
    </div>
  )
}
