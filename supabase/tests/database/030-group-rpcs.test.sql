-- create_group / join_group, and the direct writes clients must not be able to do.
begin;
select plan(24);

select tests.create_user('alice');
select tests.create_user('bob');

-- Code generation.
select ok(
  (select bool_and(c ~ '^[A-HJ-NP-Z2-9]{6}$') and count(distinct c) > 990
   from (select public.generate_group_code() as c from generate_series(1, 1000)) codes),
  'generated codes are 6 chars from the unambiguous alphabet and effectively unique'
);
select is(public.normalize_group_code(' ab3-k9z '), 'AB3K9Z', 'codes are normalized from user input');

-- create_group
select tests.authenticate_as('alice');
select throws_ok(
  $$select public.create_group('  ', 'Alice')$$,
  '22023', 'invalid_group_name', 'create_group rejects a blank name'
);
select throws_ok(
  $$select public.create_group('Alps', '')$$,
  '22023', 'invalid_display_name', 'create_group rejects a blank display name'
);
select throws_ok(
  $$select public.create_group('Alps', 'Alice', now() - interval '1 day')$$,
  '22023', 'invalid_expiry', 'create_group rejects an expiry in the past'
);
select lives_ok(
  $$select public.create_group(' Alps ', ' Alice ', now() + interval '7 days')$$,
  'a signed-in user can create a group'
);
select results_eq(
  'select name, created_by, expires_at from public.groups',
  format($$values ('Alps'::text, %L::uuid, now() + interval '7 days')$$, tests.uid('alice')),
  'the creator can read their new group'
);
select results_eq(
  'select user_id, display_name, is_sharing from public.group_members',
  format($$values (%L::uuid, 'Alice'::text, true)$$, tests.uid('alice')),
  'the creator is added as a sharing member'
);
reset role;
select set_config('test.alps', (select id::text from public.groups where name = 'Alps'), true);
select set_config('test.alps_code', (select code from public.groups where name = 'Alps'), true);

select tests.authenticate_as_anon();
select throws_ok(
  $$select public.create_group('Nope', 'Anon')$$,
  '42501', null, 'anon cannot create a group'
);
reset role;

-- join_group
select tests.authenticate_as('bob');
select throws_ok(
  $$select public.join_group('ZZZZZZ', 'Bob')$$,
  'P0002', 'group_not_found', 'join_group rejects an unknown code'
);
select throws_ok(
  format('select public.join_group(%L, %L)', current_setting('test.alps_code'), ' '),
  '22023', 'invalid_display_name', 'join_group rejects a blank display name'
);
select is(
  (select id from public.join_group(
     lower(substr(current_setting('test.alps_code'), 1, 3) || '-' || substr(current_setting('test.alps_code'), 4)),
     'Bobby')),
  current_setting('test.alps')::uuid,
  'join_group accepts a lowercase, dashed code and returns the group'
);
select lives_ok(
  format('select public.join_group(%L, %L)', current_setting('test.alps_code'), 'Bob'),
  'joining again is idempotent'
);
select results_eq(
  format('select display_name from public.group_members where group_id = %L and user_id = %L',
         current_setting('test.alps'), tests.uid('bob')),
  $$values ('Bob'::text)$$,
  're-joining keeps one membership and updates the display name'
);
select results_eq(
  format('select count(*) from public.group_members where group_id = %L', current_setting('test.alps')),
  $$values (2::bigint)$$,
  'after joining, a member sees the whole member list'
);

-- Direct writes that must go through the RPCs (or not happen at all).
select throws_ok(
  $$insert into public.groups (code, name) values ('ABCDEF', 'Sneaky')$$,
  '42501', null, 'clients cannot insert groups directly'
);
select throws_ok(
  format($$insert into public.group_members (group_id, user_id, display_name) values (%L, %L, 'Bob')$$,
         current_setting('test.alps'), tests.uid('bob')),
  '42501', null, 'clients cannot insert memberships directly'
);
select throws_ok(
  format($$update public.groups set expires_at = null where id = %L$$, current_setting('test.alps')),
  '42501', null, 'clients cannot modify groups directly'
);
select throws_ok(
  $$select public.generate_group_code()$$,
  '42501', null, 'internal helpers are not part of the client API'
);

-- Members edit only their own row, and only name/sharing.
update public.group_members set display_name = 'Robert'
where group_id = current_setting('test.alps')::uuid and user_id = tests.uid('bob');
update public.group_members set display_name = 'Hacked', is_sharing = false
where group_id = current_setting('test.alps')::uuid and user_id = tests.uid('alice');
select throws_ok(
  format($$update public.group_members set group_id = gen_random_uuid() where user_id = %L$$, tests.uid('bob')),
  '42501', null, 'members cannot move their membership to another group'
);
select throws_ok(
  format($$delete from public.groups where id = %L$$, current_setting('test.alps')),
  '42501', null, 'clients cannot delete groups'
);
delete from public.group_members
where group_id = current_setting('test.alps')::uuid and user_id = tests.uid('alice');
reset role;

select results_eq(
  format('select user_id, display_name, is_sharing from public.group_members where group_id = %L order by display_name',
         current_setting('test.alps')),
  format($$values (%L::uuid, 'Alice'::text, true), (%L::uuid, 'Robert'::text, true)$$,
         tests.uid('alice'), tests.uid('bob')),
  'members can rename themselves but cannot edit or remove other members'
);

-- Expired groups cannot be joined.
select tests.create_user('carol');
update public.groups set expires_at = now() - interval '1 minute'
where id = current_setting('test.alps')::uuid;
select tests.authenticate_as('carol');
select throws_ok(
  format('select public.join_group(%L, %L)', current_setting('test.alps_code'), 'Carol'),
  '22023', 'group_expired', 'join_group rejects an expired group'
);
reset role;
select is_empty(
  format('select * from public.group_members where user_id = %L', tests.uid('carol')),
  'a rejected join adds no membership'
);

select * from finish();
rollback;
