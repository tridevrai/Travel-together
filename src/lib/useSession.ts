import { createContext, useContext } from 'react'
import type { User } from '@supabase/supabase-js'

export type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; user: User }
  | { status: 'error'; message: string }

export const SessionContext = createContext<SessionState>({ status: 'loading' })

export function useSession(): SessionState {
  return useContext(SessionContext)
}

/** The signed-in user. Only use below <RequireSession>. */
export function useUser(): User {
  const state = useSession()
  if (state.status !== 'ready') throw new Error('useUser() used before the session is ready')
  return state.user
}
