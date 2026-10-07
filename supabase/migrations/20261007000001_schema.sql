-- Lumen core schema.
-- Content tables are managed by administrators (service role / dashboard).
-- Student-owned tables are written through security-definer RPCs in later migrations.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table public.categories (
  id          text primary key,
  name        text not null,
  symbol      text not null default 'book',
  sort_order  int  not null default 0
);

create table public.achievements (
  id          text primary key,
  title       text not null,
  description text not null,
  symbol      text not null,
  xp_reward   int  not null default 0,
  -- {"type": "lessons_completed" | "streak" | "xp" | "questions_correct" | "exams_passed" | "live_podium" | "courses_completed", "count": n}
  criteria    jsonb not null,
  sort_order  int not null default 0
);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.instructors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  title       text,
  bio         text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table public.courses (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  subtitle          text,
  description       text not null default '',
  category_id       text not null references public.categories(id),
  instructor_id     uuid references public.instructors(id) on delete set null,
  level             text not null default 'beginner' check (level in ('beginner','intermediate','advanced')),
  thumbnail_url     text,
  cover_url         text,
  is_premium        boolean not null default false,
  is_downloadable   boolean not null default false,
  estimated_minutes int not null default 0,
  lesson_count      int not null default 0,
  rating            numeric(3,2),
  rating_count      int not null default 0,
  student_count     int not null default 0,
  tags              text[] not null default '{}',
  is_published      boolean not null default false,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index courses_category_idx on public.courses (category_id) where is_published;
create index courses_title_trgm_idx on public.courses using gin (title extensions.gin_trgm_ops);

create table public.modules (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  title      text not null,
  position   int  not null,
  unique (course_id, position)
);

create table public.lessons (
  id                uuid primary key default gen_random_uuid(),
  module_id         uuid not null references public.modules(id) on delete cascade,
  course_id         uuid not null references public.courses(id) on delete cascade,
  title             text not null,
  summary           text,
  position          int  not null,
  duration_seconds  int  not null default 0,
  -- Object path inside the private `lesson-media` bucket (HLS or MP4; captions as HLS subtitle tracks).
  video_path        text,
  captions_path     text,
  is_premium        boolean not null default false,
  is_downloadable   boolean not null default false,
  has_practice      boolean not null default false,
  created_at        timestamptz not null default now()
);
create index lessons_course_idx on public.lessons (course_id, position);
create index lessons_module_idx on public.lessons (module_id, position);

-- Lesson body is separate so RLS can hide premium content while the outline stays visible.
create table public.lesson_contents (
  lesson_id       uuid primary key references public.lessons(id) on delete cascade,
  notes_markdown  text not null default '',
  key_terms       jsonb not null default '[]',   -- [{term, definition}]
  examples        jsonb not null default '[]',   -- [{title, body}]
  image_urls      text[] not null default '{}'
);

create table public.lesson_attachments (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.lessons(id) on delete cascade,
  title      text not null,
  file_path  text not null,
  mime_type  text not null default 'application/pdf',
  byte_size  bigint not null default 0
);

create table public.course_resources (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  title      text not null,
  kind       text not null default 'file' check (kind in ('file','link')),
  file_path  text,
  url        text
);

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  display_name           text not null default 'Student',
  avatar_url             text,
  interests              text[] not null default '{}',
  level                  text check (level in ('beginner','intermediate','advanced')),
  goal                   text check (goal in ('pass_exams','understand_topics','learn_skill','prepare_university','improve_grades','own_pace')),
  daily_goal_minutes     int not null default 15 check (daily_goal_minutes between 5 and 180),
  onboarding_completed   boolean not null default false,
  notifications_enabled  boolean not null default false,
  -- Server-owned (protected by trigger):
  xp                     int not null default 0,
  current_streak         int not null default 0,
  longest_streak         int not null default 0,
  last_active_date       date,
  is_premium             boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.enrollments (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  course_id         uuid not null references public.courses(id) on delete cascade,
  enrolled_at       timestamptz not null default now(),
  last_lesson_id    uuid,
  progress          double precision not null default 0,
  completed_at      timestamptz,
  last_activity_at  timestamptz not null default now(),
  primary key (user_id, course_id),
  constraint enrollments_last_lesson_id_fkey foreign key (last_lesson_id) references public.lessons(id) on delete set null
);

create table public.lesson_progress (
  user_id            uuid not null references public.profiles(id) on delete cascade,
  lesson_id          uuid not null references public.lessons(id) on delete cascade,
  course_id          uuid not null references public.courses(id) on delete cascade,
  playback_position  double precision not null default 0,
  seconds_watched    int not null default 0,
  completed_at       timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_course_idx on public.lesson_progress (user_id, course_id);

create table public.daily_activity (
  user_id             uuid not null references public.profiles(id) on delete cascade,
  day                 date not null,
  minutes_studied     int not null default 0,
  lessons_completed   int not null default 0,
  questions_answered  int not null default 0,
  xp_earned           int not null default 0,
  primary key (user_id, day)
);

create table public.bookmarks (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_type   text not null check (item_type in ('lesson','question','ebook','course')),
  item_id     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, item_type, item_id)
);

create table public.user_achievements (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  achievement_id  text not null references public.achievements(id) on delete cascade,
  earned_at       timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text not null,
  kind        text not null default 'general',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.device_tokens (
  token       text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null default 'ios',
  updated_at  timestamptz not null default now()
);

-- Written only by the verify-subscription / app-store-notifications Edge Functions.
create table public.subscriptions (
  user_id                  uuid primary key references public.profiles(id) on delete cascade,
  product_id               text not null,
  original_transaction_id  text not null unique,
  expires_at               timestamptz,
  status                   text not null,
  environment              text not null,
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Question bank: Course -> Subject -> Topic -> Difficulty
-- ---------------------------------------------------------------------------

create table public.topics (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  subject    text not null,
  name       text not null,
  lesson_id  uuid references public.lessons(id) on delete set null,
  unique (course_id, name)
);

create table public.questions (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid references public.courses(id) on delete cascade,
  topic_id         uuid references public.topics(id) on delete set null,
  lesson_id        uuid references public.lessons(id) on delete set null,
  kind             text not null check (kind in ('multiple_choice','true_false','short_answer','fill_blank')),
  difficulty       smallint not null default 2 check (difficulty between 1 and 3),
  prompt           text not null,
  choices          jsonb not null default '[]',         -- [{id, text}]
  allows_multiple  boolean not null default false,
  -- 'practice' questions can be checked instantly; 'exam' questions are only graded inside exams/live quizzes.
  usage            text not null default 'any' check (usage in ('any','practice','exam')),
  is_premium       boolean not null default false,
  is_published     boolean not null default true,
  created_at       timestamptz not null default now()
);
create index questions_topic_idx on public.questions (topic_id, difficulty) where is_published;
create index questions_course_idx on public.questions (course_id) where is_published;

-- Answer keys. RLS enabled with NO policies: unreachable from clients, read only by definer functions.
create table public.question_keys (
  question_id         uuid primary key references public.questions(id) on delete cascade,
  correct_choice_ids  text[] not null default '{}',
  accepted_answers    text[] not null default '{}',
  explanation         text
);

create table public.question_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  question_id  uuid not null references public.questions(id) on delete cascade,
  topic_id     uuid,
  is_correct   boolean not null,
  context      text not null check (context in ('practice','daily','exam','live')),
  answered_at  timestamptz not null default now()
);
create index question_attempts_user_idx on public.question_attempts (user_id, topic_id);
create index question_attempts_question_idx on public.question_attempts (user_id, question_id);

create table public.daily_challenges (
  day          date primary key,
  question_id  uuid not null references public.questions(id) on delete cascade,
  xp_reward    int not null default 25
);

-- ---------------------------------------------------------------------------
-- Exams
-- ---------------------------------------------------------------------------

create table public.exams (
  id                  uuid primary key default gen_random_uuid(),
  course_id           uuid references public.courses(id) on delete cascade,
  title               text not null,
  subject             text not null,
  description         text,
  instructions        text[] not null default '{}',
  time_limit_seconds  int not null check (time_limit_seconds > 0),
  question_count      int not null check (question_count > 0),
  pass_percentage     int not null default 50 check (pass_percentage between 1 and 100),
  is_premium          boolean not null default false,
  is_published        boolean not null default false,
  created_at          timestamptz not null default now()
);

-- Optional fixed paper; if empty, questions are drawn from the course bank.
create table public.exam_questions (
  exam_id      uuid not null references public.exams(id) on delete cascade,
  question_id  uuid not null references public.questions(id) on delete cascade,
  position     int not null,
  primary key (exam_id, question_id)
);

create table public.exam_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  exam_id         uuid not null references public.exams(id) on delete cascade,
  question_ids    uuid[] not null,
  started_at      timestamptz not null default now(),
  deadline        timestamptz not null,
  submitted_at    timestamptz,
  answers         jsonb,
  score           int,
  total           int,
  percentage      double precision,
  passed          boolean,
  topic_breakdown jsonb
);
create index exam_attempts_user_idx on public.exam_attempts (user_id, exam_id);

-- ---------------------------------------------------------------------------
-- Live quizzes
-- ---------------------------------------------------------------------------

create table public.live_quizzes (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  subject           text not null,
  description       text,
  starts_at         timestamptz not null,
  question_seconds  int not null default 20 check (question_seconds between 5 and 120),
  reveal_seconds    int not null default 6 check (reveal_seconds between 2 and 30),
  xp_prize          int not null default 0,
  is_premium        boolean not null default false,
  status            text not null default 'scheduled' check (status in ('scheduled','finished','cancelled')),
  created_at        timestamptz not null default now()
);

create table public.live_quiz_questions (
  quiz_id      uuid not null references public.live_quizzes(id) on delete cascade,
  question_id  uuid not null references public.questions(id) on delete restrict,
  position     int not null,
  primary key (quiz_id, position)
);

create table public.live_quiz_participants (
  quiz_id        uuid not null references public.live_quizzes(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  display_name   text not null,
  avatar_url     text,
  score          int not null default 0,
  correct_count  int not null default 0,
  joined_at      timestamptz not null default now(),
  primary key (quiz_id, user_id)
);
create index live_quiz_participants_score_idx on public.live_quiz_participants (quiz_id, score desc);

create table public.live_quiz_answers (
  quiz_id      uuid not null references public.live_quizzes(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  position     int not null,
  choice_id    text not null,
  is_correct   boolean not null,
  points       int not null,
  answered_at  timestamptz not null default now(),
  primary key (quiz_id, user_id, position)
);

-- ---------------------------------------------------------------------------
-- E-books
-- ---------------------------------------------------------------------------

create table public.ebooks (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  author             text not null,
  description        text,
  category_id        text not null references public.categories(id),
  cover_url          text,
  is_premium         boolean not null default false,
  is_downloadable    boolean not null default false,
  chapter_count      int not null default 0,
  estimated_minutes  int not null default 0,
  is_published       boolean not null default false,
  created_at         timestamptz not null default now()
);

create table public.ebook_chapters (
  id                uuid primary key default gen_random_uuid(),
  ebook_id          uuid not null references public.ebooks(id) on delete cascade,
  position          int not null,
  title             text not null,
  content_markdown  text not null,
  unique (ebook_id, position)
);

create table public.ebook_progress (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  ebook_id          uuid not null references public.ebooks(id) on delete cascade,
  chapter_position  int not null default 0,
  scroll_fraction   double precision not null default 0,
  percent           double precision not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (user_id, ebook_id)
);

create table public.ebook_bookmarks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  ebook_id          uuid not null references public.ebooks(id) on delete cascade,
  chapter_position  int not null,
  excerpt           text not null check (char_length(excerpt) <= 400),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Flashcards
-- ---------------------------------------------------------------------------

create table public.flashcard_decks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references public.profiles(id) on delete cascade,   -- null = official Lumen deck
  course_id    uuid references public.courses(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  description  text,
  created_at   timestamptz not null default now()
);

create table public.flashcards (
  id        uuid primary key default gen_random_uuid(),
  deck_id   uuid not null references public.flashcard_decks(id) on delete cascade,
  front     text not null check (char_length(front) between 1 and 1000),
  back      text not null check (char_length(back) between 1 and 2000),
  position  int not null default 0
);
create index flashcards_deck_idx on public.flashcards (deck_id, position);

create table public.flashcard_reviews (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  card_id           uuid not null references public.flashcards(id) on delete cascade,
  ease              double precision not null default 2.5,
  interval_days     double precision not null default 0,
  repetitions       int not null default 0,
  due_at            timestamptz not null default now(),
  last_reviewed_at  timestamptz,
  primary key (user_id, card_id)
);

-- ---------------------------------------------------------------------------
-- AI tutor
-- ---------------------------------------------------------------------------

create table public.tutor_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null default 'New conversation',
  mode        text not null check (mode in ('explain','simplify','quiz','examiner','socratic')),
  lesson_id   uuid references public.lessons(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tutor_conversations_user_idx on public.tutor_conversations (user_id, updated_at desc);

create table public.tutor_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.tutor_conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role             text not null check (role in ('user','assistant')),
  content          text not null,
  input_tokens     int,
  output_tokens    int,
  created_at       timestamptz not null default now()
);
create index tutor_messages_conversation_idx on public.tutor_messages (conversation_id, created_at);
create index tutor_messages_usage_idx on public.tutor_messages (user_id, created_at) where role = 'user';
