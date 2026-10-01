import { describe, expect, it } from 'vitest'
import { directionSortKey, directionTo } from './directions'
import { cardinal, cardinalName, formatDistance } from './geo'

const me = { lat: 46, lng: 7, accuracyM: 10 }

describe('directionTo', () => {
  it('is unknown without both positions', () => {
    expect(directionTo(null, me)).toEqual({ kind: 'unknown' })
    expect(directionTo(me, null)).toEqual({ kind: 'unknown' })
  })

  it('reports distance and bearing for someone clearly away', () => {
    const d = directionTo(me, { lat: 46.009, lng: 7, accuracyM: 10 }) // ~1 km north
    expect(d.kind).toBe('away')
    if (d.kind !== 'away') return
    expect(d.distanceM).toBeCloseTo(1000, -1)
    expect(d.bearing).toBeCloseTo(0, 0)
  })

  it('says nearby when the GPS error is larger than the distance', () => {
    // ~22 m apart, combined accuracy 10 + 15 = 25 m.
    expect(directionTo(me, { lat: 46.0002, lng: 7, accuracyM: 15 }).kind).toBe('nearby')
    // Same distance with precise fixes: direction is meaningful.
    expect(directionTo({ ...me, accuracyM: 5 }, { lat: 46.0002, lng: 7, accuracyM: 5 }).kind).toBe('away')
  })

  it('caps "nearby" at 100 m even with terrible accuracy', () => {
    const d = directionTo({ ...me, accuracyM: 500 }, { lat: 46.0018, lng: 7, accuracyM: 500 }) // ~200 m
    expect(d.kind).toBe('away')
  })

  it('sorts closest first and unknown last', () => {
    const far = directionTo(me, { lat: 46.1, lng: 7, accuracyM: 5 })
    const close = directionTo(me, { lat: 46.01, lng: 7, accuracyM: 5 })
    const keys = [far, { kind: 'unknown' } as const, close].map(directionSortKey)
    expect([...keys].sort((a, b) => a - b)).toEqual([keys[2], keys[0], keys[1]])
  })
})

describe('formatDistance', () => {
  it('rounds sensibly', () => {
    expect(formatDistance(3)).toBe('1 m')
    expect(formatDistance(44)).toBe('40 m')
    expect(formatDistance(846)).toBe('850 m')
    expect(formatDistance(1234)).toBe('1.2 km')
    expect(formatDistance(12_345)).toBe('12 km')
  })
})

describe('cardinal', () => {
  it('maps bearings to 8 compass points', () => {
    expect(cardinal(0)).toBe('N')
    expect(cardinal(22)).toBe('N')
    expect(cardinal(23)).toBe('NE')
    expect(cardinal(180)).toBe('S')
    expect(cardinal(359)).toBe('N')
    expect(cardinal(-90)).toBe('W')
    expect(cardinalName(135)).toBe('south-east')
  })
})
