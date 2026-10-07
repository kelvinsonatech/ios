-- Storage, realtime, function privileges and reference data.

-- ---------------------------------------------------------------------------
-- Function privileges: internal helpers (prefixed `_`) must never be callable over the API,
-- otherwise a client could, for example, award itself XP.
-- ---------------------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like '\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Trigger functions are not meant to be called directly either.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_profile_columns() from public, anon, authenticated;
revoke all on function public.refresh_course_counts() from public, anon, authenticated;
revoke all on function public.refresh_ebook_counts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('lesson-media', 'lesson-media', false),
       ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

-- Whether the current user may read an object in `lesson-media`.
create or replace function public.can_access_media(object_path text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select bool_or(not gated or public.is_premium())
      from (
        select (l.is_premium or c.is_premium) as gated
          from public.lessons l join public.courses c on c.id = l.course_id
         where c.is_published and (l.video_path = object_path or l.captions_path = object_path)
        union all
        select (l.is_premium or c.is_premium)
          from public.lesson_attachments a join public.lessons l on l.id = a.lesson_id join public.courses c on c.id = l.course_id
         where c.is_published and a.file_path = object_path
        union all
        select c.is_premium
          from public.course_resources r join public.courses c on c.id = r.course_id
         where c.is_published and r.file_path = object_path
      ) refs
  ), false);
$$;

-- HLS playlists reference segments next to them: grant access to files under an entitled video's folder.
create or replace function public.can_access_media_path(object_path text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_access_media(object_path)
      or exists (
        select 1 from public.lessons l join public.courses c on c.id = l.course_id
         where c.is_published and l.video_path like '%.m3u8'
           and object_path like regexp_replace(l.video_path, '[^/]+$', '') || '%'
           and (not (l.is_premium or c.is_premium) or public.is_premium()));
$$;

create policy "entitled media read" on storage.objects for select to authenticated
  using (bucket_id = 'lesson-media' and public.can_access_media_path(name));

-- ---------------------------------------------------------------------------
-- Realtime: live leaderboards
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.live_quiz_participants;

-- ---------------------------------------------------------------------------
-- Reference data (configuration, not content)
-- ---------------------------------------------------------------------------

insert into public.categories (id, name, symbol, sort_order) values
  ('mathematics',      'Mathematics',      'function',                        1),
  ('science',          'Science',          'atom',                            2),
  ('computer-science', 'Computer Science', 'cpu',                             3),
  ('english',          'English',          'text.book.closed',                4),
  ('data-science',     'Data Science',     'chart.bar.xaxis',                 5),
  ('business',         'Business',         'briefcase',                       6),
  ('programming',      'Programming',      'chevron.left.forwardslash.chevron.right', 7),
  ('languages',        'Languages',        'globe',                           8)
on conflict (id) do update set name = excluded.name, symbol = excluded.symbol, sort_order = excluded.sort_order;

insert into public.achievements (id, title, description, symbol, xp_reward, criteria, sort_order) values
  ('first-lesson',   'First Steps',       'Complete your first lesson.',            'figure.walk',          10,  '{"type":"lessons_completed","count":1}',   1),
  ('lessons-10',     'Steady Learner',    'Complete 10 lessons.',                   'books.vertical',       50,  '{"type":"lessons_completed","count":10}',  2),
  ('lessons-50',     'Scholar',           'Complete 50 lessons.',                   'graduationcap',        200, '{"type":"lessons_completed","count":50}',  3),
  ('course-1',       'Finisher',          'Complete an entire course.',             'flag.checkered',       100, '{"type":"courses_completed","count":1}',   4),
  ('streak-3',       'On a Roll',         'Learn 3 days in a row.',                 'flame',                30,  '{"type":"streak","count":3}',              5),
  ('streak-7',       'Week Warrior',      'Learn 7 days in a row.',                 'flame.fill',           75,  '{"type":"streak","count":7}',              6),
  ('streak-30',      'Unstoppable',       'Learn 30 days in a row.',                'bolt.heart',           300, '{"type":"streak","count":30}',             7),
  ('questions-100',  'Problem Solver',    'Answer 100 questions correctly.',        'checkmark.seal',       100, '{"type":"questions_correct","count":100}', 8),
  ('exam-pass',      'Exam Ready',        'Pass your first exam.',                  'rosette',              75,  '{"type":"exams_passed","count":1}',        9),
  ('live-podium',    'Podium Finish',     'Finish top 3 in a live quiz.',           'trophy',               100, '{"type":"live_podium","count":1}',         10),
  ('xp-1000',        'Rising Star',       'Earn 1,000 XP.',                         'star.circle',          0,   '{"type":"xp","count":1000}',               11)
on conflict (id) do update set title = excluded.title, description = excluded.description, symbol = excluded.symbol,
  xp_reward = excluded.xp_reward, criteria = excluded.criteria, sort_order = excluded.sort_order;
