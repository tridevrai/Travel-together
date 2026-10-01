-- Rate-limit join_group so nobody can brute-force group codes.
--
-- Failed joins (unknown code) are recorded per user and per client IP. Once a
-- caller has too many recent failures, every join_group call is refused, even
-- with a valid code, until the window passes.
--
-- A raised exception would roll back the recorded failure, so an unknown code
-- now returns no row instead of raising `group_not_found`. That is why
-- join_group changes from `returns public.groups` to `returns setof`.

create table public.join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  ip inet,
  attempted_at timestamptz not null default now()
);

create index join_attempts_user_idx on public.join_attempts (user_id, attempted_at);
create index join_attempts_ip_idx on public.join_attempts (ip, attempted_at) where ip is not null;
create index join_attempts_attempted_at_idx on public.join_attempts (attempted_at);

-- Internal bookkeeping only: RLS on with no policies, and no grants.
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from public, anon, authenticated;

-- Client IP as seen by the Supabase API gateway. Prefers cf-connecting-ip
-- (set by Cloudflare in front of Supabase); otherwise the first
-- x-forwarded-for entry. Null when there is no request context or the value
-- cannot be parsed, in which case only the per-user limit applies.
create function public.request_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
declare
  headers jsonb;
  raw text;
begin
  headers := nullif(current_setting('request.headers', true), '')::jsonb;
  raw := btrim(coalesce(
    headers ->> 'cf-connecting-ip',
    split_part(headers ->> 'x-forwarded-for', ',', 1)
  ));
  return nullif(raw, '')::inet;
exception when others then
  return null;
end;
$$;

drop function public.join_group(text, text);

create function public.join_group(code text, display_name text)
returns setof public.groups
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- At most 5 failed joins per user per 15 minutes, and 20 per IP per hour.
  -- Anonymous sign-ins are themselves limited per IP (config.toml), so a fresh
  -- account per batch of guesses does not get around the IP limit.
  user_limit constant int := 5;
  user_window constant interval := interval '15 minutes';
  ip_limit constant int := 20;
  ip_window constant interval := interval '1 hour';

  uid uuid := auth.uid();
  client_ip inet := public.request_ip();
  clean_display_name text := btrim(join_group.display_name);
  target public.groups;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if (select count(*) from public.join_attempts a
      where a.user_id = uid and a.attempted_at > now() - user_window) >= user_limit
     or (client_ip is not null
         and (select count(*) from public.join_attempts a
              where a.ip = client_ip and a.attempted_at > now() - ip_window) >= ip_limit)
  then
    raise exception 'too_many_attempts' using errcode = '54000',
      hint = 'Wait a few minutes before trying another code.';
  end if;

  if clean_display_name is null or char_length(clean_display_name) not between 1 and 40 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  select g.* into target
  from public.groups g
  where g.code = public.normalize_group_code(join_group.code);

  if not found then
    insert into public.join_attempts (user_id, ip) values (uid, client_ip);
    -- Keep the table small; nothing older than the longest window matters.
    delete from public.join_attempts a where a.attempted_at < now() - interval '1 day';
    return;
  end if;
  if target.expires_at is not null and target.expires_at <= now() then
    raise exception 'group_expired' using errcode = '22023';
  end if;

  -- Re-joining is idempotent and just refreshes the display name.
  insert into public.group_members (group_id, user_id, display_name)
  values (target.id, uid, clean_display_name)
  on conflict (group_id, user_id)
  do update set display_name = excluded.display_name;

  return next target;
end;
$$;

revoke execute on function public.request_ip(), public.join_group(text, text)
from public, anon, authenticated;
grant execute on function public.join_group(text, text) to authenticated;
