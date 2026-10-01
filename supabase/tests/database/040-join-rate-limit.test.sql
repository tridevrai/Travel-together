-- join_group refuses callers with too many recent failed joins, so group codes
-- cannot be brute-forced.
begin;
select plan(9);

select tests.create_user('alice');
select tests.create_user('guesser');
select tests.create_user('accomplice');
select tests.create_user('neighbour');

select tests.authenticate_as('alice');
select public.create_group('Alps', 'Alice');
reset role;
select set_config('test.alps_code', (select code from public.groups where name = 'Alps'), true);

-- Per user: 5 failures per 15 minutes.
select tests.authenticate_as('guesser');
select is(
  (select count(*) from generate_series(1, 5) i,
     lateral public.join_group(lpad(i::text, 6, 'Z'), 'Guesser')),
  0::bigint,
  'the first five wrong codes just return no row'
);
select throws_ok(
  $$select public.join_group('ZZZZZY', 'Guesser')$$,
  '54000', 'too_many_attempts',
  'the sixth wrong code within 15 minutes is refused'
);
select throws_ok(
  format('select public.join_group(%L, %L)', current_setting('test.alps_code'), 'Guesser'),
  '54000', 'too_many_attempts',
  'while locked out, even a valid code is refused'
);
reset role;
select is_empty(
  format('select * from public.group_members where user_id = %L', tests.uid('guesser')),
  'a locked-out user was not added to the group'
);

-- Failures outside the window no longer count.
update public.join_attempts set attempted_at = now() - interval '16 minutes'
where user_id = tests.uid('guesser');
select tests.authenticate_as('guesser');
select isnt_empty(
  format('select * from public.join_group(%L, %L)', current_setting('test.alps_code'), 'Guesser'),
  'once the window has passed, the user can join again'
);
reset role;

-- A successful join is not counted as a failure.
select tests.authenticate_as('alice');
select lives_ok(
  format($$select public.join_group(%L, 'Alice'), public.join_group(%L, 'Alice'),
                  public.join_group(%L, 'Alice'), public.join_group(%L, 'Alice'),
                  public.join_group(%L, 'Alice'), public.join_group(%L, 'Alice')$$,
         current_setting('test.alps_code'), current_setting('test.alps_code'),
         current_setting('test.alps_code'), current_setting('test.alps_code'),
         current_setting('test.alps_code'), current_setting('test.alps_code')),
  'repeated successful joins are never rate-limited'
);
reset role;

-- Per IP: 20 failures per hour, across all accounts from that IP.
insert into public.join_attempts (user_id, ip)
select tests.uid('accomplice'), '203.0.113.7'
from generate_series(1, 20);

select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.7"}', true);
select tests.authenticate_as('neighbour');
select throws_ok(
  format('select public.join_group(%L, %L)', current_setting('test.alps_code'), 'Neighbour'),
  '54000', 'too_many_attempts',
  'a fresh account from an IP with too many failures is refused'
);
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.1, 10.0.0.1"}', true);
select isnt_empty(
  format('select * from public.join_group(%L, %L)', current_setting('test.alps_code'), 'Neighbour'),
  'the same account from a different IP can join'
);

-- Clients cannot see or tamper with the attempt log.
select throws_ok(
  'delete from public.join_attempts',
  '42501', null,
  'clients cannot clear the attempt log'
);
reset role;

select * from finish();
rollback;
