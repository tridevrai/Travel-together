import { useEffect } from 'react'
import { listMembers } from '../core/groups'
import { supabase } from './supabase'
import { useAsync } from './useAsync'

/** The group's members, refreshed when someone joins, leaves, renames or pauses. */
export function useMembers(groupId: string) {
  const [state, reload] = useAsync(() => listMembers(supabase, groupId), groupId)

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

  return [state, reload] as const
}
