import { useEffect, useState } from 'react'
import { applyLocationChange, listLocations, subscribeToLocations, type LocationMap } from '../core/locations'
import { supabase } from './supabase'

const EMPTY: LocationMap = new Map()

/** Everyone's latest position in the group, kept live via Realtime. */
export function useGroupLocations(groupId: string, enabled: boolean): LocationMap {
  // Tagged with the group so switching groups never shows the old markers.
  const [state, setState] = useState<{ groupId: string; locations: LocationMap }>({ groupId, locations: EMPTY })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const setLocations = (update: (current: LocationMap) => LocationMap) =>
      setState((s) => ({ groupId, locations: update(s.groupId === groupId ? s.locations : EMPTY) }))
    const reload = () =>
      listLocations(supabase, groupId).then(
        (fresh) => !cancelled && setLocations(() => fresh),
        (err: unknown) => console.error('Loading locations failed', err),
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
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [groupId, enabled])

  return enabled && state.groupId === groupId ? state.locations : EMPTY
}
