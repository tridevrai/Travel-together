import { describe, expect, it } from 'vitest'
import { shouldUpload } from './uploadThrottle'

// 0.0001° of latitude ≈ 11 m, 0.0002° ≈ 22 m.
const last = { lat: 46, lng: 7, at: 0 }

describe('shouldUpload', () => {
  it('always sends the first fix', () => {
    expect(shouldUpload(null, { lat: 46, lng: 7 }, 0)).toBe(true)
  })

  it('never sends more often than every 5 s, even after a big move', () => {
    expect(shouldUpload(last, { lat: 47, lng: 7 }, 4_999)).toBe(false)
    expect(shouldUpload(last, { lat: 47, lng: 7 }, 5_000)).toBe(true)
  })

  it('sends after moving more than 15 m', () => {
    expect(shouldUpload(last, { lat: 46.0001, lng: 7 }, 10_000)).toBe(false)
    expect(shouldUpload(last, { lat: 46.0002, lng: 7 }, 10_000)).toBe(true)
  })

  it('sends every 30 s while standing still', () => {
    expect(shouldUpload(last, { lat: 46, lng: 7 }, 29_999)).toBe(false)
    expect(shouldUpload(last, { lat: 46, lng: 7 }, 30_000)).toBe(true)
  })
})
