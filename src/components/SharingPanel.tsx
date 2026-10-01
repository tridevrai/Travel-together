import type { SharingStatus } from '../lib/useLocationSharing'
import { timeAgo } from '../lib/format'

type Props = {
  status: SharingStatus
  paused: boolean
  now: number
  onStart: () => void
  onPause: () => void
  onResume: () => void
  busy: boolean
}

/** My sharing state: onboarding, live status, problems, pause/resume. */
export function SharingPanel({ status, paused, now, onStart, onPause, onResume, busy }: Props) {
  if (paused) {
    return (
      <section className="card sharing">
        <p><strong>Sharing is paused.</strong> The group can't see where you are.</p>
        <button type="button" onClick={onResume} disabled={busy}>Resume sharing</button>
      </section>
    )
  }

  switch (status.kind) {
    case 'off':
      return null
    case 'needs-permission':
      return (
        <section className="card sharing">
          <h2>Share your location</h2>
          <p className="muted">
            Your browser will ask for permission. The group sees your position only while this page is open on your
            phone.
          </p>
          <button type="button" onClick={onStart}>Start sharing</button>
        </section>
      )
    case 'locating':
    case 'position-error':
      return (
        <section className="card sharing">
          <p>{status.kind === 'locating' ? 'Finding your location…' : status.message}</p>
          <PauseButton onPause={onPause} busy={busy} />
        </section>
      )
    case 'sharing':
      return (
        <section className="card sharing">
          <p>
            <span className="live-dot" aria-hidden="true" /> <strong>Sharing your location</strong>
            <span className="muted small">
              {' '}
              · {status.lastUploadAt ? `sent ${timeAgo(status.lastUploadAt, now)}` : 'sending…'}
              {status.fix.accuracyM !== null && ` · ±${Math.round(status.fix.accuracyM)} m`}
            </span>
          </p>
          {status.uploadError && <p className="error small">{status.uploadError}</p>}
          <p className="muted small">Keep this page open. Sharing stops when your phone locks or you switch apps.</p>
          <PauseButton onPause={onPause} busy={busy} />
        </section>
      )
    case 'denied':
      return (
        <section className="card sharing">
          <p><strong>Location access is blocked.</strong></p>
          <p className="muted small">
            Allow location for this site in your browser settings (on iPhone: Settings › Privacy & Security › Location
            Services › Safari Websites), then try again.
          </p>
          <button type="button" onClick={onStart}>Try again</button>
        </section>
      )
    case 'unavailable':
      return (
        <section className="card sharing">
          <p className="error">
            {status.reason === 'insecure'
              ? 'Location sharing needs a secure (https) connection.'
              : "This browser can't share your location."}
          </p>
        </section>
      )
  }
}

function PauseButton({ onPause, busy }: { onPause: () => void; busy: boolean }) {
  return (
    <button type="button" className="secondary" onClick={onPause} disabled={busy}>
      Pause sharing
    </button>
  )
}
