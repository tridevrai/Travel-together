import { distanceMeters, type LatLng } from './geo'

// When to send a new position to the server: after moving far enough, or
// after enough time as a heartbeat for "last seen", but never too often.
export const UPLOAD_RULES = {
  minDistanceM: 15,
  maxIntervalMs: 30_000,
  minIntervalMs: 5_000,
} as const

export type Upload = LatLng & { at: number }

export function shouldUpload(
  last: Upload | null,
  next: LatLng,
  now: number,
  rules: typeof UPLOAD_RULES = UPLOAD_RULES,
): boolean {
  if (!last) return true
  const elapsed = now - last.at
  if (elapsed < rules.minIntervalMs) return false
  return elapsed >= rules.maxIntervalMs || distanceMeters(last, next) > rules.minDistanceM
}
