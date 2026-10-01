import { useEffect, useState } from 'react'

export type WakeLockStatus = 'off' | 'active' | 'unsupported' | 'failed'

/**
 * Keeps the screen on while `enabled`, so location updates keep flowing. The
 * browser drops the lock whenever the page is hidden; it is requested again
 * when the page becomes visible.
 */
export function useWakeLock(enabled: boolean): WakeLockStatus {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const [held, setHeld] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || !supported) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void lock.release()
          return
        }
        sentinel = lock
        setHeld(true)
        setFailed(false)
        lock.addEventListener('release', () => !cancelled && setHeld(false))
      } catch {
        // e.g. battery saver, or the page lost visibility mid-request.
        if (!cancelled) setFailed(true)
      }
    }

    const onVisibility = () => void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    void acquire()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release()
      setHeld(false)
      setFailed(false)
    }
  }, [enabled, supported])

  if (!enabled) return 'off'
  if (!supported) return 'unsupported'
  if (held) return 'active'
  return failed ? 'failed' : 'off'
}
