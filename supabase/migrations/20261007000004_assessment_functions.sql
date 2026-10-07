-- Question bank, practice, daily challenge, exams and live quizzes.
-- Answer keys never leave the database except: (a) after an answer is submitted,
-- (b) in downloadable practice sets, which only contain questions marked for practice.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public._question_json(q public.questions)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'course_id', q.course_id, 'topic_id', q.topic_id, 'lesson_id', q.lesson_id,
    'topic_name', (select t.name from public.topics t where t.id = q.topic_id),
    'kind', q.kind, 'difficulty', q.difficulty, 'prompt', q.prompt, 'choices', q.choices,
    'allows_multiple', q.allows_multiple);
$$;

create or replace function public._can_access_question(q public.questions, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select q.is_published
     and (not q.is_premium or public.is_premium(uid))
     and (q.course_id is null or exists (
           select 1 from public.courses c where c.id = q.course_id and c.is_published
              and (not c.is_premium or public.is_premium(uid))));
$$;

create or replace function public._grade(question_id uuid, answer jsonb)
returns boolean language sql stable security definer set search_path = public as $$
  with submitted as (
    select case when jsonb_typeof(answer -> 'choice_ids') = 'array' then answer -> 'choice_ids' else '[]'::jsonb end as ids
  )
  select case
    when q.kind in ('multiple_choice', 'true_false') then
      jsonb_array_length(s.ids) > 0
      and array(select x from jsonb_array_elements_text(s.ids) x order by 1)
        = array(select y from unnest(k.correct_choice_ids) y order by 1)
    else
      public.normalize_answer(answer ->> 'text') <> ''
      and exists (select 1 from unnest(k.accepted_answers) a where public.normalize_answer(a) = public.normalize_answer(answer ->> 'text'))
    end
  from submitted s, public.questions q join public.question_keys k on k.question_id = q.id
  where q.id = _grade.question_id;
$$;

create or replace function public._answer_result(question_id uuid, is_correct boolean, xp int)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('is_correct', is_correct, 'correct_choice_ids', to_jsonb(k.correct_choice_ids),
                            'accepted_answer', k.accepted_answers[1], 'explanation', k.explanation, 'xp_awarded', xp)
    from public.question_keys k where k.question_id = _answer_result.question_id;
$$;

-- ---------------------------------------------------------------------------
-- Question bank browsing
-- ---------------------------------------------------------------------------

create or replace function public.question_subjects()
returns setof text
language sql stable security definer set search_path = public as $$
  select distinct t.subject from public.topics t
   where exists (select 1 from public.questions q where q.topic_id = t.id and q.is_published)
   order by 1;
$$;

create or replace function public.topics_with_counts(course_id uuid default null, subject text default null)
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'course_id', t.course_id, 'subject', t.subject, 'name', t.name,
                            'question_count', count(q.id))
    from public.topics t
    join public.questions q on q.topic_id = t.id and q.is_published and q.usage <> 'exam'
   where (topics_with_counts.course_id is null or t.course_id = topics_with_counts.course_id)
     and (topics_with_counts.subject is null or t.subject = topics_with_counts.subject)
   group by t.id
   order by t.subject, t.name;
$$;

-- Picks practice questions for a mode. Never returns answer keys.
create or replace function public.practice_questions(
  mode text, course_id uuid default null, topic_id uuid default null, subject text default null,
  difficulty int default null, count int default 10
) returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  n int := least(greatest(coalesce(practice_questions.count, 10), 1), 50);
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  return query
  with candidates as (
    select q.*
      from public.questions q
      left join public.topics t on t.id = q.topic_id
     where q.usage <> 'exam'
       and public._can_access_question(q, uid)
       and (practice_questions.course_id is null or q.course_id = practice_questions.course_id)
       and (practice_questions.topic_id is null or q.topic_id = practice_questions.topic_id)
       and (practice_questions.subject is null or t.subject = practice_questions.subject)
       and (practice_questions.difficulty is null or q.difficulty = practice_questions.difficulty)
       and case practice_questions.mode
         when 'weak_areas' then q.topic_id in (
           select qa.topic_id from public.question_attempts qa
            where qa.user_id = uid and qa.topic_id is not null
            group by qa.topic_id
           having count(*) >= 2 and avg(case when qa.is_correct then 1.0 else 0 end) < 0.7)
         when 'revision' then q.lesson_id in (
           select lp.lesson_id from public.lesson_progress lp where lp.user_id = uid and lp.completed_at is not null)
           or (practice_questions.course_id is not null and q.course_id = practice_questions.course_id)
         when 'saved' then q.id in (
           select b.item_id from public.bookmarks b where b.user_id = uid and b.item_type = 'question')
         when 'quick' then practice_questions.course_id is not null
           or q.course_id is null
           or q.course_id in (select e.course_id from public.enrollments e where e.user_id = uid)
           or exists (select 1 from public.courses c where c.id = q.course_id
                        and c.category_id = any(coalesce((select p.interests from public.profiles p where p.id = uid), '{}')))
         else true
       end
  )
  select public._question_json(c)
    from candidates c
   order by
     -- Weak areas: questions previously answered wrong come first.
     case when practice_questions.mode = 'weak_areas' then
       (select count(*) filter (where not qa.is_correct) from public.question_attempts qa
         where qa.user_id = uid and qa.question_id = c.id) end desc nulls last,
     -- Prefer questions not yet seen.
     (select count(*) from public.question_attempts qa where qa.user_id = uid and qa.question_id = c.id),
     random()
   limit n;
end $$;

-- Instant feedback for practice. Exam-only questions cannot be checked here.
create or replace function public.check_answer(question_id uuid, answer jsonb, context text default 'practice')
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  q public.questions;
  correct boolean;
  first_correct boolean;
  xp int := 0;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into q from public.questions where id = check_answer.question_id;
  if not found or q.usage = 'exam' or not public._can_access_question(q, uid) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Throttle automated answer harvesting.
  if (select count(*) from public.question_attempts qa where qa.user_id = uid and qa.answered_at > now() - interval '1 minute') >= 40 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  correct := coalesce(public._grade(q.id, check_answer.answer), false);
  first_correct := correct and not exists (
    select 1 from public.question_attempts qa where qa.user_id = uid and qa.question_id = q.id and qa.is_correct);

  insert into public.question_attempts (user_id, question_id, topic_id, is_correct, context)
  values (uid, q.id, q.topic_id, correct, 'practice');

  if first_correct then xp := 2 * q.difficulty; end if;
  perform public._touch_activity(uid, (now() at time zone 'utc')::date, 0, 0, 1, xp);
  if first_correct then perform public._check_achievements(uid); end if;

  return public._answer_result(q.id, correct, xp);
end $$;

create or replace function public.bookmarked_questions()
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select public._question_json(q)
    from public.bookmarks b join public.questions q on q.id = b.item_id
   where b.user_id = auth.uid() and b.item_type = 'question' and q.usage <> 'exam'
   order by b.created_at desc;
$$;

create or replace function public.topic_performance()
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('topic_id', t.id, 'topic_name', t.name,
                            'correct', count(*) filter (where qa.is_correct), 'total', count(*))
    from public.question_attempts qa join public.topics t on t.id = qa.topic_id
   where qa.user_id = auth.uid() and qa.answered_at > now() - interval '90 days'
   group by t.id
   order by avg(case when qa.is_correct then 1.0 else 0 end);
$$;

-- Downloadable practice set (includes keys so it can be graded offline).
create or replace function public.offline_quiz_set(course_id uuid)
returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  c public.courses;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into c from public.courses where id = offline_quiz_set.course_id and is_published;
  if not found or not c.is_downloadable then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.is_premium and not public.is_premium(uid) then
    raise exception 'premium_required' using errcode = 'P0001', hint = 'premium_required';
  end if;
  return query
  select jsonb_build_object('question', public._question_json(q),
                            'correct_choice_ids', to_jsonb(k.correct_choice_ids),
                            'accepted_answers', to_jsonb(k.accepted_answers),
                            'explanation', k.explanation)
    from public.questions q join public.question_keys k on k.question_id = q.id
   where q.course_id = c.id and q.usage = 'practice' and public._can_access_question(q, uid)
   limit 300;
end $$;

-- ---------------------------------------------------------------------------
-- Daily challenge
-- ---------------------------------------------------------------------------

create or replace function public._ensure_daily_challenge(d date)
returns public.daily_challenges
language plpgsql security definer set search_path = public as $$
declare
  dc public.daily_challenges;
begin
  select * into dc from public.daily_challenges where day = d;
  if found then return dc; end if;
  -- Deterministic pick so every student gets the same question.
  insert into public.daily_challenges (day, question_id)
  select d, q.id from public.questions q
   where q.is_published and not q.is_premium and q.usage <> 'exam'
     and q.kind in ('multiple_choice', 'true_false')
   order by md5(q.id::text || d::text)
   limit 1
  on conflict (day) do nothing;
  select * into dc from public.daily_challenges where day = d;
  return dc;
end $$;

create or replace function public.daily_challenge(day date)
returns setof jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d date := public._safe_day(daily_challenge.day);
  dc public.daily_challenges;
  was_correct boolean;
  has_attempt boolean;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  dc := public._ensure_daily_challenge(d);
  if dc.question_id is null then return; end if;
  select qa.is_correct into was_correct from public.question_attempts qa
   where qa.user_id = uid and qa.question_id = dc.question_id and qa.context = 'daily'
     and qa.answered_at >= d::timestamptz - interval '1 day'
   order by qa.answered_at desc limit 1;
  has_attempt := found;
  return query
  select jsonb_build_object('day', d, 'question', public._question_json(q), 'xp_reward', dc.xp_reward,
                            'completed', has_attempt,
                            'was_correct', case when has_attempt then was_correct end)
    from public.questions q where q.id = dc.question_id;
end $$;

create or replace function public.submit_daily_challenge(day date, answer jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d date := public._safe_day(submit_daily_challenge.day);
  dc public.daily_challenges;
  correct boolean;
  xp int := 0;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  dc := public._ensure_daily_challenge(d);
  if dc.question_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.question_attempts qa
              where qa.user_id = uid and qa.question_id = dc.question_id and qa.context = 'daily'
                and qa.answered_at >= d::timestamptz - interval '1 day') then
    raise exception 'already_completed' using errcode = 'P0001';
  end if;
  correct := coalesce(public._grade(dc.question_id, submit_daily_challenge.answer), false);
  insert into public.question_attempts (user_id, question_id, topic_id, is_correct, context)
  select uid, q.id, q.topic_id, correct, 'daily' from public.questions q where q.id = dc.question_id;
  if correct then xp := dc.xp_reward; end if;
  perform public._touch_activity(uid, d, 0, 0, 1, xp);
  perform public._check_achievements(uid);
  return public._answer_result(dc.question_id, correct, xp);
end $$;

-- ---------------------------------------------------------------------------
-- Exams
-- ---------------------------------------------------------------------------

create or replace function public.start_exam(exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  e public.exams;
  attempt public.exam_attempts;
  ids uuid[];
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.exams where id = start_exam.exam_id and is_published;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.is_premium and not public.is_premium(uid) then
    raise exception 'premium_required' using errcode = 'P0001', hint = 'premium_required';
  end if;

  -- Resume an attempt that is still running.
  select * into attempt from public.exam_attempts a
   where a.user_id = uid and a.exam_id = e.id and a.submitted_at is null and a.deadline > now()
   order by a.started_at desc limit 1;

  if not found then
    select array_agg(question_id order by position) into ids from public.exam_questions eq where eq.exam_id = e.id;
    if ids is null then
      select array_agg(q.id) into ids from (
        select q.id from public.questions q
         where q.course_id = e.course_id and q.is_published and q.kind is not null
         order by random() limit e.question_count) q;
    end if;
    if ids is null or array_length(ids, 1) = 0 then raise exception 'exam_has_no_questions' using errcode = 'P0001'; end if;
    insert into public.exam_attempts (user_id, exam_id, question_ids, deadline)
    values (uid, e.id, ids, now() + make_interval(secs => e.time_limit_seconds))
    returning * into attempt;
  end if;

  return jsonb_build_object(
    'attempt_id', attempt.id, 'started_at', attempt.started_at, 'deadline', attempt.deadline,
    'questions', (select jsonb_agg(public._question_json(q) order by array_position(attempt.question_ids, q.id))
                    from public.questions q where q.id = any(attempt.question_ids)));
end $$;

create or replace function public.submit_exam(attempt_id uuid, answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  a public.exam_attempts;
  e public.exams;
  grace interval := interval '30 seconds';
  late boolean;
  graded jsonb;
  v_score int;
  v_total int;
  pct double precision;
  v_passed boolean;
  breakdown jsonb;
  recommended jsonb;
  xp int := 0;
  already_passed boolean;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into a from public.exam_attempts where id = submit_exam.attempt_id and user_id = uid for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.submitted_at is not null then raise exception 'already_submitted' using errcode = 'P0001'; end if;
  select * into e from public.exams where id = a.exam_id;
  late := now() > a.deadline + grace;
  already_passed := exists (select 1 from public.exam_attempts x where x.user_id = uid and x.exam_id = e.id and x.passed);

  -- Grade every question of the paper; answers submitted after the deadline are discarded.
  with paper as (
    select q.*, ord from unnest(a.question_ids) with ordinality as u(qid, ord) join public.questions q on q.id = u.qid
  ),
  submitted as (
    select (x ->> 'question_id')::uuid as qid, x as answer
      from jsonb_array_elements(case when late then '[]'::jsonb else coalesce(submit_exam.answers, '[]') end) x
  ),
  results as (
    select p.id, p.ord, p.prompt, p.choices, p.topic_id, s.answer,
           coalesce(public._grade(p.id, s.answer), false) as is_correct
      from paper p left join submitted s on s.qid = p.id
  )
  select jsonb_agg(jsonb_build_object(
           'question_id', r.id, 'prompt', r.prompt, 'is_correct', r.is_correct,
           'submitted', case when r.answer is null then null
                             else jsonb_build_object('choice_ids', coalesce(r.answer -> 'choice_ids', '[]'), 'text', coalesce(r.answer ->> 'text', '')) end,
           'correct_choice_ids', to_jsonb(k.correct_choice_ids), 'accepted_answer', k.accepted_answers[1],
           'explanation', k.explanation, 'choices', r.choices, 'topic_id', r.topic_id) order by r.ord),
         count(*) filter (where r.is_correct), count(*)
    into graded, v_score, v_total
    from results r left join public.question_keys k on k.question_id = r.id;

  pct := case when v_total > 0 then 100.0 * v_score / v_total else 0 end;
  v_passed := pct >= e.pass_percentage;

  select coalesce(jsonb_agg(jsonb_build_object('topic_id', t.id, 'topic_name', t.name, 'correct', g.correct, 'total', g.total)
                            order by g.correct::double precision / g.total), '[]')
    into breakdown
    from (select (x ->> 'topic_id')::uuid as topic_id,
                 count(*) filter (where (x ->> 'is_correct')::boolean) as correct, count(*) as total
            from jsonb_array_elements(graded) x where x ->> 'topic_id' is not null
           group by 1) g
    join public.topics t on t.id = g.topic_id;

  select coalesce(jsonb_agg(distinct jsonb_build_object('id', l.id, 'course_id', l.course_id, 'title', l.title, 'topic_name', t.name)), '[]')
    into recommended
    from jsonb_array_elements(graded) x
    join public.topics t on t.id = (x ->> 'topic_id')::uuid
    join public.lessons l on l.id = t.lesson_id
   where not (x ->> 'is_correct')::boolean;

  update public.exam_attempts x
     set submitted_at = now(), answers = submit_exam.answers, score = v_score, total = v_total,
         percentage = pct, passed = v_passed, topic_breakdown = breakdown
   where x.id = a.id;

  insert into public.question_attempts (user_id, question_id, topic_id, is_correct, context)
  select uid, (x ->> 'question_id')::uuid, (x ->> 'topic_id')::uuid, (x ->> 'is_correct')::boolean, 'exam'
    from jsonb_array_elements(graded) x;

  if v_passed and not already_passed then xp := 50; end if;
  perform public._touch_activity(uid, (now() at time zone 'utc')::date, 0, 0, v_total, xp);
  perform public._check_achievements(uid);

  return jsonb_build_object(
    'attempt_id', a.id, 'score', v_score, 'total', v_total, 'percentage', pct, 'passed', v_passed,
    'time_spent_seconds', extract(epoch from least(now(), a.deadline) - a.started_at)::int,
    'topic_breakdown', breakdown, 'recommended_lessons', recommended,
    'review', (select jsonb_agg(x - 'topic_id') from jsonb_array_elements(graded) x),
    'xp_awarded', xp);
end $$;

-- ---------------------------------------------------------------------------
-- Live quizzes (all timing from the database clock; scores computed server-side)
-- ---------------------------------------------------------------------------

create or replace function public.upcoming_live_quizzes(page_limit int default 10)
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'id', z.id, 'title', z.title, 'subject', z.subject, 'description', z.description,
           'starts_at', z.starts_at, 'question_seconds', z.question_seconds, 'reveal_seconds', z.reveal_seconds,
           'xp_prize', z.xp_prize,
           'question_count', (select count(*) from public.live_quiz_questions lq where lq.quiz_id = z.id),
           'player_count', (select count(*) from public.live_quiz_participants p where p.quiz_id = z.id),
           'is_joined', exists (select 1 from public.live_quiz_participants p where p.quiz_id = z.id and p.user_id = auth.uid()))
    from public.live_quizzes z
   where z.status = 'scheduled'
     and z.starts_at + make_interval(secs => (z.question_seconds + z.reveal_seconds)
           * (select count(*) from public.live_quiz_questions lq where lq.quiz_id = z.id)) > now()
   order by z.starts_at
   limit least(greatest(page_limit, 1), 50);
$$;

create or replace function public.join_live_quiz(quiz_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  z public.live_quizzes;
  p public.profiles;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into z from public.live_quizzes where id = join_live_quiz.quiz_id and status = 'scheduled';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if z.is_premium and not public.is_premium(uid) then
    raise exception 'premium_required' using errcode = 'P0001', hint = 'premium_required';
  end if;
  select * into p from public.profiles where id = uid;
  insert into public.live_quiz_participants (quiz_id, user_id, display_name, avatar_url)
  values (z.id, uid, p.display_name, p.avatar_url)
  on conflict (quiz_id, user_id) do nothing;
end $$;

-- Phase arithmetic shared by state and answer submission.
create or replace function public._live_phase(z public.live_quizzes, at timestamptz, out phase text, out "position" int, out phase_ends_at timestamptz, out question_count int)
language plpgsql stable security definer set search_path = public as $$
declare
  per double precision := z.question_seconds + z.reveal_seconds;
  elapsed double precision := extract(epoch from at - z.starts_at);
  within double precision;
begin
  select count(*) into question_count from public.live_quiz_questions lq where lq.quiz_id = z.id;
  if elapsed < 0 then
    phase := 'lobby'; position := 0; phase_ends_at := z.starts_at; return;
  end if;
  position := floor(elapsed / per)::int;
  if position >= question_count then
    phase := 'finished'; position := greatest(question_count - 1, 0); phase_ends_at := null; return;
  end if;
  within := elapsed - position * per;
  if within < z.question_seconds then
    phase := 'question';
    phase_ends_at := z.starts_at + make_interval(secs => position * per + z.question_seconds);
  else
    phase := 'reveal';
    phase_ends_at := z.starts_at + make_interval(secs => (position + 1) * per);
  end if;
end $$;

-- Awards prizes once, under a row lock, when the competition has ended.
create or replace function public._finalize_live_quiz(quiz_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  z public.live_quizzes;
  r record;
  prize int;
begin
  select * into z from public.live_quizzes where id = _finalize_live_quiz.quiz_id for update;
  if not found or z.status <> 'scheduled' then return; end if;
  if (public._live_phase(z, now())).phase <> 'finished' then return; end if;

  for r in
    select p.user_id, rank() over (order by p.score desc) as place
      from public.live_quiz_participants p where p.quiz_id = z.id
  loop
    prize := 10 + case r.place when 1 then z.xp_prize when 2 then (z.xp_prize * 6) / 10 when 3 then (z.xp_prize * 3) / 10 else 0 end;
    perform public._touch_activity(r.user_id, (now() at time zone 'utc')::date, 0, 0, 0, prize);
    if r.place <= 3 then
      insert into public.notifications (user_id, title, body, kind)
      values (r.user_id, 'Podium finish in ' || z.title, 'You placed #' || r.place || ' and earned ' || prize || ' XP.', 'live_podium');
    end if;
    perform public._check_achievements(r.user_id);
  end loop;
  update public.live_quizzes set status = 'finished' where id = z.id;
end $$;

create or replace function public.live_quiz_state(quiz_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  z public.live_quizzes;
  ph record;
  q public.questions;
  my_choice text;
  correct text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into z from public.live_quizzes where id = live_quiz_state.quiz_id and status <> 'cancelled';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.live_quiz_participants p where p.quiz_id = z.id and p.user_id = uid) then
    raise exception 'not_joined' using errcode = '42501';
  end if;

  ph := public._live_phase(z, now());
  if ph.phase = 'finished' then
    perform public._finalize_live_quiz(z.id);
  elsif ph.phase in ('question', 'reveal') then
    select qq.* into q from public.live_quiz_questions lq join public.questions qq on qq.id = lq.question_id
     where lq.quiz_id = z.id and lq.position = ph.position;
    select a.choice_id into my_choice from public.live_quiz_answers a
     where a.quiz_id = z.id and a.user_id = uid and a.position = ph.position;
    if ph.phase = 'reveal' then
      select k.correct_choice_ids[1] into correct from public.question_keys k where k.question_id = q.id;
    end if;
  end if;

  return jsonb_build_object(
    'phase', ph.phase, 'position', ph.position, 'question_count', ph.question_count,
    'server_time', now(), 'phase_ends_at', ph.phase_ends_at,
    'question', case when q.id is not null then public._question_json(q) end,
    'answered_choice_id', my_choice, 'correct_choice_id', correct);
end $$;

-- Validates timing and computes points from the server clock: 500 for correct + up to 500 for speed.
create or replace function public.submit_live_answer(quiz_id uuid, "position" int, choice_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  z public.live_quizzes;
  ph record;
  qid uuid;
  correct boolean;
  remaining double precision;
  points int := 0;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into z from public.live_quizzes where id = submit_live_answer.quiz_id and status = 'scheduled';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.live_quiz_participants p where p.quiz_id = z.id and p.user_id = uid) then
    raise exception 'not_joined' using errcode = '42501';
  end if;

  ph := public._live_phase(z, now());
  if ph.phase <> 'question' or ph.position <> submit_live_answer."position" then
    return jsonb_build_object('accepted', false, 'is_correct', null, 'points', 0);
  end if;

  select lq.question_id into qid from public.live_quiz_questions lq where lq.quiz_id = z.id and lq.position = ph.position;
  correct := coalesce(public._grade(qid, jsonb_build_object('choice_ids', jsonb_build_array(submit_live_answer.choice_id))), false);
  if correct then
    remaining := greatest(extract(epoch from ph.phase_ends_at - now()), 0);
    points := 500 + round(500 * remaining / z.question_seconds)::int;
  end if;

  insert into public.live_quiz_answers (quiz_id, user_id, position, choice_id, is_correct, points)
  values (z.id, uid, ph.position, submit_live_answer.choice_id, correct, points)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('accepted', false, 'is_correct', null, 'points', 0);
  end if;

  update public.live_quiz_participants p
     set score = p.score + points, correct_count = p.correct_count + case when correct then 1 else 0 end
   where p.quiz_id = z.id and p.user_id = uid;
  insert into public.question_attempts (user_id, question_id, topic_id, is_correct, context)
  select uid, q.id, q.topic_id, correct, 'live' from public.questions q where q.id = qid;

  return jsonb_build_object('accepted', true, 'is_correct', correct, 'points', points);
end $$;
