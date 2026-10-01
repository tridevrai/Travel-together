import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getGroup, isExpired, setSharing } from '../core/groups'
import type { Group as GroupRow, GroupMember } from '../core/database.types'
import { formatGroupCode, joinPath } from '../core/groupCode'
import { isStale, type LocationMap } from '../core/locations'
import type { MapPoint } from '../components/GroupMap'
import { SharingPanel } from '../components/SharingPanel'
import { errorMessage } from '../lib/errors'
import { initials, memberColor, timeAgo } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'
import { useGroupLocations } from '../lib/useGroupLocations'
import { useLocationSharing } from '../lib/useLocationSharing'
import { useMembers } from '../lib/useMembers'
import { useNow } from '../lib/useNow'
import { useUser } from '../lib/useSession'

// MapLibre is large; only load it on the group page.
const GroupMap = lazy(() => import('../components/GroupMap'))

export function Group() {
  const { groupId = '' } = useParams()
  const [state] = useAsync(() => getGroup(supabase, groupId), groupId)

  if (state.status === 'loading') return <main className="page"><p className="muted">Loading…</p></main>
  if (state.status === 'error') {
    return (
      <main className="page">
        <p className="error" role="alert">{errorMessage(state.error)}</p>
      </main>
    )
  }
  if (!state.value) {
    return (
      <main className="page">
        <section className="card">
          <h1>Group not found</h1>
          <p>It may have been deleted, or you haven't joined it on this device. Ask for the link again.</p>
          <Link className="button" to="/">Home</Link>
        </section>
      </main>
    )
  }
  return <GroupView group={state.value} />
}

function GroupView({ group }: { group: GroupRow }) {
  const user = useUser()
  const now = useNow(5_000)
  const expired = isExpired(group, new Date(now))
  const [membersState, reloadMembers] = useMembers(group.id)
  const members = useMemo(() => (membersState.status === 'done' ? membersState.value : []), [membersState])
  const me = members.find((m) => m.user_id === user.id)
  const paused = me?.is_sharing === false

  const sharing = useLocationSharing({ groupId: group.id, userId: user.id, enabled: !expired && me?.is_sharing === true })
  const locations = useGroupLocations(group.id, !expired)

  const [toggleBusy, setToggleBusy] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  async function toggleSharing(next: boolean) {
    setToggleBusy(true)
    setToggleError(null)
    try {
      await setSharing(supabase, group.id, user.id, next)
      reloadMembers()
    } catch (err) {
      setToggleError(errorMessage(err))
    } finally {
      setToggleBusy(false)
    }
  }

  const points = useMemo(
    () => toMapPoints(members, locations, user.id, sharing.status, now),
    [members, locations, user.id, sharing.status, now],
  )

  return (
    <main className="page">
      <header className="group-header">
        <Link className="back-link" to="/">All groups</Link>
        <h1>{group.name}</h1>
        {expired ? (
          <p className="notice">This trip has ended. Locations are no longer shared.</p>
        ) : (
          group.expires_at && (
            <p className="muted small">Sharing ends {new Date(group.expires_at).toLocaleString()}</p>
          )
        )}
      </header>
      {!expired && me && (
        <SharingPanel
          status={sharing.status}
          paused={paused}
          now={now}
          onStart={sharing.start}
          onPause={() => void toggleSharing(false)}
          onResume={() => void toggleSharing(true)}
          busy={toggleBusy}
        />
      )}
      {toggleError && <p className="error" role="alert">{toggleError}</p>}
      {!expired && (
        <Suspense fallback={<div className="map-wrap map-loading muted">Loading map…</div>}>
          <GroupMap points={points} now={now} />
        </Suspense>
      )}
      <MembersCard
        members={members}
        state={membersState.status}
        error={membersState.status === 'error' ? membersState.error : null}
        locations={locations}
        userId={user.id}
        now={now}
      />
      {!expired && <InviteCard code={group.code} />}
    </main>
  )
}

/** Everyone with a visible position; my own uses the live device fix when available. */
function toMapPoints(
  members: GroupMember[],
  locations: LocationMap,
  myId: string,
  sharing: ReturnType<typeof useLocationSharing>['status'],
  now: number,
): MapPoint[] {
  const points: MapPoint[] = []
  for (const m of members) {
    if (!m.is_sharing) continue
    const isMe = m.user_id === myId
    if (isMe && sharing.kind === 'sharing') {
      const at = sharing.lastUploadAt ?? now
      points.push({ userId: m.user_id, name: m.display_name, lat: sharing.fix.lat, lng: sharing.fix.lng, updatedAt: new Date(at).toISOString(), stale: false, isMe })
      continue
    }
    const loc = locations.get(m.user_id)
    if (!loc) continue
    points.push({ userId: m.user_id, name: m.display_name, lat: loc.lat, lng: loc.lng, updatedAt: loc.updated_at, stale: isStale(loc, now), isMe })
  }
  return points
}

function MembersCard(props: {
  members: GroupMember[]
  state: 'loading' | 'done' | 'error'
  error: unknown
  locations: LocationMap
  userId: string
  now: number
}) {
  const { members, state, error, locations, userId, now } = props
  return (
    <section className="card">
      <h2>Members</h2>
      {state === 'loading' && <p className="muted">Loading…</p>}
      {state === 'error' && <p className="error">{errorMessage(error)}</p>}
      {state === 'done' && (
        <ul className="member-list">
          {members.map((m) => {
            const loc = locations.get(m.user_id)
            const isMe = m.user_id === userId
            return (
              <li key={m.user_id} className={loc && isStale(loc, now) ? 'is-stale' : undefined}>
                <span className="member-name">
                  <span className="avatar" style={{ background: memberColor(m.user_id) }} aria-hidden="true">
                    {initials(m.display_name)}
                  </span>
                  {m.display_name}
                  {isMe && <span className="muted"> (you)</span>}
                </span>
                <span className="muted small">
                  {!m.is_sharing ? 'Paused' : loc ? `Seen ${timeAgo(loc.updated_at, now)}` : 'No location yet'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function InviteCard({ code }: { code: string }) {
  const link = `${window.location.origin}${joinPath(code)}`
  const [copied, setCopied] = useState(false)

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my group on Travel Together', url: link })
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link', link)
    }
  }

  return (
    <section className="card invite">
      <div>
        <p className="eyebrow">Invite code</p>
        <p className="code-display">{formatGroupCode(code)}</p>
      </div>
      <button type="button" onClick={share}>
        {copied ? 'Link copied' : 'Share link'}
      </button>
    </section>
  )
}
