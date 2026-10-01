import { describe, expect, it } from 'vitest'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { MemberLocation } from './database.types'
import { applyLocationChange, isStale, type LocationMap } from './locations'

const loc = (user_id: string, updated_at: string, group_id = 'g1'): MemberLocation => ({
  group_id, user_id, lat: 46, lng: 7, accuracy_m: 5, heading: null, speed: null, updated_at,
})
type Change = RealtimePostgresChangesPayload<MemberLocation>
const upsert = (row: MemberLocation): Change =>
  ({ eventType: 'UPDATE', new: row, old: {}, schema: 'public', table: 'member_locations', commit_timestamp: '', errors: [] }) as Change
const del = (old: Partial<MemberLocation>): Change =>
  ({ eventType: 'DELETE', new: {}, old, schema: 'public', table: 'member_locations', commit_timestamp: '', errors: [] }) as Change

describe('applyLocationChange', () => {
  const start: LocationMap = new Map([['alice', loc('alice', '2026-10-01T10:00:00Z')]])

  it('adds and updates rows', () => {
    const next = applyLocationChange(start, 'g1', upsert(loc('bob', '2026-10-01T10:00:05Z')))
    expect([...next.keys()]).toEqual(['alice', 'bob'])
    const moved = applyLocationChange(next, 'g1', upsert({ ...loc('alice', '2026-10-01T10:00:10Z'), lat: 47 }))
    expect(moved.get('alice')?.lat).toBe(47)
  })

  it('ignores out-of-order updates', () => {
    expect(applyLocationChange(start, 'g1', upsert(loc('alice', '2026-10-01T09:59:00Z')))).toBe(start)
  })

  it('removes on delete, ignoring deletes from other groups', () => {
    expect(applyLocationChange(start, 'g1', del({ group_id: 'g1', user_id: 'alice' })).size).toBe(0)
    expect(applyLocationChange(start, 'g1', del({ group_id: 'g2', user_id: 'alice' }))).toBe(start)
  })

  it('ignores rows from other groups', () => {
    expect(applyLocationChange(start, 'g1', upsert(loc('bob', '2026-10-01T10:00:00Z', 'g2')))).toBe(start)
  })
})

describe('isStale', () => {
  it('flags positions older than 2 minutes', () => {
    const now = Date.parse('2026-10-01T10:02:01Z')
    expect(isStale({ updated_at: '2026-10-01T10:00:00Z' }, now)).toBe(true)
    expect(isStale({ updated_at: '2026-10-01T10:00:30Z' }, now)).toBe(false)
  })
})

describe('applyLocationChange timestamp formats', () => {
  it('compares timestamps as instants, not strings', () => {
    // Realtime and PostgREST can format the same instant differently.
    const start: LocationMap = new Map([['alice', loc('alice', '2026-10-01T10:00:00+00:00')]])
    const next = applyLocationChange(start, 'g1', upsert({ ...loc('alice', '2026-10-01T12:00:05+02:00'), lat: 1 }))
    expect(next.get('alice')?.lat).toBe(1)
    expect(applyLocationChange(start, 'g1', upsert(loc('alice', '2026-10-01T11:59:00+02:00')))).toBe(start)
  })
})
