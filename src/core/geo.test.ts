import { describe, expect, it } from 'vitest'
import { bearingDegrees, distanceMeters } from './geo'

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters({ lat: 46, lng: 7 }, { lat: 46, lng: 7 })).toBe(0)
  })

  it('matches known distances', () => {
    // One degree of latitude ≈ 111.2 km.
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2)
    // Paris → London ≈ 343.5 km.
    expect(distanceMeters({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 }) / 1000).toBeCloseTo(343.5, 0)
  })

  it('handles the antimeridian', () => {
    expect(distanceMeters({ lat: 0, lng: 179.9999 }, { lat: 0, lng: -179.9999 })).toBeCloseTo(22.2, 0)
  })
})

describe('bearingDegrees', () => {
  const origin = { lat: 0, lng: 0 }
  it('gives compass directions', () => {
    expect(bearingDegrees(origin, { lat: 1, lng: 0 })).toBeCloseTo(0)
    expect(bearingDegrees(origin, { lat: 0, lng: 1 })).toBeCloseTo(90)
    expect(bearingDegrees(origin, { lat: -1, lng: 0 })).toBeCloseTo(180)
    expect(bearingDegrees(origin, { lat: 0, lng: -1 })).toBeCloseTo(270)
  })
})
