-- Learning RPCs: catalog search, recommendations, progress, XP, streaks, achievements,
-- bookmarks, statistics, e-books and flashcards.
-- All client-callable functions are SECURITY DEFINER, derive the user from auth.uid()
-- and never accept user ids, XP amounts or scores from the client.

-- ---------------------------------------------------------------------------
-- Internal: XP, activity, streaks, achievements
-- ---------------------------------------------------------------------------

-- Clamp a client-supplied local calendar day to a plausible window around server time.
create or replace function public._safe_day(d date)
returns date language sql stable as $$
  select case when d between (now() at time zone 'utc')::date - 1 and (now() at time zone 'utc')::date + 1
              then d else (now() at time zone 'utc')::date end;
$$;

create or replace function public._touch_activity(
  uid uuid, d date, minutes int default 0, lessons int default 0, questions int default 0, xp int default 0
) returns void
language plpgsql security definer set search_path = public as $$
declare
  last_day date;
begin
  insert into public.daily_activity as a (user_id, day, minutes_studied, lessons_completed, questions_answered, xp_earned)
  values (uid, d, minutes, lessons, questions, xp)
  on conflict (user_id, day) do update
    set minutes_studied    = a.minutes_studied + excluded.minutes_studied,
        lessons_completed  = a.lessons_completed + excluded.lessons_completed,
        questions_answered = a.questions_answered + excluded.questions_answered,
        xp_earned          = a.xp_earned + excluded.xp_earned;

  select p.last_active_date into last_day from public.profiles p where p.id = uid for update;
  update public.profiles p
     set xp = p.xp + _touch_activity.xp,
         current_streak = case
           when last_day = d then p.current_streak
           when last_day = d - 1 then p.current_streak + 1
           when last_day > d then p.current_streak
           else 1 end,
         last_active_date = greatest(coalesce(last_day, d), d)
   where p.id = uid;
  update public.profiles p set longest_streak = greatest(p.longest_streak, p.current_streak) where p.id = uid;
end $$;

-- Awards any newly satisfied achievements and returns their ids.
create or replace function public._check_achievements(uid uuid)
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  a record;
  value int;
  awarded text[] := '{}';
begin
  for a in
    select * from public.achievements ach
     where not exists (select 1 from public.user_achievements ua where ua.user_id = uid and ua.achievement_id = ach.id)
  loop
    value := case a.criteria ->> 'type'
      when 'lessons_completed' then (select count(*) from public.lesson_progress lp where lp.user_id = uid and lp.completed_at is not null)
      when 'courses_completed' then (select count(*) from public.enrollments e where e.user_id = uid and e.completed_at is not null)
      when 'streak'            then (select p.longest_streak from public.profiles p where p.id = uid)
      when 'xp'                then (select p.xp from public.profiles p where p.id = uid)
      when 'questions_correct' then (select count(*) from public.question_attempts qa where qa.user_id = uid and qa.is_correct)
      when 'exams_passed'      then (select count(distinct ea.exam_id) from public.exam_attempts ea where ea.user_id = uid and ea.passed)
      when 'live_podium'       then (select count(*) from public.notifications n where n.user_id = uid and n.kind = 'live_podium')
      else 0 end;
    if value >= (a.criteria ->> 'count')::int then
      insert into public.user_achievements (user_id, achievement_id) values (uid, a.id) on conflict do nothing;
      update public.profiles p set xp = p.xp + a.xp_reward where p.id = uid;
      insert into public.notifications (user_id, title, body, kind)
      values (uid, 'Achievement unlocked: ' || a.title, a.description, 'achievement');
      awarded := awarded || a.id;
    end if;
  end loop;
  return awarded;
end $$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create or replace function public._course_json(c public.courses)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(c) || jsonb_build_object('instructor', (select to_jsonb(i) from public.instructors i where i.id = c.instructor_id));
$$;

create or replace function public.search_courses(
  q text default null,
  category_id text default null,
  level text default null,
  free_only boolean default false,
  downloadable_only boolean default false,
  sort text default 'relevance',
  page_limit int default 30,
  page_offset int default 0
) returns setof jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  pattern text := '%' || coalesce(search_courses.q, '') || '%';
begin
  return query
  select public._course_json(c)
    from public.courses c
    left join public.instructors i on i.id = c.instructor_id
   where c.is_published
     and (search_courses.category_id is null or c.category_id = search_courses.category_id)
     and (search_courses.level is null or c.level = search_courses.level)
     and (not search_courses.free_only or not c.is_premium)
     and (not search_courses.downloadable_only or c.is_downloadable)
     and (search_courses.q is null
          or c.title ilike pattern
          or c.subtitle ilike pattern
          or c.description ilike pattern
          or i.name ilike pattern
          or exists (select 1 from unnest(c.tags) t where t ilike pattern)
          or exists (select 1 from public.categories cat where cat.id = c.category_id and cat.name ilike pattern)
          or exists (select 1 from public.topics tp where tp.course_id = c.id and tp.name ilike pattern))
   order by
     case when search_courses.sort = 'relevance' and search_courses.q is not null
          then similarity(c.title, search_courses.q) end desc nulls last,
     case search_courses.sort
       when 'popular' then c.student_count::double precision
       when 'rating'  then coalesce(c.rating, 0)::double precision
       when 'newest'  then extract(epoch from coalesce(c.published_at, c.created_at))
       when 'shortest' then -c.estimated_minutes::double precision
       else c.student_count::double precision end desc,
     c.title
   limit least(greatest(search_courses.page_limit, 1), 100)
  offset greatest(search_courses.page_offset, 0);
end $$;

-- Personalised by interests, level, weak topics and popularity; excludes enrolled courses.
create or replace function public.recommended_courses(page_limit int default 10)
returns setof jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select coalesce(p.interests, '{}') as interests, p.level
      from public.profiles p where p.id = auth.uid()
  ),
  weak as (
    select distinct t.course_id
      from public.question_attempts qa join public.topics t on t.id = qa.topic_id
     where qa.user_id = auth.uid()
     group by t.course_id, qa.topic_id
    having count(*) >= 3 and avg(case when qa.is_correct then 1.0 else 0 end) < 0.6
  )
  select public._course_json(c)
    from public.courses c
    left join me on true
   where c.is_published
     and not exists (select 1 from public.enrollments e where e.user_id = auth.uid() and e.course_id = c.id)
   order by
     (case when c.category_id = any(coalesce(me.interests, '{}')) then 3 else 0 end
      + case when me.level is not null and c.level = me.level then 2 else 0 end
      + case when c.id in (select course_id from weak) then 2 else 0 end
      + ln(1 + c.student_count) / 4
      + coalesce(c.rating, 0) / 5) desc,
     c.created_at desc
   limit least(greatest(page_limit, 1), 30);
$$;

create or replace function public.enroll_course(course_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  c public.courses;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into c from public.courses where id = enroll_course.course_id and is_published;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.is_premium and not public.is_premium(uid) then
    raise exception 'premium_required' using errcode = 'P0001', hint = 'premium_required';
  end if;
  insert into public.enrollments (user_id, course_id) values (uid, c.id) on conflict do nothing;
  if found then update public.courses set student_count = student_count + 1 where id = c.id; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Progress
-- ---------------------------------------------------------------------------

create or replace function public.record_lesson_progress(
  lesson_id uuid, "position" double precision, seconds_watched int default 0,
  completed boolean default false, client_updated_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  l public.lessons;
  c public.courses;
  was_completed boolean;
  newly_completed boolean := false;
  total int;
  done int;
  course_progress double precision;
  xp int := 0;
  new_achievements text[] := '{}';
  today date := (now() at time zone 'utc')::date;
  streak int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into l from public.lessons where id = record_lesson_progress.lesson_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into c from public.courses where id = l.course_id;
  if (l.is_premium or c.is_premium) and not public.is_premium(uid) then
    raise exception 'premium_required' using errcode = 'P0001', hint = 'premium_required';
  end if;

  select lp.completed_at is not null into was_completed
    from public.lesson_progress lp where lp.user_id = uid and lp.lesson_id = l.id;
  was_completed := coalesce(was_completed, false);

  insert into public.lesson_progress as lp (user_id, lesson_id, course_id, playback_position, seconds_watched, completed_at, updated_at)
  values (uid, l.id, l.course_id, greatest(record_lesson_progress."position", 0),
          greatest(least(record_lesson_progress.seconds_watched, 3600), 0),
          case when record_lesson_progress.completed then now() end,
          least(record_lesson_progress.client_updated_at, now()))
  on conflict (user_id, lesson_id) do update
    set playback_position = case when excluded.updated_at >= lp.updated_at then excluded.playback_position else lp.playback_position end,
        seconds_watched   = lp.seconds_watched + excluded.seconds_watched,
        completed_at      = coalesce(lp.completed_at, excluded.completed_at),
        updated_at        = greatest(lp.updated_at, excluded.updated_at);

  newly_completed := record_lesson_progress.completed and not was_completed;

  -- Auto-enrol on first activity.
  insert into public.enrollments (user_id, course_id) values (uid, l.course_id) on conflict do nothing;
  if found then update public.courses set student_count = student_count + 1 where id = l.course_id; end if;

  select count(*) into total from public.lessons where course_id = l.course_id;
  select count(*) into done from public.lesson_progress
   where user_id = uid and course_id = l.course_id and completed_at is not null;
  course_progress := case when total > 0 then done::double precision / total else 0 end;

  update public.enrollments e
     set last_lesson_id = l.id,
         last_activity_at = now(),
         progress = course_progress,
         completed_at = case when course_progress >= 1 then coalesce(e.completed_at, now()) else e.completed_at end
   where e.user_id = uid and e.course_id = l.course_id;

  if newly_completed then
    xp := 20 + case when course_progress >= 1 then 100 else 0 end;
    perform public._touch_activity(uid, today, 0, 1, 0, xp);
    new_achievements := public._check_achievements(uid);
  end if;

  select current_streak into streak from public.profiles where id = uid;
  return jsonb_build_object('xp_awarded', xp, 'new_achievements', to_jsonb(new_achievements),
                            'current_streak', coalesce(streak, 0), 'course_progress', course_progress);
end $$;

create or replace function public.log_study_minutes(minutes int, day date, source text default 'app')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if log_study_minutes.minutes <= 0 then return; end if;
  perform public._touch_activity(auth.uid(), public._safe_day(log_study_minutes.day), least(log_study_minutes.minutes, 240));
end $$;

create or replace function public.daily_stats(day date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'day', public._safe_day(daily_stats.day),
    'minutes_studied', coalesce(a.minutes_studied, 0),
    'lessons_completed', coalesce(a.lessons_completed, 0),
    'questions_answered', coalesce(a.questions_answered, 0),
    'xp_earned', coalesce(a.xp_earned, 0),
    'current_streak', case when p.last_active_date >= public._safe_day(daily_stats.day) - 1 then p.current_streak else 0 end,
    'daily_goal_minutes', p.daily_goal_minutes)
  from public.profiles p
  left join public.daily_activity a on a.user_id = p.id and a.day = public._safe_day(daily_stats.day)
  where p.id = auth.uid();
$$;

create or replace function public.activity_history(days int, today date)
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('day', d::date, 'minutes_studied', coalesce(a.minutes_studied, 0), 'xp_earned', coalesce(a.xp_earned, 0))
    from generate_series(public._safe_day(today) - (least(greatest(days, 1), 90) - 1), public._safe_day(today), interval '1 day') d
    left join public.daily_activity a on a.user_id = auth.uid() and a.day = d::date
   order by d;
$$;

create or replace function public.my_achievements()
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(a) - 'criteria' - 'sort_order' || jsonb_build_object('earned_at', ua.earned_at)
    from public.achievements a
    left join public.user_achievements ua on ua.achievement_id = a.id and ua.user_id = auth.uid()
   order by (ua.earned_at is null), a.sort_order;
$$;

-- ---------------------------------------------------------------------------
-- Bookmarks
-- ---------------------------------------------------------------------------

create or replace function public.toggle_bookmark(item_type text, item_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if toggle_bookmark.item_type not in ('lesson','question','ebook','course') then
    raise exception 'invalid_item_type' using errcode = '22023';
  end if;
  delete from public.bookmarks b
   where b.user_id = uid and b.item_type = toggle_bookmark.item_type and b.item_id = toggle_bookmark.item_id;
  if found then return false; end if;
  insert into public.bookmarks (user_id, item_type, item_id) values (uid, toggle_bookmark.item_type, toggle_bookmark.item_id);
  return true;
end $$;

create or replace function public.my_bookmarks()
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'item_type', b.item_type, 'item_id', b.item_id, 'created_at', b.created_at,
           'parent_id', case b.item_type when 'lesson' then (select l.course_id from public.lessons l where l.id = b.item_id) end,
           'title', coalesce(
              case b.item_type
                when 'lesson'   then (select l.title from public.lessons l where l.id = b.item_id)
                when 'course'   then (select c.title from public.courses c where c.id = b.item_id)
                when 'ebook'    then (select e.title from public.ebooks e where e.id = b.item_id)
                when 'question' then (select left(q.prompt, 140) from public.questions q where q.id = b.item_id)
              end, 'Removed item'),
           'subtitle', case b.item_type
                when 'lesson'   then (select c.title from public.lessons l join public.courses c on c.id = l.course_id where l.id = b.item_id)
                when 'ebook'    then (select e.author from public.ebooks e where e.id = b.item_id)
                when 'question' then (select t.name from public.questions q join public.topics t on t.id = q.topic_id where q.id = b.item_id)
              end)
    from public.bookmarks b
   where b.user_id = auth.uid()
   order by b.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- E-books
-- ---------------------------------------------------------------------------

create or replace function public.record_ebook_progress(
  ebook_id uuid, chapter_position int, scroll_fraction double precision, percent double precision,
  client_updated_at timestamptz default now()
) returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.ebooks e where e.id = record_ebook_progress.ebook_id and e.is_published) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.ebook_progress as ep (user_id, ebook_id, chapter_position, scroll_fraction, percent, updated_at)
  values (uid, record_ebook_progress.ebook_id, greatest(record_ebook_progress.chapter_position, 0),
          least(greatest(record_ebook_progress.scroll_fraction, 0), 1),
          least(greatest(record_ebook_progress.percent, 0), 1),
          least(record_ebook_progress.client_updated_at, now()))
  on conflict (user_id, ebook_id) do update
    set chapter_position = excluded.chapter_position,
        scroll_fraction  = excluded.scroll_fraction,
        percent          = excluded.percent,
        updated_at       = excluded.updated_at
    where excluded.updated_at >= ep.updated_at;
end $$;

create or replace function public.recommended_ebooks()
returns setof public.ebooks
language sql stable security definer set search_path = public as $$
  select e.* from public.ebooks e
   where e.is_published
     and not exists (select 1 from public.ebook_progress ep where ep.user_id = auth.uid() and ep.ebook_id = e.id)
   order by (e.category_id = any(coalesce((select p.interests from public.profiles p where p.id = auth.uid()), '{}'))) desc,
            e.created_at desc
   limit 12;
$$;

-- ---------------------------------------------------------------------------
-- Flashcards (SM-2; mirrors SpacedRepetition in the app)
-- ---------------------------------------------------------------------------

create or replace function public.my_flashcard_decks()
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'id', d.id, 'owner_id', d.owner_id, 'course_id', d.course_id, 'title', d.title, 'description', d.description,
           'card_count', (select count(*) from public.flashcards f where f.deck_id = d.id),
           'due_count', (select count(*) from public.flashcards f
                          left join public.flashcard_reviews r on r.card_id = f.id and r.user_id = auth.uid()
                         where f.deck_id = d.id and coalesce(r.due_at, '-infinity') <= now()))
    from public.flashcard_decks d
   where d.owner_id = auth.uid()
      or (d.owner_id is null and (d.course_id is null
          or exists (select 1 from public.enrollments e where e.user_id = auth.uid() and e.course_id = d.course_id)))
   order by d.owner_id is null, d.created_at desc;
$$;

create or replace function public.deck_cards(deck_id uuid)
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'deck_id', f.deck_id, 'front', f.front, 'back', f.back, 'position', f.position,
                            'due_at', r.due_at, 'interval_days', r.interval_days, 'ease', r.ease, 'repetitions', r.repetitions)
    from public.flashcards f
    join public.flashcard_decks d on d.id = f.deck_id
    left join public.flashcard_reviews r on r.card_id = f.id and r.user_id = auth.uid()
   where f.deck_id = deck_cards.deck_id and (d.owner_id is null or d.owner_id = auth.uid())
   order by coalesce(r.due_at, '-infinity'), f.position;
$$;

create or replace function public.create_flashcard_deck(title text, description text default null, course_id uuid default null, cards jsonb default '[]')
returns uuid
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_array_length(create_flashcard_deck.cards) > 500 then raise exception 'too_many_cards' using errcode = '22023'; end if;
  if (select count(*) from public.flashcard_decks d where d.owner_id = uid) >= 200 then
    raise exception 'deck_limit_reached' using errcode = '22023';
  end if;
  insert into public.flashcard_decks (owner_id, course_id, title, description)
  values (uid, create_flashcard_deck.course_id, left(btrim(create_flashcard_deck.title), 120), create_flashcard_deck.description)
  returning id into new_id;
  insert into public.flashcards (deck_id, front, back, position)
  select new_id, left(btrim(c ->> 'front'), 1000), left(btrim(c ->> 'back'), 2000), ord::int
    from jsonb_array_elements(create_flashcard_deck.cards) with ordinality as x(c, ord)
   where btrim(coalesce(c ->> 'front', '')) <> '' and btrim(coalesce(c ->> 'back', '')) <> '';
  return new_id;
end $$;

create or replace function public.review_flashcard(card_id uuid, grade int, reviewed_at timestamptz default now())
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  r public.flashcard_reviews;
  q double precision := least(greatest(review_flashcard.grade, 0), 5);
  ease double precision;
  reps int;
  interval_days double precision;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.flashcards f join public.flashcard_decks d on d.id = f.deck_id
                  where f.id = review_flashcard.card_id and (d.owner_id is null or d.owner_id = uid)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into r from public.flashcard_reviews fr where fr.user_id = uid and fr.card_id = review_flashcard.card_id;
  ease := coalesce(r.ease, 2.5);
  reps := coalesce(r.repetitions, 0);
  interval_days := coalesce(r.interval_days, 0);

  if q < 3 then
    reps := 0;
    interval_days := 10.0 / (24 * 60);
  else
    reps := reps + 1;
    interval_days := case
      when reps = 1 then 1
      when reps = 2 then case when q = 3 then 3 else 6 end
      else round(interval_days * ease * case when q = 3 then 0.8 else 1 end * case when q = 5 then 1.3 else 1 end)
    end;
  end if;
  ease := greatest(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  insert into public.flashcard_reviews as fr (user_id, card_id, ease, interval_days, repetitions, due_at, last_reviewed_at)
  values (uid, review_flashcard.card_id, ease, interval_days, reps,
          least(review_flashcard.reviewed_at, now()) + make_interval(secs => interval_days * 86400), least(review_flashcard.reviewed_at, now()))
  on conflict (user_id, card_id) do update
    set ease = excluded.ease, interval_days = excluded.interval_days, repetitions = excluded.repetitions,
        due_at = excluded.due_at, last_reviewed_at = excluded.last_reviewed_at;
end $$;
