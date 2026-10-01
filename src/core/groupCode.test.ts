import { describe, expect, it } from 'vitest'
import { formatGroupCode, isValidGroupCode, joinPath, normalizeGroupCode } from './groupCode'

describe('group codes', () => {
  it('normalizes case, spaces and dashes', () => {
    expect(normalizeGroupCode(' ab3-k9z ')).toBe('AB3K9Z')
  })

  it('accepts only 6 chars from the unambiguous alphabet', () => {
    expect(isValidGroupCode('AB3K9Z')).toBe(true)
    expect(isValidGroupCode('ab3-k9z')).toBe(true)
    expect(isValidGroupCode('AB3K9')).toBe(false)
    expect(isValidGroupCode('AB3K9ZZ')).toBe(false)
    for (const ambiguous of ['0', 'O', '1', 'I']) {
      expect(isValidGroupCode(`AB3K9${ambiguous}`)).toBe(false)
    }
  })

  it('formats for reading out loud and builds the join path', () => {
    expect(formatGroupCode('ab3k9z')).toBe('AB3-K9Z')
    expect(joinPath('ab3-k9z')).toBe('/j/AB3K9Z')
  })
})
