// Member locations: upload my position, load and follow everyone else's.
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { MemberLocation } from './database.types'
import { toGroupError, type Client } from './groups'

export type Fix = {
  lat: number
  lng: number
  accuracyM: number | null
  heading: number | null
  speed: number | null
}

/** Keyed by user_id. */
export type LocationMap = ReadonlyMap<string, MemberLocation>

export async function upsertMyLocation(client: Client, groupId: string, userId: string, fix: Fix): Promise<void> {
  const { error } = await client.from('member_locations').upsert({
    group_id: groupId,
    user_id: userId,
    lat: fix.lat,
    lng: fix.lng,
    accuracy_m: fix.accuracyM,
    // The DB only accepts [0, 360); browsers report NaN/null when unknown.
    heading: fix.heading !== null && Number.isFinite(fix.heading) ? fix.heading % 360 : null,
    speed: fix.speed !== null && Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : null,
  })
  if (error) throw toGroupError(error)
}

export async function deleteMyLocation(client: Client, groupId: string, userId: string): Promise<void> {
  const { error } = await client.from('member_locations').delete().match({ group_id: groupId, user_id: userId })
  if (error) throw toGroupError(error)
}

export async function listLocations(client: Client, groupId: string): Promise<LocationMap> {
  const { data, error } = await client.from('member_locations').select('*').eq('group_id', groupId)
  if (error) throw toGroupError(error)
  return new Map(data.map((l) => [l.user_id, l]))
}

/** Applies one realtime change to the map, returning the same map if nothing changed. */
export function applyLocationChange(
  current: LocationMap,
  groupId: string,
  change: RealtimePostgresChangesPayload<MemberLocation>,
): LocationMap {
  if (change.eventType === 'DELETE') {
    // Delete events can't be filtered server-side and carry only the key.
    const old = change.old as Partial<MemberLocation>
    if (old.group_id !== groupId || !old.user_id || !current.has(old.user_id)) return current
    const next = new Map(current)
    next.delete(old.user_id)
    return next
  }
  const row = change.new
  if (row.group_id !== groupId) return current
  const existing = current.get(row.user_id)
  // Events can arrive out of order around a reconnect; keep the newest.
  if (existing && Date.parse(existing.updated_at) > Date.parse(row.updated_at)) return current
  return new Map(current).set(row.user_id, row)
}

export type LocationSubscription = { unsubscribe: () => void }

/**
 * Follows location changes for a group. `onResync` fires whenever the channel
 * (re)connects, so the caller can reload anything missed while disconnected.
 */
export function subscribeToLocations(
  client: Client,
  groupId: string,
  handlers: {
    onChange: (change: RealtimePostgresChangesPayload<MemberLocation>) => void
    onResync: () => void
  },
): LocationSubscription {
  const channel = client
    .channel(`member-locations:${groupId}`)
    .on<MemberLocation>(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'member_locations', filter: `group_id=eq.${groupId}` },
      handlers.onChange,
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') handlers.onResync()
    })
  return {
    unsubscribe: () => {
      void client.removeChannel(channel)
    },
  }
}

export const STALE_AFTER_MS = 2 * 60 * 1000

export function isStale(location: Pick<MemberLocation, 'updated_at'>, now = Date.now()): boolean {
  return now - new Date(location.updated_at).getTime() > STALE_AFTER_MS
}
