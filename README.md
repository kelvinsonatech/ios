# Lumen — premium iOS learning app

Lumen is a native SwiftUI learning app backed by Supabase. Students can take structured courses, study with an AI tutor that teaches rather than hands out answers, practise and sit exams, compete in live quizzes, read e-books, study offline, and track streaks, XP and achievements.

The app has its own visual identity: an "Iris" violet brand colour, a warm "Ember" accent for streaks, rounded SF typography and calm card surfaces.

## Feature map

| Area | Where |
| --- | --- |
| Onboarding (interests, level, goal, Sign in with Apple, email, optional Google) | `Lumen/Features/Onboarding` |
| Home dashboard (continue learning, your learning, recommendations, daily challenge, stats, live quizzes) | `Lumen/Features/Home` |
| Course discovery (search by name, subject, instructor or topic; filters and sorting; iPad grid) | `Lumen/Features/Courses` |
| Course → Module → Lesson detail with completion state | `CourseDetailView` |
| Lesson player (AVKit: speed, captions, AirPlay, PiP, full screen, resume, previous/next, notes, definitions, examples, attachments, "Ask AI") | `Lumen/Features/Lesson` |
| AI tutor (Explain, Simplify, Quiz Me, Examiner with results card, Socratic; history, photo/PDF study material, translation, flashcard generation) | `Lumen/Features/Tutor` |
| Voice tutor (live transcription, spoken replies, pause/resume/stop, voice and speed selection, explicit consent) | `VoiceTutorView` |
| Question bank and practice (quick, topic, weak areas, revision, custom, saved) | `Lumen/Features/Practice` |
| Exam mode (server deadline, navigator, flags, auto-submit, results with topic breakdown and revision suggestions) | `Lumen/Features/Exam` |
| Live quiz competitions (Realtime leaderboard, speed scoring, podium) | `Lumen/Features/LiveQuiz` |
| E-book library and reader (contents, search, bookmarks, progress, font size, light/sepia/dark) | `Lumen/Features/Library` |
| Offline downloads (videos, notes, e-books, quiz sets; storage use; Wi-Fi-only; sync queue) | `Lumen/Features/Downloads`, `Core/Services/DownloadManager.swift`, `Core/Persistence/SyncEngine.swift` |
| Flashcards (SM-2 spaced repetition, AI-generated decks) | `Lumen/Features/Flashcards` |
| Profile, achievements, bookmarks, notifications, settings, reminders, account deletion | `Lumen/Features/Profile` |
| Premium subscription (StoreKit 2 + server verification) | `Lumen/Features/Subscription`, `Core/Services/SubscriptionStore.swift` |

## Architecture

```
Lumen/
  App/            Composition root (AppEnvironment), session state, router, tab bar
  DesignSystem/   Tokens (colour, type, spacing, radius, motion), buttons, cards, state views, haptics
  Core/
    Networking/   Dependency-free Supabase client on URLSession: GoTrue auth (PKCE, Apple id_token),
                  PostgREST query builder + RPC, Storage signed URLs, Edge Functions (incl. SSE),
                  Realtime (Phoenix channels over URLSessionWebSocketTask)
    Security/     Keychain storage for the session
    Persistence/  SwiftData models: downloads, playback/reading positions, offline outbox, response cache
    Services/     Network monitor, downloads, StoreKit 2, notifications, speech recognition/synthesis
  Models/         Codable domain models (snake_case <-> camelCase via the shared coders)
  Repositories/   One per domain; the only layer that talks to the network
  Features/       MVVM: @Observable view models + SwiftUI views per feature
```

- **MVVM + repositories.** Views own an `@Observable` view model; view models depend on repositories via `AppEnvironment`. No feature touches `URLSession` directly.
- **Offline first where it matters.** `ResponseCache` serves the last good response when offline; writes made offline (lesson progress, study minutes, e-book position, flashcard reviews) go to a durable SwiftData outbox and are replayed in order when connectivity returns. The server resolves conflicts with `client_updated_at`.
- **No third-party dependencies.** Everything uses Apple frameworks; the Supabase client is ~900 lines in `Core/Networking`.
- **Accessibility.** Dynamic Type everywhere, VoiceOver labels/values/traits on custom controls, answer announcements, Reduce Motion respected (`motionAware`), light and dark palettes, and adaptive iPad layouts (size-class grids, readable widths).

## Backend (Supabase)

```
supabase/
  migrations/   Schema, RLS, RPCs, storage policies, realtime, reference data
  functions/    ai-tutor, verify-subscription, app-store-notifications, delete-account, live-quiz-reminders
  tests/        Plain-Postgres harness + end-to-end test of every RPC
```

### Security model

- **Row Level Security on every table.** Students read and write only their own rows. The course outline is public; premium lesson bodies, e-book chapters and media are gated by RLS and Storage policies.
- **Answer keys never reach the client before an answer is given.** `question_keys` has RLS enabled and no policies. Grading happens in `SECURITY DEFINER` functions. Exam-only questions can't be checked through practice, and the tutor only sees a question's key after the student has attempted it.
- **The server owns scores, XP, streaks and premium status.** Column grants plus a trigger stop clients writing these fields. Internal helpers (`_touch_activity` and the other `_`-prefixed functions) are revoked from API roles.
- **Exams.** `start_exam` fixes the paper and the deadline on the server. `submit_exam` grades it and discards answers that arrive after the deadline plus a 30-second grace period.
- **Live quizzes.** The phase and the current question come from the database clock. `submit_live_answer` accepts one answer per question, and only during that question's phase. Points (500 for a correct answer plus up to 500 for speed) are computed from server time. Prizes are awarded once, under a row lock.
- **Subscriptions.** The app sends StoreKit 2 JWS transactions to `verify-subscription`, which verifies them against Apple's root CAs with `@apple/app-store-server-library`. App Store Server Notifications V2 keep the entitlement current. Only this path can set `is_premium`.
- **AI tutor.** Runs server-side only (the API key never ships in the app). It has daily allowances (free and premium), checks the caller's identity and only reads lesson context the student is entitled to.

### AI tutor

The `ai-tutor` Edge Function uses the official Anthropic TypeScript SDK with `claude-opus-5-5`, adaptive thinking, `effort: "medium"` for chat and `"low"` for flashcard generation. It streams text deltas to the app over SSE. Server-side refusal fallbacks are enabled (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`), so a declined request is retried on a suitable fallback model. The stable teaching prompt is a cached system block; mode, student profile and lesson/question context are appended as separate blocks. Conversations and usage are stored in `tutor_conversations`, `tutor_messages` and `tutor_usage`.

## Getting started

### 1. Supabase

```bash
supabase link --project-ref <ref>
supabase db push                                  # applies supabase/migrations
cp supabase/.env.example supabase/.env            # fill in secrets
supabase secrets set --env-file supabase/.env
supabase functions deploy ai-tutor verify-subscription delete-account live-quiz-reminders
supabase functions deploy app-store-notifications --no-verify-jwt
```

Then in the dashboard:
- **Auth → Providers:** enable Apple (Services ID + key). Optionally enable Google. Add `lumen://auth-callback` to the redirect URLs.
- **Storage:** upload lesson media to the private `lesson-media` bucket. The paths go in `lessons.video_path` and in attachment and resource `file_path` columns. Thumbnails and covers go in `public-assets`.
- **Cron:** schedule `live-quiz-reminders` every minute, with the service-role key as the bearer token.
- **App Store Connect:** point App Store Server Notifications V2 (production and sandbox) at `https://<ref>.functions.supabase.co/app-store-notifications`.

Content (courses, modules, lessons, `lesson_contents`, topics, questions + `question_keys`, exams, live quizzes, e-books, official flashcard decks) is created by administrators through the dashboard or with the service role. The app ships with no hard-coded content. Only administrators who are authorised to distribute a work should upload it.

### 2. iOS app

Requirements: Xcode 16 or later, iOS 17+ deployment, [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig   # SUPABASE_URL, SUPABASE_ANON_KEY, team, product ids
xcodegen generate
open Lumen.xcodeproj
```

The scheme uses `Lumen/Resources/Lumen.storekit` for local StoreKit testing. For production, create matching auto-renewable products in App Store Connect and list their IDs in `STOREKIT_PRODUCT_IDS`.

Capabilities used: Sign in with Apple, Push Notifications, Background Modes (audio for lesson playback and Picture in Picture, remote notifications). Privacy strings for the microphone and speech recognition are in `project.yml`.

### 3. Tests

```bash
# iOS unit tests
xcodebuild test -scheme Lumen -destination 'platform=iOS Simulator,name=iPhone 16'

# Database: applies all migrations to a scratch Postgres 15+ with a Supabase stub,
# then runs the end-to-end RPC/RLS test suite.
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

## Notes and next steps

- Captions are expected as subtitle tracks inside HLS streams (AVKit shows them automatically). Sidecar WebVTT would need a small custom renderer.
- Downloaded videos are saved as files. For DRM-protected HLS you would switch to `AVAssetDownloadURLSession`.
- Email confirmation, password policy and auth rate limits are configured in Supabase Auth.
