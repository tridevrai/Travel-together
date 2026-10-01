# Travel Together

A web app that lets a group travelling together see each other's live location.
People join with a short code or a `/j/:code` link; no install needed.

Status: v1 steps 1–4 — the Supabase schema, RLS policies and RPCs; the web app
with anonymous sign-in, create/join screens and the `/j/:code` route; live
location sharing on a map; and distance and direction to each member. Next:
compass-relative arrows (device orientation).

## Web app

Vite + React + TypeScript, `@supabase/supabase-js`, React Router, MapLibre GL
with [OpenFreeMap](https://openfreemap.org) tiles (no API key; set
`VITE_MAP_STYLE_URL` to use another provider).

```sh
npm install
cp .env.example .env.local   # fill in the Supabase URL and anon key
npm run dev
```

| Route | Page |
| --- | --- |
| `/` | Join with a code, start a group, list your groups |
| `/j/:code` | Join page a shared link opens (code is normalized, e.g. `/j/abc-234` → `/j/ABC234`) |
| `/g/:groupId` | Group: sharing status and pause/resume, live map, members with distance, direction and "last seen", invite code |

Visitors are signed in anonymously on first load; the session persists in the
browser.

Location sharing (on the group page):

- Asks for location permission from a "Start sharing" tap; starts by itself on
  later visits once permission is granted. A blocked permission gets a help card.
- Uploads the latest position when the device has moved more than 15 m or 30 s
  have passed, never more often than every 5 s (`src/core/uploadThrottle.ts`).
- Other members' markers update via Realtime; the list reloads on reconnect and
  when the tab comes back to the foreground. Positions older than 2 minutes are
  dimmed and labelled with how long ago they were seen.
- Pause/resume sets `is_sharing`; pausing deletes the stored position.
- Members list: closest first, with distance (haversine), an arrow along the
  initial great-circle bearing and the compass point, and "Seen x ago". When
  the distance is within both phones' GPS accuracy it says "Nearby" instead of
  showing a meaningless arrow. Tapping someone centres the map on them. Arrows
  are north-up until the compass step (`src/core/directions.ts`).
- Sharing stops when the phone locks or the browser is in the background; the
  page says so. `src/core/` holds the framework-free group API and code helpers so
the future React Native app can reuse them.

Checks: `npm run lint`, `npm test` (Vitest), `npm run build`.
Deploying: any static host works as long as every path falls back to
`index.html` (`vercel.json` and `public/_redirects` handle Vercel and Netlify).
HTTPS is required for geolocation.

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
`too_many_attempts` (HTTP 429, even with a valid code) until the window passes. Unknown
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
