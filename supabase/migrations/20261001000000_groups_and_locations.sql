-- Group location sharing: schema, RLS and RPCs (v1).
--
-- Clients never insert into `groups` or `group_members` directly and never look
-- a group up by code: they go through `create_group` / `join_group`. Everything
-- else is plain table access guarded by RLS.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  -- 6 chars from an unambiguous alphabet (no 0/O/1/I).
  code text unique not null check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  name text not null check (char_length(name) between 1 and 80),
  -- Nullable so deleting the creator's (anonymous) account keeps the group alive.
  created_by uuid references auth.users (id) on delete set null,
  -- Trip end. After this, nobody can join and locations are hidden and frozen.
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  is_sharing boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_id_idx on public.group_members (user_id);

-- Latest position only: one row per member, upserted by the client.
create table public.member_locations (
  group_id uuid not null,
  user_id uuid not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m real check (accuracy_m >= 0),
  heading real check (heading >= 0 and heading < 360),
  speed real check (speed >= 0),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  foreign key (group_id, user_id)
    references public.group_members (group_id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies can consult group_members without
-- recursing into its own RLS)
-- ---------------------------------------------------------------------------

create function public.is_member(group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members m
    where m.group_id = is_member.group_id
      and m.user_id = (select auth.uid())
  );
$$;

-- True while the group has not expired.
create function public.group_is_active(group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = group_is_active.group_id
      and (g.expires_at is null or g.expires_at > now())
  );
$$;

-- True if the given member of the group currently has sharing turned on.
create function public.member_is_sharing(group_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members m
    where m.group_id = member_is_sharing.group_id
      and m.user_id = member_is_sharing.user_id
      and m.is_sharing
  );
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- The server clock decides freshness, so clients cannot fake "last seen".
create function public.member_locations_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger member_locations_set_updated_at
before insert or update on public.member_locations
for each row execute function public.member_locations_set_updated_at();

-- Pausing sharing removes the stored position instead of leaving it visible.
create function public.group_members_clear_location_on_pause()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.member_locations l
  where l.group_id = new.group_id
    and l.user_id = new.user_id;
  return new;
end;
$$;

create trigger group_members_clear_location_on_pause
after update of is_sharing on public.group_members
for each row
when (old.is_sharing and not new.is_sharing)
execute function public.group_members_clear_location_on_pause();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.member_locations enable row level security;

-- groups: members can read; all writes go through RPCs.
create policy "members can read their groups"
on public.groups for select
to authenticated
using (public.is_member(id));

-- group_members: members see each other; each user edits or leaves only
-- their own row. Joining goes through join_group.
create policy "members can read fellow members"
on public.group_members for select
to authenticated
using (public.is_member(group_id));

create policy "members can update their own row"
on public.group_members for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "members can leave a group"
on public.group_members for delete
to authenticated
using (user_id = (select auth.uid()));

-- member_locations: members read positions of fellow members who are sharing,
-- while the group is active. Users write only their own row, only while they
-- are a sharing member of an active group.
create policy "members can read shared locations"
on public.member_locations for select
to authenticated
using (
  public.is_member(group_id)
  and public.group_is_active(group_id)
  and public.member_is_sharing(group_id, user_id)
);

create policy "members can insert their own location"
on public.member_locations for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.member_is_sharing(group_id, user_id)
  and public.group_is_active(group_id)
);

create policy "members can update their own location"
on public.member_locations for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and public.member_is_sharing(group_id, user_id)
  and public.group_is_active(group_id)
);

create policy "members can delete their own location"
on public.member_locations for delete
to authenticated
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privileges (defence in depth on top of RLS)
-- ---------------------------------------------------------------------------

-- Anonymous sign-ins get the `authenticated` role; the `anon` role (no session)
-- has no business with any of this.
revoke all on public.groups, public.group_members, public.member_locations from anon, public;

revoke all on public.groups from authenticated;
grant select on public.groups to authenticated;

revoke all on public.group_members from authenticated;
grant select, delete on public.group_members to authenticated;
grant update (display_name, is_sharing) on public.group_members to authenticated;

revoke all on public.member_locations from authenticated;
grant select, insert, update, delete on public.member_locations to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Random code from the unambiguous alphabet, using a CSPRNG (codes are the
-- only thing standing between a stranger and a group).
create function public.generate_group_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars
  bytes bytea := extensions.gen_random_bytes(6);
  result text := '';
begin
  for i in 0..5 loop
    -- 256 is a multiple of 32, so this is unbiased.
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

-- Accepts user input like " ab3-k9z " and returns 'AB3K9Z'.
create function public.normalize_group_code(code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(code, ''), '[\s-]', '', 'g'));
$$;

create function public.create_group(
  name text,
  display_name text,
  expires_at timestamptz default null
)
returns public.groups
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_name text := btrim(create_group.name);
  clean_display_name text := btrim(create_group.display_name);
  new_group public.groups;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if clean_name is null or char_length(clean_name) not between 1 and 80 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;
  if clean_display_name is null or char_length(clean_display_name) not between 1 and 40 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;
  if create_group.expires_at is not null and create_group.expires_at <= now() then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;

  -- 32^6 ≈ 1e9 codes, so collisions are rare; retry on the unique constraint.
  for attempt in 1..10 loop
    begin
      insert into public.groups (code, name, created_by, expires_at)
      values (public.generate_group_code(), clean_name, uid, create_group.expires_at)
      returning * into new_group;
      exit;
    exception when unique_violation then
      if attempt = 10 then
        raise;
      end if;
    end;
  end loop;

  insert into public.group_members (group_id, user_id, display_name)
  values (new_group.id, uid, clean_display_name);

  return new_group;
end;
$$;

create function public.join_group(code text, display_name text)
returns public.groups
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_display_name text := btrim(join_group.display_name);
  target public.groups;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if clean_display_name is null or char_length(clean_display_name) not between 1 and 40 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  select g.* into target
  from public.groups g
  where g.code = public.normalize_group_code(join_group.code);

  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  if target.expires_at is not null and target.expires_at <= now() then
    raise exception 'group_expired' using errcode = '22023';
  end if;

  -- Re-joining is idempotent and just refreshes the display name.
  insert into public.group_members (group_id, user_id, display_name)
  values (target.id, uid, clean_display_name)
  on conflict (group_id, user_id)
  do update set display_name = excluded.display_name;

  return target;
end;
$$;

-- Supabase grants EXECUTE on new functions to anon/authenticated by default.
-- Only the two RPCs are part of the client API; the helpers stay callable by
-- `authenticated` because RLS policies run as the querying role.
revoke execute on function
  public.is_member(uuid),
  public.group_is_active(uuid),
  public.member_is_sharing(uuid, uuid),
  public.member_locations_set_updated_at(),
  public.group_members_clear_location_on_pause(),
  public.generate_group_code(),
  public.normalize_group_code(text),
  public.create_group(text, text, timestamptz),
  public.join_group(text, text)
from public, anon, authenticated;

grant execute on function
  public.is_member(uuid),
  public.group_is_active(uuid),
  public.member_is_sharing(uuid, uuid),
  public.create_group(text, text, timestamptz),
  public.join_group(text, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Clients subscribe to postgres_changes filtered by group_id; RLS applies.
alter publication supabase_realtime add table public.member_locations, public.group_members;
