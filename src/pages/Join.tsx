import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { joinGroup } from '../core/groups'
import { formatGroupCode, isValidGroupCode, normalizeGroupCode } from '../core/groupCode'
import { loadDisplayName, saveDisplayName } from '../lib/displayName'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

/** /j/:code: the page a shared link opens. */
export function Join() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(loadDisplayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isValidGroupCode(code)) {
    return (
      <main className="page">
        <section className="card">
          <h1>That link doesn't look right</h1>
          <p>Group codes are 6 letters and numbers, like ABC-234. Ask for the link again, or type the code.</p>
          <Link className="button" to="/">Enter a code</Link>
        </section>
      </main>
    )
  }
  // Canonical URL, so links typed as /j/abc-234 still work and look tidy.
  if (code !== normalizeGroupCode(code)) {
    return <Navigate to={`/j/${normalizeGroupCode(code)}`} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      saveDisplayName(displayName)
      const group = await joinGroup(supabase, { code, displayName })
      navigate(`/g/${group.id}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">You're invited to join</p>
        <h1 className="code-display">{formatGroupCode(code)}</h1>
        <form onSubmit={onSubmit}>
          <label htmlFor="join-display-name">Your name</label>
          <input
            id="join-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How others see you"
            autoComplete="nickname"
            maxLength={40}
            required
            autoFocus
          />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join group'}
          </button>
        </form>
        <p className="muted small">
          Everyone in the group will see your live location while you have this page open.
        </p>
      </section>
      <Link className="back-link" to="/">Back</Link>
    </main>
  )
}
