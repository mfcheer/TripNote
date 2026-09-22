import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/**
 * 在既有 Leaflet 地图中嵌入 MapTiler 的矢量底图。
 * 这样路线、标记、选点等交互仍然由 Leaflet 统一管理，而底图可稳定使用中文标注。
 */
export default function MapTilerChineseLayer({ apiKey }: { apiKey: string }) {
  const map = useMap()

  useEffect(() => {
    let cancelled = false
    let removeLayer: (() => void) | undefined

    // SDK 体积较大，仅在用户明确选择“中文标注地图”后加载，避免拖慢默认 OSM 的首屏。
    void Promise.all([
      import('@maptiler/leaflet-maptilersdk'),
      import('@maptiler/sdk/dist/maptiler-sdk.css'),
    ]).then(([{ Language, MapStyle, MaptilerLayer }]) => {
      if (cancelled) return
      const layer = new MaptilerLayer({
        apiKey,
        style: MapStyle.STREETS,
        language: Language.CHINESE,
      })
      layer.addTo(map)
      removeLayer = () => { layer.remove() }
    })

    return () => {
      cancelled = true
      removeLayer?.()
    }
  }, [apiKey, map])

  return null
}
