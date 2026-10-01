-- Test helpers shared by the other files. Runs first (files run in name order)
-- and commits, so later files can use the `tests` schema. Only ever loaded into
-- local/CI databases by the test runner, never by a migration.
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Creates an auth user identified by a short test name (e.g. 'alice').
create or replace function tests.create_user(name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, is_anonymous)
  values (new_id, 'authenticated', 'authenticated', name || '@test.local',
          jsonb_build_object('test_name', name), true);
  return new_id;
end;
$$;

create or replace function tests.uid(name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where email = name || '@test.local';
$$;

-- Acts as the given user for the rest of the transaction, like a request
-- carrying their JWT would (role `authenticated`, auth.uid() = their id).
create or replace function tests.authenticate_as(name text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  user_id uuid := tests.uid(name);
begin
  if user_id is null then
    raise exception 'unknown test user %', name;
  end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', user_id, 'role', 'authenticated', 'is_anonymous', true)::text,
    true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Acts as a request with no session at all (role `anon`).
create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select has_function('tests', 'authenticate_as', array['text']);
select * from finish();
commit;
