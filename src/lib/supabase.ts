import { createClient } from '@supabase/supabase-js'
import type { Client } from '../core/groups'
import type { Database } from '../core/database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

// With missing env vars the app renders a setup message instead of crashing,
// so this placeholder client is never used.
export const supabase: Client = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'missing-anon-key',
)
