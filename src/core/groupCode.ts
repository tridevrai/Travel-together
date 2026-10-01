// Group join codes. Must match the database: 6 chars, no 0/O/1/I
// (see generate_group_code / normalize_group_code in supabase/migrations).

export const GROUP_CODE_LENGTH = 6
export const GROUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const VALID_CODE = /^[A-HJ-NP-Z2-9]{6}$/

/** Turns user input like " ab3-k9z " into "AB3K9Z". */
export function normalizeGroupCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidGroupCode(input: string): boolean {
  return VALID_CODE.test(normalizeGroupCode(input))
}

/** "AB3K9Z" → "AB3-K9Z", easier to read out loud. */
export function formatGroupCode(code: string): string {
  const c = normalizeGroupCode(code)
  return c.length === GROUP_CODE_LENGTH ? `${c.slice(0, 3)}-${c.slice(3)}` : c
}

export function joinPath(code: string): string {
  return `/j/${normalizeGroupCode(code)}`
}
