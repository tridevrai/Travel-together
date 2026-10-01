import { describe, expect, it } from 'vitest'
import { initials, timeAgo, timeUntil } from './format'

const now = Date.parse('2026-10-01T12:00:00Z')

describe('timeAgo', () => {
  it('reads naturally', () => {
    expect(timeAgo('2026-10-01T11:59:50Z', now)).toBe('just now')
    expect(timeAgo('2026-10-01T11:59:20Z', now)).toBe('40 s ago')
    expect(timeAgo('2026-10-01T11:57:00Z', now)).toBe('3 min ago')
    expect(timeAgo('2026-10-01T09:00:00Z', now)).toBe('3 h ago')
    expect(timeAgo('2026-09-28T12:00:00Z', now)).toBe('3 d ago')
  })
})

describe('timeUntil', () => {
  it('reads naturally', () => {
    expect(timeUntil('2026-10-01T12:00:20Z', now)).toBe('in 1 min')
    expect(timeUntil('2026-10-01T12:25:00Z', now)).toBe('in 25 min')
    expect(timeUntil('2026-10-01T15:00:00Z', now)).toBe('in 3 h')
    expect(timeUntil('2026-10-04T12:00:00Z', now)).toBe('in 3 days')
  })
})

describe('initials', () => {
  it('uses first and last word, or the first two letters', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('  bob ')).toBe('BO')
    expect(initials('Jean Paul Sartre')).toBe('JS')
    expect(initials('')).toBe('?')
  })
})
