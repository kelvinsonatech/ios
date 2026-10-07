-- Usage accounting for AI tutor allowances, and push reminder bookkeeping.

-- One row per billable tutor request (chat turn or generation). Service-role only.
create table public.tutor_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('chat', 'flashcards')),
  created_at  timestamptz not null default now()
);
create index tutor_usage_user_idx on public.tutor_usage (user_id, created_at desc);
alter table public.tutor_usage enable row level security;

alter table public.live_quizzes add column reminder_sent_at timestamptz;
