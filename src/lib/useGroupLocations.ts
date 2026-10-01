import { useEffect, useState } from 'react'
import { applyLocationChange, listLocations, subscribeToLocations, type LocationMap } from '../core/locations'
import { supabase } from './supabase'

const EMPTY: LocationMap = new Map()
const RETRY_MS = 3_000

/** Everyone's latest position in the group, kept live via Realtime. */
export function useGroupLocations(groupId: string, enabled: boolean): LocationMap {
  // Tagged with the group so switching groups never shows the old markers.
  const [state, setState] = useState<{ groupId: string; locations: LocationMap }>({ groupId, locations: EMPTY })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const setLocations = (update: (current: LocationMap) => LocationMap) =>
      setState((s) => ({ groupId, locations: update(s.groupId === groupId ? s.locations : EMPTY) }))
    let retry: ReturnType<typeof setTimeout> | undefined
    const reload = (): Promise<void> =>
      listLocations(supabase, groupId).then(
        (fresh) => {
          if (!cancelled) setLocations(() => fresh)
        },
        (err: unknown) => {
          if (cancelled) return
          // supabase-js already retries reads a few times (~7 s); after a longer
          // outage, keep trying rather than wait for the next reconnect.
          console.warn('Loading locations failed; retrying', err)
          clearTimeout(retry)
          retry = setTimeout(() => void reload(), RETRY_MS)
        },
      )

    // Reload on every (re)connect to catch up on changes missed while
    // disconnected; also load right away in case Realtime is slow to connect.
    const subscription = subscribeToLocations(supabase, groupId, {
      onChange: (change) => setLocations((current) => applyLocationChange(current, groupId, change)),
      onResync: () => void reload(),
    })
    void reload()
    // The socket often drops while the tab is in the background.
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearTimeout(retry)
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [groupId, enabled])

  return enabled && state.groupId === groupId ? state.locations : EMPTY
}
