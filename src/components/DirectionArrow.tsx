import { normalizeDegrees } from '../core/geo'

type Props = {
  /** Bearing to the target, degrees clockwise from north. */
  bearing: number
  /** Which way the device faces, if known; otherwise the arrow is north-up. */
  heading: number | null
}

/** An arrow pointing at someone: relative to the phone when a compass heading is known, else to north. */
export function DirectionArrow({ bearing, heading }: Props) {
  const rotation = normalizeDegrees(bearing - (heading ?? 0))
  return (
    <svg className="direction-arrow" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '12px 12px' }}>
        <path d="M12 2.5 19 20l-7-3.6L5 20z" fill="currentColor" />
      </g>
    </svg>
  )
}
