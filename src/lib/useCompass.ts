import { useCallback, useEffect, useRef, useState } from 'react'
import { HeadingSmoother, headingFromReading, shortestTurn } from '../core/compass'

export type CompassStatus =
  | { kind: 'off' }
  | { kind: 'unsupported' } // no orientation API, or no compass reading arrived
  | { kind: 'needs-permission' } // iOS: must be enabled from a tap
  | { kind: 'denied' }
  | { kind: 'starting' }
  | { kind: 'active'; heading: number }

type IOSOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}
type OrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

// No reading within this time means there's no usable compass (e.g. desktop).
const NO_READING_TIMEOUT_MS = 3_000
// Re-render at most ~15 times a second, and only for a visible change.
const MIN_UPDATE_INTERVAL_MS = 66
const MIN_UPDATE_DEGREES = 1

function orientationApi(): OrientationEventWithPermission | null {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && window.isSecureContext
    ? (window.DeviceOrientationEvent as OrientationEventWithPermission)
    : null
}

function screenAngle(): number {
  return screen.orientation?.angle ?? 0
}

/**
 * The device's compass heading (degrees clockwise from north for the top of
 * the screen), smoothed. Listens only while `enabled`. On iOS, call
 * `requestPermission()` from a tap first.
 */
export function useCompass(enabled: boolean) {
  const api = orientationApi()
  const needsPermission = typeof api?.requestPermission === 'function'
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [heading, setHeading] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const lastEmit = useRef({ at: 0, heading: null as number | null })

  const listening = enabled && api !== null && (!needsPermission || permission === 'granted')

  useEffect(() => {
    if (!listening) return
    const smoother = new HeadingSmoother()
    lastEmit.current = { at: 0, heading: null }

    const onReading = (event: Event) => {
      const e = event as IOSOrientationEvent
      const raw = headingFromReading(
        {
          webkitCompassHeading: e.webkitCompassHeading,
          webkitCompassAccuracy: e.webkitCompassAccuracy,
          alpha: e.alpha,
          absolute: e.absolute || e.type === 'deviceorientationabsolute',
        },
        screenAngle(),
      )
      if (raw === null) return
      const smoothed = smoother.push(raw)
      const now = performance.now()
      const last = lastEmit.current
      if (
        last.heading === null ||
        (now - last.at >= MIN_UPDATE_INTERVAL_MS && Math.abs(shortestTurn(last.heading, smoothed)) >= MIN_UPDATE_DEGREES)
      ) {
        lastEmit.current = { at: now, heading: smoothed }
        setHeading(smoothed)
      }
    }

    // Chrome/Android: the absolute event is the one tied to north. iOS Safari
    // only has `deviceorientation`, with webkitCompassHeading.
    const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(eventName, onReading)
    const timeout = setTimeout(() => {
      if (lastEmit.current.heading === null) setTimedOut(true)
    }, NO_READING_TIMEOUT_MS)

    return () => {
      window.removeEventListener(eventName, onReading)
      clearTimeout(timeout)
      setHeading(null)
      setTimedOut(false)
    }
  }, [listening])

  const requestPermission = useCallback(async () => {
    try {
      const result = await orientationApi()?.requestPermission?.()
      setPermission(result === 'granted' ? 'granted' : 'denied')
    } catch {
      // Thrown when not called from a tap, or when the user refuses.
      setPermission('denied')
    }
  }, [])

  let status: CompassStatus
  if (!enabled) status = { kind: 'off' }
  else if (!api) status = { kind: 'unsupported' }
  else if (needsPermission && permission === 'unknown') status = { kind: 'needs-permission' }
  else if (permission === 'denied') status = { kind: 'denied' }
  else if (heading !== null) status = { kind: 'active', heading }
  else if (timedOut) status = { kind: 'unsupported' }
  else status = { kind: 'starting' }

  return { status, requestPermission }
}
