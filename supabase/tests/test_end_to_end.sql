-- End-to-end exercise of every client RPC as an authenticated student.
-- Run via supabase/tests/run.sh against a scratch database (never production).
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------------
-- Fixtures (as admin)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ada@example.com', '{"display_name":"Ada"}'),
  ('00000000-0000-0000-0000-00000000000b', 'ben@example.com', '{}');

insert into public.instructors (id, name) values ('10000000-0000-0000-0000-000000000001', 'Dr. Grace');
insert into public.courses (id, slug, title, description, category_id, instructor_id, is_published, is_downloadable, published_at)
values ('20000000-0000-0000-0000-000000000001', 'algebra', 'Algebra Foundations', 'Variables and equations', 'mathematics',
        '10000000-0000-0000-0000-000000000001', true, true, now()),
       ('20000000-0000-0000-0000-000000000002', 'adv-calc', 'Advanced Calculus', 'Limits', 'mathematics',
        null, true, false, now());
update public.courses set is_premium = true where slug = 'adv-calc';
insert into public.modules (id, course_id, title, position) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Algebra', 1);
insert into public.lessons (id, module_id, course_id, title, position, duration_seconds, video_path, is_downloadable) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Introduction', 1, 300, 'algebra/intro.mp4', true),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Variables', 2, 600, null, true);
insert into public.lesson_contents (lesson_id, notes_markdown) values ('40000000-0000-0000-0000-000000000001', '# Intro');
insert into public.topics (id, course_id, subject, name, lesson_id) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'mathematics', 'Linear equations', '40000000-0000-0000-0000-000000000002');
insert into public.questions (id, course_id, topic_id, kind, difficulty, prompt, choices, usage) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'multiple_choice', 1, 'Solve 2x = 4', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]', 'practice'),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'short_answer', 2, 'What letter usually names an unknown?', '[]', 'practice'),
  ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'true_false', 1, '3 + 3 = 7', '[{"id":"t","text":"True"},{"id":"f","text":"False"}]', 'exam');
insert into public.question_keys (question_id, correct_choice_ids, accepted_answers, explanation) values
  ('60000000-0000-0000-0000-000000000001', '{b}', '{}', 'Divide both sides by 2.'),
  ('60000000-0000-0000-0000-000000000002', '{}', '{x}', 'Conventionally x.'),
  ('60000000-0000-0000-0000-000000000003', '{f}', '{}', '3 + 3 = 6.');
insert into public.exams (id, course_id, title, subject, time_limit_seconds, question_count, pass_percentage, is_published)
values ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Algebra mock', 'Mathematics', 600, 3, 60, true);
insert into public.live_quizzes (id, title, subject, starts_at, question_seconds, reveal_seconds, xp_prize)
values ('80000000-0000-0000-0000-000000000001', 'Friday Maths Sprint', 'Mathematics', now() - interval '2 seconds', 20, 5, 100);
insert into public.live_quiz_questions (quiz_id, question_id, position) values
  ('80000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 0);
insert into public.ebooks (id, title, author, category_id, is_published, is_downloadable)
values ('90000000-0000-0000-0000-000000000001', 'Algebra Handbook', 'Lumen Press', 'mathematics', true, true);
insert into public.ebook_chapters (ebook_id, position, title, content_markdown) values
  ('90000000-0000-0000-0000-000000000001', 0, 'Chapter 1', 'Hello');

do $$ begin
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Ada', 'profile trigger';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'ben', 'email fallback';
  assert (select lesson_count from public.courses where slug = 'algebra') = 2, 'lesson count trigger';
  assert (select chapter_count from public.ebooks where title = 'Algebra Handbook') = 1, 'chapter count trigger';
end $$;

-- ---------------------------------------------------------------------------
-- Act as Ada
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

-- Protected columns cannot be changed directly.
do $$ begin
  begin
    update public.profiles set xp = 999999, is_premium = true where id = auth.uid();
    raise exception 'protected columns must not be writable';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.profiles set display_name = 'Ada L' where id = auth.uid();
do $$ begin
  assert (select xp from public.profiles where id = auth.uid()) = 0, 'xp protected';
  assert not (select is_premium from public.profiles where id = auth.uid()), 'premium protected';
  assert (select display_name from public.profiles where id = auth.uid()) = 'Ada L', 'name editable';
end $$;

-- Answer keys and raw questions are unreachable.
do $$ begin
  assert (select count(*) from public.question_keys) = 0, 'keys hidden';
  assert (select count(*) from public.questions) = 0, 'questions hidden';
end $$;

-- Internal helpers are not executable.
do $$ begin
  begin
    perform public._touch_activity(auth.uid(), current_date, 0, 0, 0, 1000);
    raise exception 'internal function should not be callable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Catalog
do $$ declare r jsonb; begin
  select x into r from public.search_courses(q => 'grace') x limit 1;
  assert r ->> 'slug' = 'algebra', 'search by instructor';
  assert r -> 'instructor' ->> 'name' = 'Dr. Grace', 'instructor embedded';
  assert (select count(*) from public.search_courses(q => 'linear')) = 1, 'search by topic';
  assert (select count(*) from public.search_courses(free_only => true)) = 1, 'free filter';
  assert (select count(*) from public.recommended_courses(5)) = 2, 'recommendations';
end $$;

-- Premium gating
do $$ begin
  begin
    perform public.enroll_course('20000000-0000-0000-0000-000000000002');
    raise exception 'premium course should be refused';
  exception when raise_exception then
    if sqlerrm <> 'premium_required' then raise; end if;
  end;
end $$;

select public.enroll_course('20000000-0000-0000-0000-000000000001');

-- Progress, XP, streak, achievements
do $$ declare r jsonb; begin
  r := public.record_lesson_progress('40000000-0000-0000-0000-000000000001', 120, 60, false, now());
  assert (r ->> 'xp_awarded')::int = 0, 'no xp before completion';
  r := public.record_lesson_progress('40000000-0000-0000-0000-000000000001', 290, 60, true, now());
  assert (r ->> 'xp_awarded')::int = 20, 'lesson xp';
  assert r -> 'new_achievements' ? 'first-lesson', 'first lesson badge';
  assert (r ->> 'course_progress')::float = 0.5, 'course progress';
  r := public.record_lesson_progress('40000000-0000-0000-0000-000000000001', 290, 0, true, now());
  assert (r ->> 'xp_awarded')::int = 0, 'completion xp only once';
  assert (select current_streak from public.profiles where id = auth.uid()) = 1, 'streak started';
end $$;

select public.log_study_minutes(25, current_date, 'lesson');
do $$ declare s jsonb; begin
  s := public.daily_stats(current_date);
  assert (s ->> 'minutes_studied')::int = 25, 'minutes logged';
  assert (s ->> 'lessons_completed')::int = 1, 'lessons counted';
  assert (select count(*) from public.activity_history(7, current_date)) = 7, 'activity days';
  assert (select count(*) from public.my_achievements() a where a ->> 'earned_at' is not null) = 1, 'achievement listed';
end $$;

-- Practice + instant feedback
do $$ declare r jsonb; begin
  assert (select count(*) from public.practice_questions('topic', topic_id => '50000000-0000-0000-0000-000000000001')) = 2,
    'exam-only questions excluded from practice';
  r := public.check_answer('60000000-0000-0000-0000-000000000001', '{"choice_ids":["b"]}', 'practice');
  assert (r ->> 'is_correct')::boolean, 'correct choice';
  assert (r ->> 'xp_awarded')::int = 2, 'practice xp';
  r := public.check_answer('60000000-0000-0000-0000-000000000001', '{"choice_ids":["b"]}', 'practice');
  assert (r ->> 'xp_awarded')::int = 0, 'no xp farming';
  r := public.check_answer('60000000-0000-0000-0000-000000000002', '{"text":"  X! "}', 'practice');
  assert (r ->> 'is_correct')::boolean, 'normalised short answer';
  assert (select count(*) from public.practice_questions('weak_areas')) >= 0, 'weak areas runs';
  assert (select count(*) from public.practice_questions('revision', course_id => '20000000-0000-0000-0000-000000000001')) = 2, 'revision';
  assert (select count(*) from public.topic_performance()) = 1, 'topic performance';
  assert (select count(*) from public.topics_with_counts()) = 1, 'topics';
  assert (select count(*) from public.question_subjects()) = 1, 'subjects';
  assert (select count(*) from public.offline_quiz_set('20000000-0000-0000-0000-000000000001')) = 2, 'offline set';
  begin
    perform public.check_answer('60000000-0000-0000-0000-000000000003', '{"choice_ids":["f"]}', 'practice');
    raise exception 'exam question must not be checkable';
  exception when no_data_found then null;
  end;
end $$;

-- Bookmarks
do $$ begin
  assert public.toggle_bookmark('question', '60000000-0000-0000-0000-000000000001'), 'bookmark on';
  assert public.toggle_bookmark('lesson', '40000000-0000-0000-0000-000000000001'), 'lesson bookmark on';
  assert (select count(*) from public.practice_questions('saved')) = 1, 'saved mode';
  assert (select count(*) from public.my_bookmarks()) = 2, 'bookmark list';
  assert (select b ->> 'parent_id' from public.my_bookmarks() b where b ->> 'item_type' = 'lesson') = '20000000-0000-0000-0000-000000000001', 'lesson parent';
  assert not public.toggle_bookmark('lesson', '40000000-0000-0000-0000-000000000001'), 'bookmark off';
end $$;

-- Daily challenge
do $$ declare c jsonb; r jsonb; begin
  select x into c from public.daily_challenge(current_date) x;
  assert c is not null and not (c ->> 'completed')::boolean, 'challenge available';
  -- The only eligible free, choice-based practice question is #1 (answer "b").
  assert c -> 'question' ->> 'id' = '60000000-0000-0000-0000-000000000001', 'deterministic daily pick';
  r := public.submit_daily_challenge(current_date, '{"choice_ids":["b"]}');
  assert (r ->> 'is_correct')::boolean, 'daily correct';
  assert (r ->> 'xp_awarded')::int = 25, 'daily xp';
  select x into c from public.daily_challenge(current_date) x;
  assert (c ->> 'completed')::boolean and (c ->> 'was_correct')::boolean, 'challenge completed';
  begin
    perform public.submit_daily_challenge(current_date, '{"choice_ids":["a"]}');
    raise exception 'second attempt should fail';
  exception when raise_exception then
    if sqlerrm <> 'already_completed' then raise; end if;
  end;
end $$;

-- Exams
do $$ declare s jsonb; r jsonb; again jsonb; begin
  s := public.start_exam('70000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(s -> 'questions') = 3, 'paper drawn';
  assert not (s -> 'questions' -> 0 ? 'correct_choice_ids'), 'no keys in exam';
  again := public.start_exam('70000000-0000-0000-0000-000000000001');
  assert again ->> 'attempt_id' = s ->> 'attempt_id', 'resume running attempt';
  r := public.submit_exam((s ->> 'attempt_id')::uuid, jsonb_build_array(
         jsonb_build_object('question_id', '60000000-0000-0000-0000-000000000001', 'choice_ids', '["b"]'::jsonb, 'text', ''),
         jsonb_build_object('question_id', '60000000-0000-0000-0000-000000000002', 'choice_ids', '[]'::jsonb, 'text', 'x'),
         jsonb_build_object('question_id', '60000000-0000-0000-0000-000000000003', 'choice_ids', '["t"]'::jsonb, 'text', '')));
  assert (r ->> 'score')::int = 2 and (r ->> 'total')::int = 3, 'exam graded';
  assert (r ->> 'passed')::boolean, 'passed at 66%';
  assert (r ->> 'xp_awarded')::int = 50, 'exam xp';
  assert jsonb_array_length(r -> 'topic_breakdown') = 1, 'topic breakdown';
  assert jsonb_array_length(r -> 'recommended_lessons') = 1, 'revision recommendation';
  assert jsonb_array_length(r -> 'review') = 3, 'review';
  assert (select passed from public.exam_attempts where id = (s ->> 'attempt_id')::uuid), 'attempt stored';
  begin
    perform public.submit_exam((s ->> 'attempt_id')::uuid, '[]');
    raise exception 'double submit should fail';
  exception when raise_exception then
    if sqlerrm <> 'already_submitted' then raise; end if;
  end;
end $$;

-- Live quiz: server-side timing and scoring
do $$ declare st jsonb; r jsonb; begin
  assert (select count(*) from public.upcoming_live_quizzes(5)) = 1, 'quiz listed';
  perform public.join_live_quiz('80000000-0000-0000-0000-000000000001');
  st := public.live_quiz_state('80000000-0000-0000-0000-000000000001');
  assert st ->> 'phase' = 'question', 'question phase';
  assert st -> 'question' ->> 'id' = '60000000-0000-0000-0000-000000000001', 'question delivered';
  assert st ->> 'correct_choice_id' is null, 'answer not revealed during question';
  r := public.submit_live_answer('80000000-0000-0000-0000-000000000001', 1, 'b');
  assert not (r ->> 'accepted')::boolean, 'wrong position refused';
  r := public.submit_live_answer('80000000-0000-0000-0000-000000000001', 0, 'b');
  assert (r ->> 'accepted')::boolean and (r ->> 'points')::int between 900 and 1000, 'speed points';
  r := public.submit_live_answer('80000000-0000-0000-0000-000000000001', 0, 'b');
  assert not (r ->> 'accepted')::boolean, 'single answer per question';
  assert (select score from public.live_quiz_participants where user_id = auth.uid()) = (select points from public.live_quiz_answers where user_id = auth.uid()), 'score stored';
end $$;

-- Participants cannot write scores directly.
do $$ begin
  begin
    update public.live_quiz_participants set score = 1000000 where user_id = auth.uid();
  exception when insufficient_privilege then null;
  end;
  assert (select score from public.live_quiz_participants where user_id = auth.uid()) < 1001, 'score not writable';
end $$;

-- E-books
do $$ begin
  perform public.record_ebook_progress('90000000-0000-0000-0000-000000000001', 0, 0.5, 0.5, now());
  perform public.record_ebook_progress('90000000-0000-0000-0000-000000000001', 0, 0.1, 0.1, now() - interval '1 hour');
  assert (select percent from public.ebook_progress where user_id = auth.uid()) = 0.5, 'stale write ignored';
  assert (select count(*) from public.ebook_chapters) = 1, 'free chapters readable';
  insert into public.ebook_bookmarks (ebook_id, chapter_position, excerpt) values ('90000000-0000-0000-0000-000000000001', 0, 'Hello');
  assert (select count(*) from public.ebook_bookmarks) = 1, 'bookmark saved';
end $$;

-- Flashcards
do $$ declare deck uuid; card uuid; begin
  deck := public.create_flashcard_deck('Algebra terms', null, null, '[{"front":"Variable","back":"A symbol for a value"},{"front":"","back":"skipped"}]');
  assert (select count(*) from public.flashcards where deck_id = deck) = 1, 'blank cards skipped';
  select f.id into card from public.flashcards f where f.deck_id = deck;
  perform public.review_flashcard(card, 4, now());
  assert (select interval_days from public.flashcard_reviews where card_id = card) = 1, 'sm2 first interval';
  perform public.review_flashcard(card, 4, now());
  assert (select interval_days from public.flashcard_reviews where card_id = card) = 6, 'sm2 second interval';
  assert (select (d ->> 'card_count')::int from public.my_flashcard_decks() d where (d ->> 'id')::uuid = deck) = 1, 'deck listed';
  assert (select count(*) from public.deck_cards(deck)) = 1, 'deck cards';
end $$;

-- Storage entitlement
do $$ begin
  assert public.can_access_media('algebra/intro.mp4'), 'free media accessible';
  assert not public.can_access_media('unknown/file.mp4'), 'unknown media refused';
end $$;

-- ---------------------------------------------------------------------------
-- Ben cannot see Ada's data
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.profiles) = 1, 'only own profile';
  assert (select count(*) from public.enrollments) = 0, 'no foreign enrollments';
  assert (select count(*) from public.ebook_bookmarks) = 0, 'no foreign bookmarks';
  assert (select count(*) from public.my_flashcard_decks()) = 0, 'no foreign decks';
  begin
    perform public.live_quiz_state('80000000-0000-0000-0000-000000000001');
    raise exception 'state requires joining';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Finalisation awards XP exactly once.
update public.live_quizzes set starts_at = now() - interval '1 hour' where id = '80000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare before int; st jsonb; begin
  before := (select xp from public.profiles where id = auth.uid());
  st := public.live_quiz_state('80000000-0000-0000-0000-000000000001');
  assert st ->> 'phase' = 'finished', 'finished';
  assert (select xp from public.profiles where id = auth.uid()) >= before + 110, 'winner prize';
  before := (select xp from public.profiles where id = auth.uid());
  st := public.live_quiz_state('80000000-0000-0000-0000-000000000001');
  assert (select xp from public.profiles where id = auth.uid()) = before, 'prize once';
end $$;
reset role;

\echo 'end-to-end: OK'
