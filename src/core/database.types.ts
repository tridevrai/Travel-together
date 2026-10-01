// Hand-written to match supabase/migrations. Regenerate with
// `supabase gen types typescript --local > src/core/database.types.ts`
// once the local stack is running, and keep the shape in sync.

type GroupRow = {
  id: string
  code: string
  name: string
  created_by: string | null
  expires_at: string | null
  created_at: string
}

type GroupMemberRow = {
  group_id: string
  user_id: string
  display_name: string
  is_sharing: boolean
  joined_at: string
}

type MemberLocationRow = {
  group_id: string
  user_id: string
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
  speed: number | null
  updated_at: string
}

export type Database = {
  public: {
    Tables: {
      groups: {
        Row: GroupRow
        Insert: never
        Update: never
        Relationships: []
      }
      group_members: {
        Row: GroupMemberRow
        Insert: never
        Update: Partial<Pick<GroupMemberRow, 'display_name' | 'is_sharing'>>
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
        ]
      }
      member_locations: {
        Row: MemberLocationRow
        Insert: Omit<MemberLocationRow, 'updated_at'> & { updated_at?: string }
        Update: Partial<Omit<MemberLocationRow, 'updated_at'>>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      create_group: {
        Args: { name: string; display_name: string; expires_at?: string | null }
        Returns: GroupRow
      }
      join_group: {
        Args: { code: string; display_name: string }
        Returns: GroupRow[]
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Group = GroupRow
export type GroupMember = GroupMemberRow
export type MemberLocation = MemberLocationRow
