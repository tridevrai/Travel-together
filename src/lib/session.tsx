import { useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { SessionContext, type SessionState } from './useSession'
import { supabase } from './supabase'

// Shared so React StrictMode's double effects can't create two anonymous users.
let pending: Promise<User> | null = null

async function signInIfNeeded(): Promise<User> {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user
  const { data: signedIn, error } = await supabase.auth.signInAnonymously()
  if (error || !signedIn.user) throw error ?? new Error('Anonymous sign-in failed')
  return signedIn.user
}

function ensureUser(): Promise<User> {
  pending ??= signInIfNeeded().finally(() => {
    pending = null
  })
  return pending
}

/** Signs the visitor in anonymously (once per browser) before rendering children. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    ensureUser().then(
      (user) => !cancelled && setState({ status: 'ready', user }),
      (error: unknown) => {
        console.error(error)
        if (!cancelled) {
          setState({ status: 'error', message: 'Could not connect. Check your connection and reload.' })
        }
      },
    )
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setState({ status: 'ready', user: session.user })
    })
    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}
