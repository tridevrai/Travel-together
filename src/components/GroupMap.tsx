import { useEffect, useRef } from 'react'
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre builds its worker URL at runtime, which Vite can't see: without
// this the worker 404s in dev and is missing from production builds.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { initials, memberColor, timeAgo } from '../lib/format'

// OpenFreeMap: free vector tiles, no key or sign-up. Override per deploy with
// VITE_MAP_STYLE_URL (e.g. a MapTiler or Stadia style URL).
const STYLE_URL =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) || 'https://tiles.openfreemap.org/styles/liberty'

setWorkerUrl(workerUrl)

export type MapPoint = {
  userId: string
  name: string
  lat: number
  lng: number
  updatedAt: string
  stale: boolean
  isMe: boolean
}

type MarkerEntry = { marker: Marker; el: HTMLDivElement }

function renderMarker(el: HTMLDivElement, p: MapPoint, now: number) {
  el.className = `member-marker${p.isMe ? ' is-me' : ''}${p.stale ? ' is-stale' : ''}`
  el.style.setProperty('--member-color', memberColor(p.userId))
  el.title = `${p.name} · ${p.isMe ? 'you' : timeAgo(p.updatedAt, now)}`
  el.replaceChildren()
  const dot = document.createElement('span')
  dot.className = 'member-marker-dot'
  dot.textContent = initials(p.name)
  const label = document.createElement('span')
  label.className = 'member-marker-label'
  label.textContent = p.isMe ? 'You' : p.stale ? `${p.name} · ${timeAgo(p.updatedAt, now)}` : p.name
  el.append(dot, label)
}

export default function GroupMap({ points, now }: { points: MapPoint[]; now: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, MarkerEntry>())
  const hasFitted = useRef(false)
  const pointsRef = useRef(points)

  useEffect(() => {
    pointsRef.current = points
  })

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: STYLE_URL,
      center: [0, 20],
      zoom: 1,
      attributionControl: { compact: true },
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    const markers = markersRef.current
    return () => {
      markers.clear()
      map.remove()
      mapRef.current = null
      hasFitted.current = false
    }
  }, [])

  // Sync markers with the points.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = markersRef.current
    const seen = new Set<string>()
    for (const p of points) {
      seen.add(p.userId)
      let entry = markers.get(p.userId)
      if (!entry) {
        const el = document.createElement('div')
        // Anchored so the centre of the 34 px dot sits on the position, label below.
        const marker = new Marker({ element: el, anchor: 'top', offset: [0, -17] })
        entry = { el, marker: marker.setLngLat([p.lng, p.lat]).addTo(map) }
        markers.set(p.userId, entry)
      }
      entry.marker.setLngLat([p.lng, p.lat])
      renderMarker(entry.el, p, now)
    }
    for (const [userId, entry] of markers) {
      if (!seen.has(userId)) {
        entry.marker.remove()
        markers.delete(userId)
      }
    }
    // Frame everyone once, when the first positions arrive; after that the
    // user is in control of the camera.
    if (!hasFitted.current && points.length > 0) {
      hasFitted.current = true
      fitTo(map, points, false)
    }
  }, [points, now])

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map" role="region" aria-label="Map of group members" />
      {points.length > 0 && (
        <button
          type="button"
          className="map-fit"
          onClick={() => mapRef.current && fitTo(mapRef.current, pointsRef.current, true)}
        >
          Show everyone
        </button>
      )}
    </div>
  )
}

function fitTo(map: MapLibreMap, points: MapPoint[], animate: boolean) {
  if (points.length === 1) {
    map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: 15 })
    return
  }
  const bounds = new LngLatBounds()
  for (const p of points) bounds.extend([p.lng, p.lat])
  // Extra room at the bottom for the name labels and the "Show everyone" button.
  map.fitBounds(bounds, { padding: { top: 50, right: 50, bottom: 90, left: 50 }, maxZoom: 16, animate })
}
