begin;
select plan(8);

select tables_are('public', array['groups', 'group_members', 'member_locations', 'join_attempts']);

select ok(relrowsecurity, format('RLS is enabled on %s', relname))
from pg_class
where oid in ('public.groups'::regclass, 'public.group_members'::regclass, 'public.member_locations'::regclass)
order by relname;

-- `anon` (no session) gets nothing; anonymous sign-ins use `authenticated`.
select ok(
  not has_table_privilege('anon', 'public.member_locations', 'select'),
  'anon cannot select member_locations'
);
select ok(
  not has_function_privilege('anon', 'public.join_group(text, text)', 'execute'),
  'anon cannot call join_group'
);

-- Members may only change these two columns of their own row.
select ok(
  not has_column_privilege('authenticated', 'public.group_members', 'group_id', 'update')
  and not has_column_privilege('authenticated', 'public.group_members', 'user_id', 'update'),
  'authenticated cannot update group_members keys'
);

select ok(
  (select count(*) = 2 from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('member_locations', 'group_members')),
  'member_locations and group_members are published to realtime'
);

select * from finish();
rollback;
