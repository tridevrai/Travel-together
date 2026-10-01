# Travel Together

A web app that lets a group travelling together see each other's live location.
People join with a short code or a `/j/:code` link; no install needed.

Status: step 1 of the v1 build — the Supabase schema, RLS policies and RPCs.

## Database (`supabase/`)

- `migrations/` — schema for `groups`, `group_members` and `member_locations`
  (latest position only), RLS policies, and the `create_group` / `join_group`
  RPCs.
- `tests/database/` — pgTAP tests for the policies and RPCs.

### Client API

Sign in anonymously, then:

```ts
const { data: group } = await supabase.rpc('create_group', {
  name: 'Alps trip', display_name: 'Alice', expires_at: null,
})
const { data: joined } = await supabase.rpc('join_group', {
  code: 'ab3-k9z', display_name: 'Bob', // case, spaces and dashes are ignored
}).maybeSingle() // null means no group has that code
```

Errors are raised with these messages: `not_authenticated`, `invalid_group_name`,
`invalid_display_name`, `invalid_expiry`, `group_expired`, `too_many_attempts`.

`join_group` is rate-limited against code guessing: after 5 unknown codes in
15 minutes from one user, or 20 in an hour from one IP, every call fails with
`too_many_attempts` (even with a valid code) until the window passes. Unknown
codes return no row rather than an error, because an error would roll back the
record of the failed attempt.

Everything else is plain table access under RLS:

| Table | Members can |
| --- | --- |
| `groups` | read their groups (no direct writes; use the RPCs) |
| `group_members` | read fellow members; update their own `display_name` / `is_sharing`; delete their own row to leave |
| `member_locations` | read positions of sharing members while the group is active; upsert/delete their own row |

Rules worth knowing when building the client:

- `updated_at` is always set by the server.
- Setting `is_sharing = false` deletes the member's stored position, and uploads
  are rejected until sharing is turned back on.
- After `expires_at`, nobody can join, positions are hidden and uploads are
  rejected. The group and member list stay readable so the UI can show "trip ended".
- `member_locations` and `group_members` are in the `supabase_realtime`
  publication; subscribe with a `group_id=eq.<id>` filter.

### Running the tests

With Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli):

```sh
supabase db start
supabase test db
```

Without Docker, `scripts/db-test/run.sh` runs the same tests against a
throwaway local Postgres plus a small stand-in for Supabase's `auth` schema and
roles (needs Postgres server binaries, pgTAP and `pg_prove`).
