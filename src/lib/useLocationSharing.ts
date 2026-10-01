import { useCallback, useEffect, useRef, useState } from 'react'
import { upsertMyLocation, type Fix } from '../core/locations'
import { shouldUpload, UPLOAD_RULES, type Upload } from '../core/uploadThrottle'
import { errorMessage } from './errors'
import { supabase } from './supabase'

export type SharingStatus =
  | { kind: 'off' } // not allowed right now (paused or trip ended)
  | { kind: 'needs-permission' } // waiting for the user to tap "Start sharing"
  | { kind: 'locating' }
  | { kind: 'sharing'; fix: Fix; lastUploadAt: number | null; uploadError: string | null }
  | { kind: 'denied' }
  | { kind: 'unavailable'; reason: 'insecure' | 'unsupported' }
  | { kind: 'position-error'; message: string }

function toFix(position: GeolocationPosition): Fix {
  const c = position.coords
  return { lat: c.latitude, lng: c.longitude, accuracyM: c.accuracy, heading: c.heading, speed: c.speed }
}

async function geolocationPermission(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' })
    return status?.state ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Watches the device position while `enabled` and uploads it with the
 * throttle rules (moved > 15 m or 30 s passed, never more often than 5 s).
 * Starts by itself when permission was granted before; otherwise waits for
 * `start()`, which should be called from a tap so the prompt has context.
 */
export function useLocationSharing({ groupId, userId, enabled }: { groupId: string; userId: string; enabled: boolean }) {
  // What the position watcher last reported; null until it reports.
  const [watchStatus, setWatchStatus] = useState<SharingStatus | null>(null)
  const [startRequested, setStartRequested] = useState(false)
  const [denied, setDenied] = useState(false)
  const [permissionChecked, setPermissionChecked] = useState(false)
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const secure = typeof window !== 'undefined' && window.isSecureContext

  const latestFix = useRef<Fix | null>(null)
  const lastUpload = useRef<Upload | null>(null)
  const lastAttemptAt = useRef(0)
  const inFlight = useRef(false)

  // Start by ourselves if permission was granted on an earlier visit.
  useEffect(() => {
    if (!enabled || !secure || !supported || denied || startRequested || permissionChecked) return
    let cancelled = false
    void geolocationPermission().then((state) => {
      if (cancelled) return
      if (state === 'granted') setStartRequested(true)
      else if (state === 'denied') setDenied(true)
      setPermissionChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, secure, supported, denied, startRequested, permissionChecked])

  const maybeUpload = useCallback(async () => {
    const fix = latestFix.current
    const now = Date.now()
    if (!fix || inFlight.current) return
    if (now - lastAttemptAt.current < UPLOAD_RULES.minIntervalMs) return
    if (!shouldUpload(lastUpload.current, fix, now)) return

    inFlight.current = true
    lastAttemptAt.current = now
    try {
      await upsertMyLocation(supabase, groupId, userId, fix)
      lastUpload.current = { lat: fix.lat, lng: fix.lng, at: now }
      setWatchStatus({ kind: 'sharing', fix, lastUploadAt: now, uploadError: null })
    } catch (err) {
      setWatchStatus((s) => ({
        kind: 'sharing',
        fix,
        lastUploadAt: s?.kind === 'sharing' ? s.lastUploadAt : null,
        uploadError: errorMessage(err),
      }))
    } finally {
      inFlight.current = false
    }
  }, [groupId, userId])

  // Watch the position and upload.
  useEffect(() => {
    if (!enabled || !startRequested || !secure || !supported) return

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const fix = toFix(position)
        latestFix.current = fix
        setWatchStatus((s) =>
          s?.kind === 'sharing' ? { ...s, fix } : { kind: 'sharing', fix, lastUploadAt: null, uploadError: null },
        )
        void maybeUpload()
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setDenied(true)
          setStartRequested(false)
        } else if (!latestFix.current) {
          // Keep watching; the browser retries. Only surface it before the first fix.
          setWatchStatus({ kind: 'position-error', message: 'Still looking for your location…' })
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    )

    // Heartbeat: a still phone may stop reporting, but "last seen" should stay fresh.
    // Checked every second so a held-back move goes out as soon as 5 s have passed.
    const heartbeat = setInterval(() => void maybeUpload(), 1_000)
    const onVisible = () => document.visibilityState === 'visible' && void maybeUpload()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      navigator.geolocation.clearWatch(watchId)
      clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onVisible)
      setWatchStatus(null)
    }
  }, [enabled, startRequested, secure, supported, maybeUpload])

  // Pausing or a new group starts from scratch.
  useEffect(() => {
    if (!enabled) {
      lastUpload.current = null
      lastAttemptAt.current = 0
    }
  }, [enabled, groupId])

  // Also used as "Try again" after the user has unblocked location access.
  const start = useCallback(() => {
    setDenied(false)
    setStartRequested(true)
  }, [])

  let status: SharingStatus
  if (!enabled) status = { kind: 'off' }
  else if (!secure) status = { kind: 'unavailable', reason: 'insecure' }
  else if (!supported) status = { kind: 'unavailable', reason: 'unsupported' }
  else if (denied) status = { kind: 'denied' }
  else if (!startRequested) status = permissionChecked ? { kind: 'needs-permission' } : { kind: 'off' }
  else status = watchStatus ?? { kind: 'locating' }

  return { status, start }
}
