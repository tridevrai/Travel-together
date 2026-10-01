// Group API on top of Supabase. No React or DOM here, so the native app can
// reuse it as is.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Group, GroupMember } from './database.types'
import { isValidGroupCode, normalizeGroupCode } from './groupCode'

export type Client = SupabaseClient<Database>

export type GroupErrorKind =
  | 'not_authenticated'
  | 'invalid_group_name'
  | 'invalid_display_name'
  | 'invalid_expiry'
  | 'invalid_code'
  | 'group_not_found'
  | 'group_expired'
  | 'too_many_attempts'
  | 'unknown'

const SERVER_ERRORS = new Set<string>([
  'not_authenticated',
  'invalid_group_name',
  'invalid_display_name',
  'invalid_expiry',
  'group_expired',
  'too_many_attempts',
])

const MESSAGES: Record<GroupErrorKind, string> = {
  not_authenticated: 'You are not signed in. Reload the page and try again.',
  invalid_group_name: 'Give the group a name (up to 80 characters).',
  invalid_display_name: 'Enter your name (up to 40 characters).',
  invalid_expiry: 'The end date must be in the future.',
  invalid_code: 'Codes are 6 letters and numbers, like ABC-234.',
  group_not_found: 'No group has that code. Check it and try again.',
  group_expired: 'This trip has ended, so the group can no longer be joined.',
  too_many_attempts: 'Too many wrong codes. Wait a few minutes and try again.',
  unknown: 'Something went wrong. Check your connection and try again.',
}

export class GroupError extends Error {
  readonly kind: GroupErrorKind

  constructor(kind: GroupErrorKind, cause?: unknown) {
    super(MESSAGES[kind], { cause })
    this.name = 'GroupError'
    this.kind = kind
  }
}

/** Maps a PostgREST error from our RPCs to a GroupError. */
export function toGroupError(error: { message?: string } | null | undefined): GroupError {
  const message = error?.message ?? ''
  return new GroupError(
    SERVER_ERRORS.has(message) ? (message as GroupErrorKind) : 'unknown',
    error,
  )
}

export async function createGroup(
  client: Client,
  input: { name: string; displayName: string; expiresAt: Date | null },
): Promise<Group> {
  const { data, error } = await client.rpc('create_group', {
    name: input.name,
    display_name: input.displayName,
    expires_at: input.expiresAt?.toISOString() ?? null,
  })
  if (error || !data) throw toGroupError(error)
  return data
}

export async function joinGroup(
  client: Client,
  input: { code: string; displayName: string },
): Promise<Group> {
  if (!isValidGroupCode(input.code)) throw new GroupError('invalid_code')
  const { data, error } = await client
    .rpc('join_group', {
      code: normalizeGroupCode(input.code),
      display_name: input.displayName,
    })
    .maybeSingle()
  if (error) throw toGroupError(error)
  // No row means no group has that code (the server counts it as a failed try).
  if (!data) throw new GroupError('group_not_found')
  return data
}

/** The group, or null if it doesn't exist or the user isn't a member. */
export async function getGroup(client: Client, groupId: string): Promise<Group | null> {
  const { data, error } = await client.from('groups').select('*').eq('id', groupId).maybeSingle()
  if (error) throw toGroupError(error)
  return data
}

export async function listMyGroups(client: Client): Promise<Group[]> {
  const { data, error } = await client
    .from('groups')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw toGroupError(error)
  return data
}

export async function listMembers(client: Client, groupId: string): Promise<GroupMember[]> {
  const { data, error } = await client
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('joined_at')
  if (error) throw toGroupError(error)
  return data
}

export function isExpired(group: Pick<Group, 'expires_at'>, now = new Date()): boolean {
  return group.expires_at !== null && new Date(group.expires_at) <= now
}

/** Pauses or resumes my sharing. Pausing also deletes my stored position (DB trigger). */
export async function setSharing(client: Client, groupId: string, userId: string, isSharing: boolean): Promise<void> {
  const { error } = await client
    .from('group_members')
    .update({ is_sharing: isSharing })
    .match({ group_id: groupId, user_id: userId })
  if (error) throw toGroupError(error)
}
