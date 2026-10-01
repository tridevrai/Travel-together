// Device compass heading from orientation events, plus smoothing.
// Pure functions so the native app can reuse them with its own sensor API.
import { normalizeDegrees } from './geo'

export type OrientationReading = {
  /** iOS Safari: degrees clockwise from north for the top of the device. */
  webkitCompassHeading?: number | null
  /** iOS Safari: ± degrees of error, negative when uncalibrated. */
  webkitCompassAccuracy?: number | null
  /** Rotation around the screen's z axis, counter-clockwise. */
  alpha: number | null
  /** Whether alpha is relative to the earth (north) rather than an arbitrary start. */
  absolute: boolean
}

/**
 * Which way the top of the screen faces, in degrees clockwise from north, or
 * null when the reading can't give one (no compass, or relative alpha only).
 * `screenAngle` is screen.orientation.angle (90 when rotated to landscape-left).
 */
export function headingFromReading(r: OrientationReading, screenAngle = 0): number | null {
  let deviceHeading: number | null = null
  if (typeof r.webkitCompassHeading === 'number' && Number.isFinite(r.webkitCompassHeading)) {
    if (typeof r.webkitCompassAccuracy === 'number' && r.webkitCompassAccuracy < 0) return null
    deviceHeading = r.webkitCompassHeading
  } else if (r.absolute && typeof r.alpha === 'number' && Number.isFinite(r.alpha)) {
    // alpha grows counter-clockwise; headings grow clockwise.
    deviceHeading = 360 - r.alpha
  }
  return deviceHeading === null ? null : normalizeDegrees(deviceHeading + screenAngle)
}

/**
 * Exponential moving average of angles, done on unit vectors so the jump from
 * 359° to 1° averages to 0°, not 180°. `factor` is the weight of a new reading.
 */
export class HeadingSmoother {
  private x = 0
  private y = 0
  private primed = false

  private readonly factor: number

  constructor(factor = 0.2) {
    this.factor = factor
  }

  push(heading: number): number {
    const rad = (heading * Math.PI) / 180
    if (!this.primed) {
      this.x = Math.cos(rad)
      this.y = Math.sin(rad)
      this.primed = true
    } else {
      this.x += this.factor * (Math.cos(rad) - this.x)
      this.y += this.factor * (Math.sin(rad) - this.y)
    }
    return normalizeDegrees((Math.atan2(this.y, this.x) * 180) / Math.PI)
  }

  reset(): void {
    this.primed = false
  }
}

/** Smallest signed turn from `from` to `to`, in (-180, 180]. */
export function shortestTurn(from: number, to: number): number {
  const d = normalizeDegrees(to - from)
  return d > 180 ? d - 360 : d
}
