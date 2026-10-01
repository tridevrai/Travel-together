import { describe, expect, it, vi } from 'vitest'
import { GroupError, createGroup, isExpired, joinGroup, toGroupError, type Client } from './groups'

// Just enough of the supabase-js builder chain for the RPC calls.
function fakeClient(result: { data: unknown; error: unknown }) {
  const builder = Object.assign(Promise.resolve(result), {
    maybeSingle: () => Promise.resolve(result),
  })
  const rpc = vi.fn(() => builder)
  return { client: { rpc } as unknown as Client, rpc }
}

const group = {
  id: 'g1', code: 'AB3K9Z', name: 'Alps', created_by: 'u1', expires_at: null, created_at: '2026-01-01T00:00:00Z',
}

describe('toGroupError', () => {
  it('maps known server messages and falls back to unknown', () => {
    expect(toGroupError({ message: 'too_many_attempts' }).kind).toBe('too_many_attempts')
    expect(toGroupError({ message: 'group_expired' }).kind).toBe('group_expired')
    expect(toGroupError({ message: 'permission denied for table groups' }).kind).toBe('unknown')
    expect(toGroupError(null).kind).toBe('unknown')
  })
})

describe('joinGroup', () => {
  it('sends the normalized code', async () => {
    const { client, rpc } = fakeClient({ data: group, error: null })
    await expect(joinGroup(client, { code: 'ab3-k9z', displayName: 'Bob' })).resolves.toEqual(group)
    expect(rpc).toHaveBeenCalledWith('join_group', { code: 'AB3K9Z', display_name: 'Bob' })
  })

  it('treats an empty result as an unknown code', async () => {
    const { client } = fakeClient({ data: null, error: null })
    await expect(joinGroup(client, { code: 'AB3K9Z', displayName: 'Bob' })).rejects.toMatchObject({
      kind: 'group_not_found',
    })
  })

  it('rejects a malformed code without calling the server', async () => {
    const { client, rpc } = fakeClient({ data: group, error: null })
    await expect(joinGroup(client, { code: 'O0O0', displayName: 'Bob' })).rejects.toBeInstanceOf(GroupError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('surfaces rate limiting', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'too_many_attempts', code: 'PT429' } })
    await expect(joinGroup(client, { code: 'AB3K9Z', displayName: 'Bob' })).rejects.toMatchObject({
      kind: 'too_many_attempts',
    })
  })
})

describe('createGroup', () => {
  it('sends the expiry as ISO and returns the group', async () => {
    const { client, rpc } = fakeClient({ data: group, error: null })
    const expiresAt = new Date('2026-10-08T00:00:00Z')
    await expect(createGroup(client, { name: 'Alps', displayName: 'Alice', expiresAt })).resolves.toEqual(group)
    expect(rpc).toHaveBeenCalledWith('create_group', {
      name: 'Alps', display_name: 'Alice', expires_at: '2026-10-08T00:00:00.000Z',
    })
  })
})

describe('isExpired', () => {
  it('compares expires_at with now', () => {
    const now = new Date('2026-10-01T12:00:00Z')
    expect(isExpired({ expires_at: null }, now)).toBe(false)
    expect(isExpired({ expires_at: '2026-10-01T11:59:59Z' }, now)).toBe(true)
    expect(isExpired({ expires_at: '2026-10-02T00:00:00Z' }, now)).toBe(false)
  })
})
