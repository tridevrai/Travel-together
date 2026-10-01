import type { GroupMember } from '../core/database.types'
import { directionSortKey, directionTo, type Direction, type Position } from '../core/directions'
import { cardinal, cardinalName, formatDistance } from '../core/geo'
import { isStale, type LocationMap } from '../core/locations'
import { initials, memberColor, timeAgo } from '../lib/format'
import { DirectionArrow } from './DirectionArrow'

type Props = {
  members: GroupMember[]
  locations: LocationMap
  userId: string
  /** My live position, or null when I'm not sharing. */
  myPosition: Position | null
  /** Device compass heading, or null (arrows are then north-up). */
  heading: number | null
  now: number
  onSelect: (userId: string) => void
}

type Row = { member: GroupMember; direction: Direction; seenAt: string | null; stale: boolean }

/** Everyone else, closest first: distance, a direction arrow and when they were last seen. */
export function MembersList({ members, locations, userId, myPosition, heading, now, onSelect }: Props) {
  const me = members.find((m) => m.user_id === userId)
  const rows: Row[] = members
    .filter((m) => m.user_id !== userId)
    .map((member) => {
      const loc = member.is_sharing ? locations.get(member.user_id) : undefined
      return {
        member,
        direction: directionTo(myPosition, loc ? { lat: loc.lat, lng: loc.lng, accuracyM: loc.accuracy_m } : null),
        seenAt: loc?.updated_at ?? null,
        stale: loc ? isStale(loc, now) : false,
      }
    })
    .sort(
      (a, b) =>
        Number(!a.member.is_sharing) - Number(!b.member.is_sharing) ||
        Number(!a.seenAt) - Number(!b.seenAt) ||
        directionSortKey(a.direction) - directionSortKey(b.direction) ||
        a.member.display_name.localeCompare(b.member.display_name),
    )
  const someoneVisible = rows.some((r) => r.seenAt)

  return (
    <section className="card">
      <h2>Members</h2>
      {someoneVisible && !myPosition && (
        <p className="muted small">Share your location to see how far away everyone is.</p>
      )}
      <ul className="member-list">
        {me && (
          <li>
            <span className="member-name">
              <Avatar member={me} />
              <span>
                {me.display_name} <span className="muted">(you)</span>
              </span>
            </span>
            <span className="muted small">{me.is_sharing ? (myPosition ? 'Sharing' : 'Not sharing yet') : 'Paused'}</span>
          </li>
        )}
        {rows.map((row) => (
          <MemberRow key={row.member.user_id} row={row} heading={heading} now={now} onSelect={onSelect} />
        ))}
      </ul>
      {myPosition && someoneVisible && (
        <p className="muted small hint">
          {heading === null
            ? 'Arrows point relative to north (the top of the map).'
            : 'Arrows point relative to where your phone is facing.'}{' '}
          Tap someone to find them on the map.
        </p>
      )}
    </section>
  )
}

function MemberRow({ row, heading, now, onSelect }: { row: Row; heading: number | null; now: number; onSelect: (id: string) => void }) {
  const { member, direction, seenAt, stale } = row
  const status = !member.is_sharing ? 'Paused' : seenAt ? `Seen ${timeAgo(seenAt, now)}` : 'No location yet'
  const content = (
    <>
      <span className="member-name">
        <Avatar member={member} />
        <span className="member-text">
          <span>{member.display_name}</span>
          <span className="muted small">
            {status}
            {direction.kind === 'away' && ` · ${cardinal(direction.bearing)}`}
          </span>
        </span>
      </span>
      <DirectionCell direction={direction} heading={heading} stale={stale} />
    </>
  )
  if (!seenAt) return <li>{content}</li>
  return (
    <li className={stale ? 'is-stale' : undefined}>
      <button type="button" className="member-row-button" onClick={() => onSelect(member.user_id)} aria-label={describe(row, now)}>
        {content}
      </button>
    </li>
  )
}

function DirectionCell({ direction, heading, stale }: { direction: Direction; heading: number | null; stale: boolean }) {
  if (direction.kind === 'unknown') return null
  const prefix = stale ? '~' : ''
  if (direction.kind === 'nearby') {
    return (
      <span className="direction">
        <span className="nearby-dot" aria-hidden="true" />
        <span className="distance">Nearby</span>
      </span>
    )
  }
  return (
    <span className="direction">
      <DirectionArrow bearing={direction.bearing} heading={heading} />
      <span className="distance">{prefix}{formatDistance(direction.distanceM)}</span>
    </span>
  )
}

function Avatar({ member }: { member: GroupMember }) {
  return (
    <span className="avatar" style={{ background: memberColor(member.user_id) }} aria-hidden="true">
      {initials(member.display_name)}
    </span>
  )
}

/** Screen reader label, e.g. "Bob, 850 m north-east, seen just now. Show on map." */
function describe({ member, direction, seenAt }: Row, now: number): string {
  const where =
    direction.kind === 'away'
      ? `${formatDistance(direction.distanceM)} ${cardinalName(direction.bearing)}`
      : direction.kind === 'nearby'
        ? 'nearby'
        : null
  const seen = seenAt ? `seen ${timeAgo(seenAt, now)}` : null
  return [member.display_name, where, seen].filter(Boolean).join(', ') + '. Show on map.'
}
