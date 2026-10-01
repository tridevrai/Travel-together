import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { createGroup, isExpired, listMyGroups } from '../core/groups'
import { formatGroupCode, isValidGroupCode, joinPath } from '../core/groupCode'
import { loadDisplayName, saveDisplayName } from '../lib/displayName'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'

const EXPIRY_OPTIONS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
] as const
const DEFAULT_EXPIRY_DAYS = 7

export function Home() {
  return (
    <main className="page">
      <header className="hero">
        <h1>Travel Together</h1>
        <p>See where everyone in your group is. No app to install.</p>
      </header>
      <JoinForm />
      <CreateForm />
      <MyGroups />
    </main>
  )
}

function JoinForm() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const invalid = touched && !isValidGroupCode(code)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (isValidGroupCode(code)) navigate(joinPath(code))
  }

  return (
    <section className="card">
      <h2>Join a group</h2>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="join-code">Group code</label>
        <input
          id="join-code"
          className="code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABC-234"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'join-code-error' : undefined}
        />
        {invalid && (
          <p id="join-code-error" className="error">
            Codes are 6 letters and numbers, like ABC-234.
          </p>
        )}
        <button type="submit">Continue</button>
      </form>
    </section>
  )
}

function CreateForm() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState(loadDisplayName)
  const [expiryDays, setExpiryDays] = useState<number>(DEFAULT_EXPIRY_DAYS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      saveDisplayName(displayName)
      const group = await createGroup(supabase, {
        name,
        displayName,
        expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      })
      navigate(`/g/${group.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Start a group</h2>
      <form onSubmit={onSubmit}>
        <label htmlFor="group-name">Trip name</label>
        <input
          id="group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alps weekend"
          maxLength={80}
          required
        />
        <label htmlFor="create-display-name">Your name</label>
        <input
          id="create-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="How others see you"
          autoComplete="nickname"
          maxLength={40}
          required
        />
        <label htmlFor="expiry">Stop sharing after</label>
        <select id="expiry" value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))}>
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.days} value={o.days}>
              {o.label}
            </option>
          ))}
        </select>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </section>
  )
}

function MyGroups() {
  const [state] = useAsync(() => listMyGroups(supabase), 'my-groups')
  if (state.status !== 'done' || state.value.length === 0) return null

  return (
    <section className="card">
      <h2>Your groups</h2>
      <ul className="group-list">
        {state.value.map((g) => (
          <li key={g.id}>
            <Link to={`/g/${g.id}`}>
              <span>{g.name}</span>
              <span className="muted">{isExpired(g) ? 'Ended' : formatGroupCode(g.code)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
