-- Location privacy: only fellow members of an active group can read a
-- member's position, and only the member themselves can write it.
begin;
select plan(24);

-- Alice creates "Alps", Bob joins it. Mallory is in her own group only.
select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('mallory');

select tests.authenticate_as('alice');
select public.create_group('Alps', 'Alice');
reset role;
select set_config('test.alps', (select id::text from public.groups where name = 'Alps'), true);
select set_config('test.alps_code', (select code from public.groups where name = 'Alps'), true);

select tests.authenticate_as('bob');
select public.join_group(current_setting('test.alps_code'), 'Bob');

select tests.authenticate_as('mallory');
select public.create_group('Heist', 'Mallory');
reset role;
select set_config('test.heist', (select id::text from public.groups where name = 'Heist'), true);

-- Everyone shares a position. Upsert the way supabase-js does it.
select tests.authenticate_as('alice');
select lives_ok(
  format($$insert into public.member_locations (group_id, user_id, lat, lng, accuracy_m, updated_at)
           values (%L, %L, 46.0, 7.0, 5, '2000-01-01')
           on conflict (group_id, user_id) do update
           set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m$$,
         current_setting('test.alps'), tests.uid('alice')),
  'a member can insert their own location'
);
select lives_ok(
  format($$insert into public.member_locations (group_id, user_id, lat, lng)
           values (%L, %L, 46.5, 7.5)
           on conflict (group_id, user_id) do update set lat = excluded.lat, lng = excluded.lng$$,
         current_setting('test.alps'), tests.uid('alice')),
  'a member can upsert over their own location'
);
select tests.authenticate_as('bob');
insert into public.member_locations (group_id, user_id, lat, lng)
values (current_setting('test.alps')::uuid, tests.uid('bob'), 46.1, 7.1);
select tests.authenticate_as('mallory');
insert into public.member_locations (group_id, user_id, lat, lng)
values (current_setting('test.heist')::uuid, tests.uid('mallory'), 51.5, -0.1);
reset role;

select is(
  (select updated_at from public.member_locations where user_id = tests.uid('alice')),
  now(),
  'updated_at is set by the server, not the client'
);

-- Positive control: members see each other.
select tests.authenticate_as('bob');
select results_eq(
  format('select user_id from public.member_locations where group_id = %L order by lat', current_setting('test.alps')),
  format('values (%L::uuid), (%L::uuid)', tests.uid('bob'), tests.uid('alice')),
  'a member sees every sharing member''s location in their group'
);

-- A non-member sees nothing of the group.
select tests.authenticate_as('mallory');
select is_empty(
  format('select * from public.member_locations where group_id = %L', current_setting('test.alps')),
  'a non-member cannot read the group''s locations'
);
select results_eq(
  'select user_id from public.member_locations',
  format('values (%L::uuid)', tests.uid('mallory')),
  'a user only sees locations from groups they belong to'
);
select is_empty(
  format('select * from public.groups where id = %L', current_setting('test.alps')),
  'a non-member cannot read the group'
);
select is_empty(
  format('select * from public.groups where code = %L', current_setting('test.alps_code')),
  'a non-member cannot look a group up by code'
);
select is_empty(
  format('select * from public.group_members where group_id = %L', current_setting('test.alps')),
  'a non-member cannot read the member list'
);

-- ...and cannot write into it.
select throws_ok(
  format('insert into public.member_locations (group_id, user_id, lat, lng) values (%L, %L, 0, 0)',
         current_setting('test.alps'), tests.uid('mallory')),
  '42501', null,
  'a non-member cannot insert a location into the group'
);
select throws_ok(
  format('insert into public.member_locations (group_id, user_id, lat, lng) values (%L, %L, 0, 0)',
         current_setting('test.alps'), tests.uid('alice')),
  '42501', null,
  'a non-member cannot insert a location on behalf of a member'
);
update public.member_locations set lat = 0, lng = 0 where group_id = current_setting('test.alps')::uuid;
delete from public.member_locations where group_id = current_setting('test.alps')::uuid;

-- A fellow member cannot overwrite someone else's position either.
select tests.authenticate_as('bob');
update public.member_locations set lat = 0, lng = 0 where user_id = tests.uid('alice');
select throws_ok(
  format('insert into public.member_locations (group_id, user_id, lat, lng) values (%L, %L, 0, 0)
          on conflict (group_id, user_id) do update set lat = excluded.lat',
         current_setting('test.alps'), tests.uid('alice')),
  '42501', null,
  'a member cannot upsert another member''s location'
);
select throws_ok(
  format('update public.member_locations set user_id = %L where user_id = %L',
         tests.uid('alice'), tests.uid('bob')),
  '42501', null,
  'a member cannot reassign their row to another member'
);
reset role;

select results_eq(
  format('select lat, lng from public.member_locations where group_id = %L order by lat', current_setting('test.alps')),
  $$values (46.1::float8, 7.1::float8), (46.5::float8, 7.5::float8)$$,
  'locations were not changed or deleted by non-owners'
);

-- No session at all: no access.
select tests.authenticate_as_anon();
select throws_ok(
  'select * from public.member_locations',
  '42501', null,
  'anon cannot read locations'
);
reset role;

-- Pausing sharing hides and removes the position, and blocks new uploads.
select tests.authenticate_as('bob');
update public.group_members set is_sharing = false
where group_id = current_setting('test.alps')::uuid and user_id = tests.uid('bob');
select throws_ok(
  format('insert into public.member_locations (group_id, user_id, lat, lng) values (%L, %L, 1, 1)',
         current_setting('test.alps'), tests.uid('bob')),
  '42501', null,
  'a paused member cannot upload a location'
);
reset role;
select is_empty(
  format('select * from public.member_locations where user_id = %L', tests.uid('bob')),
  'pausing sharing deletes the stored location'
);

select tests.authenticate_as('alice');
select results_eq(
  format('select user_id from public.member_locations where group_id = %L', current_setting('test.alps')),
  format('values (%L::uuid)', tests.uid('alice')),
  'members no longer see a paused member'
);

-- Resuming allows uploads again.
select tests.authenticate_as('bob');
update public.group_members set is_sharing = true
where group_id = current_setting('test.alps')::uuid and user_id = tests.uid('bob');
select lives_ok(
  format('insert into public.member_locations (group_id, user_id, lat, lng) values (%L, %L, 46.2, 7.2)',
         current_setting('test.alps'), tests.uid('bob')),
  'a resumed member can upload again'
);
reset role;

-- Once the trip has ended, locations are hidden and frozen.
update public.groups set expires_at = now() - interval '1 minute'
where id = current_setting('test.alps')::uuid;

select tests.authenticate_as('alice');
select is_empty(
  format('select * from public.member_locations where group_id = %L', current_setting('test.alps')),
  'locations are hidden after the group expires'
);
select throws_ok(
  format('insert into public.member_locations (group_id, user_id, lat, lng) values (%L, %L, 0, 0)
          on conflict (group_id, user_id) do update set lat = excluded.lat',
         current_setting('test.alps'), tests.uid('alice')),
  '42501', null,
  'locations cannot be uploaded after the group expires'
);
select isnt_empty(
  format('select * from public.groups where id = %L', current_setting('test.alps')),
  'members can still see an expired group (to show "trip ended")'
);
reset role;

-- Leaving removes the member's location along with their membership.
select tests.authenticate_as('bob');
delete from public.group_members
where group_id = current_setting('test.alps')::uuid and user_id = tests.uid('bob');
select is_empty(
  format('select * from public.groups where id = %L', current_setting('test.alps')),
  'a member who left can no longer read the group'
);
reset role;
select is_empty(
  format('select * from public.member_locations where user_id = %L', tests.uid('bob')),
  'leaving deletes the member''s location'
);

select * from finish();
rollback;
