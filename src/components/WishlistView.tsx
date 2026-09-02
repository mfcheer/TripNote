import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { searchPlaces, type GeoResult } from '../api/geocode'
import { useActiveTrip, useTripStore } from '../store'
import { CATEGORY_ICONS, PlusIcon, TrashIcon } from './Icons'
import { CATEGORY_META, type ActivityCategory } from '../types'
import { useToastStore } from './toastStore'

function wishMarker(label: string, active: boolean) {
  const color = active ? '#0f766e' : '#0d9488'
  return L.divIcon({
    className: '',
    html: `<div class="map-marker" style="border-color:${color};color:${color};${active ? 'background:#ccfbf1;' : ''}">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function FitPlaces({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13)
    if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.16))
  }, [map, points])
  return null
}

export default function WishlistView() {
  const trip = useActiveTrip()
  const { addWishPlace, removeWishPlace, scheduleWishPlace } = useTripStore()
  const [category, setCategory] = useState<ActivityCategory | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [manualCategory, setManualCategory] = useState<ActivityCategory>('sight')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const query = searching.trim()
    if (query.length < 2) {
      return
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        setResults(await searchPlaces(query, ctrl.signal))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults([])
      }
    }, 450)
    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [searching])

  const filtered = useMemo(
    () => trip.wishPlaces.filter((place) => {
      const matchesCategory = category === 'all' || place.category === category
      const source = `${place.title} ${place.location ?? ''}`.toLowerCase()
      return matchesCategory && source.includes(keyword.trim().toLowerCase())
    }),
    [category, keyword, trip.wishPlaces],
  )
  const mapped = filtered.filter((place) => place.geo)
  const points = useMemo(
    () => mapped.map((place) => [place.geo!.lat, place.geo!.lng] as [number, number]),
    [mapped],
  )

  function addFromResult(result: GeoResult) {
    const id = addWishPlace({
      title: result.label.split(',')[0],
      category: manualCategory,
      location: result.label,
      geo: { lat: result.lat, lng: result.lng },
    })
    setActiveId(id)
    setSearching('')
    setResults([])
    useToastStore.getState().show(`已收藏「${result.label.split(',')[0]}」`)
  }

  function addManual() {
    const title = searching.trim()
    if (!title) return
    const id = addWishPlace({ title, category: manualCategory })
    setActiveId(id)
    setSearching('')
    setResults([])
    useToastStore.getState().show(`已收藏「${title}」`)
  }

  function removePlace(placeId: string, title: string) {
    const { trips, activeTripId } = useTripStore.getState()
    removeWishPlace(placeId)
    useToastStore.getState().show(`已移出「${title}」`, {
      undo: () => useTripStore.getState().restoreTrips(trips, activeTripId),
    })
  }

  function schedulePlace(placeId: string, dayId: string, title: string) {
    if (scheduleWishPlace(placeId, dayId)) {
      useToastStore.getState().show(`已将「${title}」安排到行程`)
    }
  }

  return (
    <div className="flex h-full min-w-0">
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[820px] px-8 py-7">
          <div className="mb-5">
            <h1 className="text-[18px] font-semibold">想去清单</h1>
            <p className="mt-1 text-[12.5px] text-text-muted">先收集地点，确定日期后再一键安排到行程，不必一开始就决定时间。</p>
          </div>

          <div className="relative mb-5 rounded-xl border border-accent/30 bg-accent-soft/25 p-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[250px] flex-1">
                <input
                  value={searching}
                  onChange={(event) => {
                    setSearching(event.target.value)
                    if (event.target.value.trim().length < 2) setResults([])
                  }}
                  onKeyDown={(event) => event.key === 'Enter' && addManual()}
                  placeholder="搜索地点，或直接输入想去的安排"
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-accent"
                />
                {results.length > 0 && (
                  <ul className="absolute top-full left-0 z-20 mt-1 max-h-[230px] w-full overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-lg">
                    {results.map((result) => (
                      <li key={`${result.lat},${result.lng}`}>
                        <button onClick={() => addFromResult(result)} className="w-full px-3 py-2 text-left hover:bg-accent-soft">
                          <div className="truncate text-[12.5px] font-medium">{result.label.split(',')[0]}</div>
                          <div className="mt-0.5 truncate text-[11px] text-text-faint">{result.label}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <select
                value={manualCategory}
                onChange={(event) => setManualCategory(event.target.value as ActivityCategory)}
                className="rounded-md border border-border bg-white px-2.5 py-2 text-[12.5px] text-text-muted outline-none focus:border-accent"
              >
                {(Object.keys(CATEGORY_META) as ActivityCategory[]).map((value) => (
                  <option key={value} value={value}>{CATEGORY_META[value].label}</option>
                ))}
              </select>
              <button onClick={addManual} disabled={!searching.trim()} className="flex items-center gap-1 rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40">
                <PlusIcon size={14} /> 收藏
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="筛选地点或城市"
              className="w-[180px] rounded-md border border-border px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent"
            />
            <button onClick={() => setCategory('all')} className={`rounded-full px-2.5 py-1 text-[12px] ${category === 'all' ? 'bg-accent text-white' : 'bg-surface text-text-muted'}`}>全部 {trip.wishPlaces.length}</button>
            {(Object.keys(CATEGORY_META) as ActivityCategory[]).map((value) => (
              <button key={value} onClick={() => setCategory(value)} className={`rounded-full px-2.5 py-1 text-[12px] ${category === value ? 'bg-accent text-white' : 'bg-surface text-text-muted'}`}>
                {CATEGORY_META[value].label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-[13px] text-text-faint">还没有待安排地点，从上方搜索或手动收藏一个开始。</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filtered.map((place) => {
                const meta = CATEGORY_META[place.category]
                const Icon = CATEGORY_ICONS[place.category]
                return (
                  <article key={place.id} className={`rounded-lg border bg-white p-3.5 transition-colors ${activeId === place.id ? 'border-accent shadow-[0_1px_6px_rgba(13,148,136,0.12)]' : 'border-border'}`} onMouseEnter={() => setActiveId(place.id)}>
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: meta.soft, color: meta.color }}><Icon size={16} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium">{place.title}</div>
                        {place.location && <div className="mt-0.5 truncate text-[12px] text-text-muted">{place.location}</div>}
                        {place.note && <div className="mt-1 text-[12px] text-text-faint">{place.note}</div>}
                      </div>
                      <button onClick={() => removePlace(place.id, place.title)} className="h-fit rounded p-1 text-text-faint hover:text-red-500" title="移出清单"><TrashIcon size={14} /></button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
                      <span className="mr-1 text-[11.5px] text-text-faint">安排到</span>
                      {trip.days.map((day) => (
                        <button key={day.id} onClick={() => schedulePlace(place.id, day.id, place.title)} className="rounded-md border border-border px-2 py-1 text-[11.5px] text-text-muted hover:border-accent hover:text-accent">
                          {day.label}{day.place ? ` · ${day.place}` : ''}
                        </button>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="sticky top-0 hidden h-full w-[340px] shrink-0 border-l border-border bg-white p-4 lg:block">
        <div className="mb-2 text-[13px] font-semibold">地点分布</div>
        <div className="mb-3 text-[11.5px] text-text-faint">地图标记与清单卡片联动</div>
        {mapped.length > 0 ? (
          <div className="h-[calc(100%-48px)] overflow-hidden rounded-lg border border-border">
            <MapContainer center={points[0]} zoom={11} className="h-full w-full" attributionControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitPlaces points={points} />
              {mapped.map((place, index) => (
                <Marker key={place.id} position={[place.geo!.lat, place.geo!.lng]} icon={wishMarker(String(index + 1), activeId === place.id)} eventHandlers={{ click: () => setActiveId(place.id) }} />
              ))}
            </MapContainer>
          </div>
        ) : (
          <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border p-5 text-center text-[12px] leading-relaxed text-text-faint">收藏带坐标的地点后，会在这里看到分布。</div>
        )}
      </aside>
    </div>
  )
}
