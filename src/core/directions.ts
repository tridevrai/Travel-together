// Where is everyone, seen from me: distance and direction per member.
import { bearingDegrees, distanceMeters, type LatLng } from './geo'

export type Position = LatLng & { accuracyM: number | null }

export type Direction =
  | { kind: 'unknown' } // I or they have no position
  | { kind: 'nearby'; distanceM: number } // closer than the GPS error: direction is noise
  | { kind: 'away'; distanceM: number; bearing: number }

// Accuracy we assume when the device doesn't report one.
const DEFAULT_ACCURACY_M = 20
// Never call someone "nearby" beyond this, however bad the accuracy.
const MAX_NEARBY_M = 100

export function directionTo(me: Position | null, them: Position | null): Direction {
  if (!me || !them) return { kind: 'unknown' }
  const distanceM = distanceMeters(me, them)
  const uncertainty = (me.accuracyM ?? DEFAULT_ACCURACY_M) + (them.accuracyM ?? DEFAULT_ACCURACY_M)
  if (distanceM <= Math.min(uncertainty, MAX_NEARBY_M)) return { kind: 'nearby', distanceM }
  return { kind: 'away', distanceM, bearing: bearingDegrees(me, them) }
}

/** Sort key: closest first, then nearby, then unknown. */
export function directionSortKey(d: Direction): number {
  return d.kind === 'unknown' ? Number.POSITIVE_INFINITY : d.distanceM
}
