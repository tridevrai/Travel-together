import type { ReactNode } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Group } from './pages/Group'
import { Home } from './pages/Home'
import { Join } from './pages/Join'
import { SessionProvider } from './lib/session'
import { useSession } from './lib/useSession'
import { isConfigured } from './lib/supabase'

function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession()
  if (session.status === 'loading') return <main className="page"><p className="muted">Connecting…</p></main>
  if (session.status === 'error') {
    return (
      <main className="page">
        <p className="error" role="alert">{session.message}</p>
      </main>
    )
  }
  return children
}

function NotFound() {
  return (
    <main className="page">
      <h1>Page not found</h1>
      <a className="button" href="/">Home</a>
    </main>
  )
}

const router = createBrowserRouter([
  { path: '/', element: <RequireSession><Home /></RequireSession> },
  { path: '/j/:code', element: <RequireSession><Join /></RequireSession> },
  { path: '/g/:groupId', element: <RequireSession><Group /></RequireSession> },
  { path: '*', element: <NotFound /> },
])

export default function App() {
  if (!isConfigured) {
    return (
      <main className="page">
        <section className="card">
          <h1>Setup needed</h1>
          <p>
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>{' '}
            (see <code>.env.example</code>), then restart the dev server.
          </p>
        </section>
      </main>
    )
  }
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  )
}
