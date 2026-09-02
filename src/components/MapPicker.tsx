import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { reverseGeocode } from '../api/geocode'
import type { GeoPoint } from '../types'

const pickIcon = L.divIcon({
  className: '',
  html: `<div class="map-marker" style="border-color:#0d9488;color:#0d9488">📍</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
})

// 地图点击选点
function ClickHandler({ onPick }: { onPick: (p: GeoPoint) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  })
  return null
}

// 视角初始化：已有坐标或行程默认区域
function InitialView({ center }: { center?: GeoPoint }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], 14)
    else map.setView([34.9, 135.6], 9)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// 重新居中（选点变化时跟随）
function FollowPoint({ point }: { point?: GeoPoint }) {
  const map = useMap()
  useEffect(() => {
    if (point) map.setView([point.lat, point.lng], Math.max(map.getZoom(), 13))
  }, [point?.lat, point?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// 迷你地图选点器：点击地图放置标记，逆地理编码回填地名
export default function MapPicker({
  point,
  label,
  onPick,
}: {
  point?: GeoPoint
  label: string
  onPick: (p: GeoPoint, label: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const [resolving, setResolving] = useState(false)
  const latestCall = useRef(0)

  async function handlePick(newPoint: GeoPoint) {
    onPick(newPoint, label) // 先落点，地名异步回填
    setPicking(true)
    setResolving(true)
    const callId = ++latestCall.current
    const name = await reverseGeocode(newPoint.lat, newPoint.lng)
    if (callId !== latestCall.current) return // 已有更新的选点，丢弃
    setResolving(false)
    setPicking(false)
    if (name) {
      // 回填地点输入框（用户可再手改）
      onPick(newPoint, name)
    }
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="h-[200px]">
        <MapContainer className="h-full w-full" center={point ? [point.lat, point.lng] : [34.9, 135.6]} zoom={point ? 13 : 9}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <InitialView center={point} />
          <ClickHandler onPick={handlePick} />
          <FollowPoint point={point} />
          {point && <Marker position={[point.lat, point.lng]} icon={pickIcon} />}
        </MapContainer>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-surface px-3 py-1.5 text-[11.5px] text-text-muted">
        <span>{resolving ? '正在解析地名…' : picking || point ? '已选点，点击地图可重新选' : '点击地图选取位置'}</span>
        {point && (
          <span className="tabular-nums text-text-faint">
            {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  )
}
