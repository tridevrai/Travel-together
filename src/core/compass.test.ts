import { describe, expect, it } from 'vitest'
import { HeadingSmoother, headingFromReading, shortestTurn } from './compass'

describe('headingFromReading', () => {
  it('uses webkitCompassHeading on iOS', () => {
    expect(headingFromReading({ webkitCompassHeading: 90, alpha: 123, absolute: false })).toBe(90)
  })

  it('ignores an uncalibrated iOS compass', () => {
    expect(headingFromReading({ webkitCompassHeading: 90, webkitCompassAccuracy: -1, alpha: null, absolute: false })).toBeNull()
  })

  it('uses 360 - alpha for absolute readings (Android)', () => {
    expect(headingFromReading({ alpha: 270, absolute: true })).toBe(90)
    expect(headingFromReading({ alpha: 0, absolute: true })).toBe(0)
  })

  it('refuses relative alpha: it has no link to north', () => {
    expect(headingFromReading({ alpha: 270, absolute: false })).toBeNull()
    expect(headingFromReading({ alpha: null, absolute: true })).toBeNull()
  })

  it('adds the screen rotation', () => {
    expect(headingFromReading({ webkitCompassHeading: 350, alpha: null, absolute: false }, 90)).toBe(80)
    expect(headingFromReading({ alpha: 270, absolute: true }, 270)).toBe(0)
  })
})

describe('HeadingSmoother', () => {
  it('starts at the first reading', () => {
    expect(new HeadingSmoother().push(42)).toBeCloseTo(42)
  })

  it('averages across north without swinging through south', () => {
    const s = new HeadingSmoother(0.5)
    s.push(350)
    const h = s.push(10)
    expect(Math.min(h, 360 - h)).toBeLessThan(1) // ≈ 0°, not 180°
  })

  it('damps a single noisy spike', () => {
    const s = new HeadingSmoother(0.2)
    for (let i = 0; i < 10; i++) s.push(90)
    expect(s.push(150)).toBeLessThan(105)
  })

  it('converges to a steady heading', () => {
    const s = new HeadingSmoother(0.2)
    s.push(0)
    let h = 0
    for (let i = 0; i < 40; i++) h = s.push(120)
    expect(h).toBeCloseTo(120, 0)
  })
})

describe('shortestTurn', () => {
  it('turns the short way round', () => {
    expect(shortestTurn(350, 10)).toBe(20)
    expect(shortestTurn(10, 350)).toBe(-20)
    expect(shortestTurn(0, 180)).toBe(180)
  })
})
