-- Helpers, triggers and Row Level Security.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_premium(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select p.is_premium from public.profiles p where p.id = uid), false);
$$;

-- Must match AnswerNormalizer in the iOS app.
create or replace function public.normalize_answer(t text)
returns text
language sql immutable
as $$
  select btrim(regexp_replace(lower(coalesce(t, '')), '[^[:alnum:]./-]+', ' ', 'g'));
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- New auth user -> profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'Student'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Students may edit their own profile, but never XP, streaks or entitlement.
-- Definer functions run as the table owner, so `current_user` distinguishes direct client writes.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.xp               := old.xp;
    new.current_streak   := old.current_streak;
    new.longest_streak   := old.longest_streak;
    new.last_active_date := old.last_active_date;
    new.is_premium       := old.is_premium;
    new.id               := old.id;
    new.created_at       := old.created_at;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Keep denormalised counts in sync.
create or replace function public.refresh_course_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid uuid := coalesce(new.course_id, old.course_id);
begin
  update public.courses c
     set lesson_count = (select count(*) from public.lessons l where l.course_id = cid),
         estimated_minutes = greatest(c.estimated_minutes,
           (select coalesce(sum(l.duration_seconds), 0) / 60 from public.lessons l where l.course_id = cid))
   where c.id = cid;
  return null;
end $$;

create trigger lessons_counts after insert or update or delete on public.lessons
  for each row execute function public.refresh_course_counts();

create or replace function public.refresh_ebook_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  eid uuid := coalesce(new.ebook_id, old.ebook_id);
begin
  update public.ebooks e
     set chapter_count = (select count(*) from public.ebook_chapters c where c.ebook_id = eid)
   where e.id = eid;
  return null;
end $$;

create trigger ebook_chapters_counts after insert or delete on public.ebook_chapters
  for each row execute function public.refresh_ebook_counts();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.categories            enable row level security;
alter table public.achievements          enable row level security;
alter table public.instructors           enable row level security;
alter table public.courses               enable row level security;
alter table public.modules               enable row level security;
alter table public.lessons               enable row level security;
alter table public.lesson_contents       enable row level security;
alter table public.lesson_attachments    enable row level security;
alter table public.course_resources      enable row level security;
alter table public.profiles              enable row level security;
alter table public.enrollments           enable row level security;
alter table public.lesson_progress       enable row level security;
alter table public.daily_activity        enable row level security;
alter table public.bookmarks             enable row level security;
alter table public.user_achievements     enable row level security;
alter table public.notifications         enable row level security;
alter table public.device_tokens         enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.topics                enable row level security;
alter table public.questions             enable row level security;
alter table public.question_keys         enable row level security;
alter table public.question_attempts     enable row level security;
alter table public.daily_challenges      enable row level security;
alter table public.exams                 enable row level security;
alter table public.exam_questions        enable row level security;
alter table public.exam_attempts         enable row level security;
alter table public.live_quizzes          enable row level security;
alter table public.live_quiz_questions   enable row level security;
alter table public.live_quiz_participants enable row level security;
alter table public.live_quiz_answers     enable row level security;
alter table public.ebooks                enable row level security;
alter table public.ebook_chapters        enable row level security;
alter table public.ebook_progress        enable row level security;
alter table public.ebook_bookmarks       enable row level security;
alter table public.flashcard_decks       enable row level security;
alter table public.flashcards            enable row level security;
alter table public.flashcard_reviews     enable row level security;
alter table public.tutor_conversations   enable row level security;
alter table public.tutor_messages        enable row level security;

-- Public catalog (outline is browsable before sign-in).
create policy "catalog read" on public.categories   for select using (true);
create policy "catalog read" on public.achievements for select using (true);
create policy "catalog read" on public.instructors  for select using (true);
create policy "catalog read" on public.courses      for select using (is_published);
create policy "catalog read" on public.modules      for select
  using (exists (select 1 from public.courses c where c.id = course_id and c.is_published));
create policy "catalog read" on public.lessons      for select
  using (exists (select 1 from public.courses c where c.id = course_id and c.is_published));
create policy "catalog read" on public.lesson_attachments for select
  using (exists (select 1 from public.lessons l join public.courses c on c.id = l.course_id
                 where l.id = lesson_id and c.is_published));
create policy "catalog read" on public.course_resources for select
  using (exists (select 1 from public.courses c where c.id = course_id and c.is_published));
create policy "catalog read" on public.topics       for select using (true);
create policy "catalog read" on public.exams        for select using (is_published);
create policy "catalog read" on public.live_quizzes for select using (status <> 'cancelled');
create policy "catalog read" on public.ebooks       for select using (is_published);

-- Premium-gated bodies.
create policy "entitled read" on public.lesson_contents for select to authenticated
  using (exists (
    select 1 from public.lessons l join public.courses c on c.id = l.course_id
     where l.id = lesson_id and c.is_published
       and ((not l.is_premium and not c.is_premium) or public.is_premium())
  ));
create policy "entitled read" on public.ebook_chapters for select to authenticated
  using (exists (
    select 1 from public.ebooks e
     where e.id = ebook_id and e.is_published and (not e.is_premium or public.is_premium())
  ));

-- Questions, keys, exam papers and live quiz papers are only served through definer functions.
-- (RLS enabled with no policies = no direct access.)

-- Own rows.
create policy "own profile read"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "own rows" on public.enrollments       for select to authenticated using (user_id = auth.uid());
create policy "own rows" on public.lesson_progress   for select to authenticated using (user_id = auth.uid());
create policy "own rows" on public.daily_activity    for select to authenticated using (user_id = auth.uid());
create policy "own rows" on public.bookmarks         for select to authenticated using (user_id = auth.uid());
create policy "own rows" on public.user_achievements for select to authenticated using (user_id = auth.uid());
create policy "own rows" on public.question_attempts for select to authenticated using (user_id = auth.uid());
create policy "own rows" on public.exam_attempts     for select to authenticated using (user_id = auth.uid());
create policy "own rows" on public.live_quiz_answers for select to authenticated using (user_id = auth.uid());
create policy "own rows" on public.ebook_progress    for select to authenticated using (user_id = auth.uid());
create policy "own rows" on public.flashcard_reviews for select to authenticated using (user_id = auth.uid());
create policy "own rows" on public.subscriptions     for select to authenticated using (user_id = auth.uid());

create policy "own notifications read"   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own notifications update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own devices" on public.device_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own ebook bookmarks" on public.ebook_bookmarks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own conversations read"   on public.tutor_conversations for select to authenticated using (user_id = auth.uid());
create policy "own conversations delete" on public.tutor_conversations for delete to authenticated using (user_id = auth.uid());
create policy "own messages read"        on public.tutor_messages      for select to authenticated using (user_id = auth.uid());

-- Leaderboards are public to signed-in students (names are denormalised display names only).
create policy "leaderboard read" on public.live_quiz_participants for select to authenticated using (true);

-- Flashcards: official decks for everyone, personal decks for their owner.
create policy "deck read" on public.flashcard_decks for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
create policy "deck delete" on public.flashcard_decks for delete to authenticated
  using (owner_id = auth.uid());
create policy "card read" on public.flashcards for select to authenticated
  using (exists (select 1 from public.flashcard_decks d where d.id = deck_id and (d.owner_id is null or d.owner_id = auth.uid())));

-- Column-level hardening for tables with update policies.
revoke update on public.profiles from authenticated, anon;
grant update (display_name, avatar_url, interests, level, goal, daily_goal_minutes, onboarding_completed, notifications_enabled)
  on public.profiles to authenticated;
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;
