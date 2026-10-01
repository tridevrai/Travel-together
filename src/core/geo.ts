// Small geo helpers, no dependencies.

export type LatLng = { lat: number; lng: number }

const EARTH_RADIUS_M = 6_371_008.8
const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial great-circle bearing from `from` to `to`, in degrees clockwise from north [0, 360). */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const φ1 = toRad(from.lat)
  const φ2 = toRad(to.lat)
  const Δλ = toRad(to.lng - from.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** "40 m", "850 m", "1.2 km", "12 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(1, Math.round(meters / 10) * 10)} m`
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters / 1000)} km`
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const CARDINAL_NAMES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const

/** 8-point compass label for a bearing, e.g. 44° → "NE". */
export function cardinal(bearing: number): (typeof CARDINALS)[number] {
  return CARDINALS[Math.round(normalizeDegrees(bearing) / 45) % 8]
}

export function cardinalName(bearing: number): (typeof CARDINAL_NAMES)[number] {
  return CARDINAL_NAMES[Math.round(normalizeDegrees(bearing) / 45) % 8]
}

export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360
}
