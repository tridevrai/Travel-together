import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getGroup, isExpired, listMembers } from '../core/groups'
import type { Group as GroupRow, GroupMember } from '../core/database.types'
import { formatGroupCode, joinPath } from '../core/groupCode'
import { errorMessage } from '../lib/errors'
import { useUser } from '../lib/useSession'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'

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
  const expired = isExpired(group)

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
      {!expired && <InviteCard code={group.code} />}
      <section className="card map-placeholder" aria-label="Map">
        <p className="muted">The live map arrives in the next step.</p>
      </section>
      <MembersCard groupId={group.id} />
    </main>
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

function MembersCard({ groupId }: { groupId: string }) {
  const user = useUser()
  const [state, reload] = useAsync(() => listMembers(supabase, groupId), groupId)

  // Refresh when someone joins, leaves, renames or pauses.
  useEffect(() => {
    const channel = supabase
      .channel(`group-members:${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` },
        reload,
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [groupId, reload])

  return (
    <section className="card">
      <h2>Members</h2>
      {state.status === 'loading' && <p className="muted">Loading…</p>}
      {state.status === 'error' && <p className="error">{errorMessage(state.error)}</p>}
      {state.status === 'done' && (
        <ul className="member-list">
          {state.value.map((m: GroupMember) => (
            <li key={m.user_id}>
              <span>
                {m.display_name}
                {m.user_id === user.id && <span className="muted"> (you)</span>}
              </span>
              {!m.is_sharing && <span className="muted small">Paused</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
