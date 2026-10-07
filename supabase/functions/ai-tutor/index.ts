// AI tutor: streams Claude responses to the app as Server-Sent Events, persists the
// conversation, enforces daily limits and grounds answers in lesson/question context.
import Anthropic from "npm:@anthropic-ai/sdk";
import { corsHeaders, env, error, json, requireUser, serviceClient } from "../_shared/http.ts";
import { BASE_SYSTEM_PROMPT, FLASHCARD_SYSTEM_PROMPT, MODE_INSTRUCTIONS, MODES, type TutorMode } from "./prompts.ts";

const MODEL = "claude-opus-5-5";
const FREE_DAILY_MESSAGES = Number(Deno.env.get("TUTOR_FREE_DAILY_MESSAGES") ?? "20");
const PREMIUM_DAILY_MESSAGES = Number(Deno.env.get("TUTOR_PREMIUM_DAILY_MESSAGES") ?? "400");
const MAX_MESSAGE_CHARS = 24_000;
const HISTORY_LIMIT = 40;

const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });

interface ChatRequest {
  conversation_id?: string;
  mode?: TutorMode;
  message?: string;
  lesson_id?: string;
  question_id?: string;
  submitted_answer?: { choice_ids?: string[]; text?: string };
  language?: string;
  task?: "flashcards";
  topic?: string;
  count?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error(405, "method_not_allowed");

  const user = await requireUser(req);
  if (!user) return error(401, "not_authenticated");

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return error(400, "invalid_json");
  }

  const db = serviceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("display_name, level, goal, is_premium")
    .eq("id", user.id)
    .single();
  if (!profile) return error(403, "profile_missing");

  // Daily allowance (chat turns and generations both count).
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: used } = await db
    .from("tutor_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  const limit = profile.is_premium ? PREMIUM_DAILY_MESSAGES : FREE_DAILY_MESSAGES;
  if ((used ?? 0) >= limit) return error(429, "rate_limited", profile.is_premium ? "rate_limited" : "premium_required");

  if (body.task === "flashcards") return await generateFlashcards(body, user.id, db);
  return await chat(body, user.id, profile, db);
});

// ---------------------------------------------------------------------------
// Chat (streaming)
// ---------------------------------------------------------------------------

async function chat(
  body: ChatRequest,
  userId: string,
  profile: { display_name: string; level: string | null; goal: string | null; is_premium: boolean },
  db: ReturnType<typeof serviceClient>,
): Promise<Response> {
  const mode: TutorMode = MODES.includes(body.mode as TutorMode) ? (body.mode as TutorMode) : "explain";
  const message = (body.message ?? "").trim();
  if (!message) return error(400, "empty_message");
  if (message.length > MAX_MESSAGE_CHARS) return error(413, "message_too_long");

  // Load or create the conversation (always scoped to this user).
  let conversationId = body.conversation_id ?? null;
  let lessonId = body.lesson_id ?? null;
  if (conversationId) {
    const { data: convo } = await db
      .from("tutor_conversations")
      .select("id, lesson_id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!convo) return error(404, "not_found");
    lessonId = lessonId ?? convo.lesson_id;
  } else {
    const title = message.split("\n---\n")[0].replace(/\s+/g, " ").slice(0, 60) || "New conversation";
    const { data: created, error: createError } = await db
      .from("tutor_conversations")
      .insert({ user_id: userId, title, mode, lesson_id: lessonId })
      .select("id")
      .single();
    if (createError || !created) return error(500, "could_not_create_conversation");
    conversationId = created.id;
  }

  const { data: historyRows } = await db
    .from("tutor_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = (historyRows ?? []).reverse() as { role: "user" | "assistant"; content: string }[];

  const context = await buildContext(db, userId, profile.is_premium, lessonId, body);

  await db.from("tutor_messages").insert({ conversation_id: conversationId, user_id: userId, role: "user", content: message });
  await db.from("tutor_usage").insert({ user_id: userId, kind: "chat" });

  // System prompt: stable base (cached) + per-request mode/student/context blocks.
  const studentLine = `Student: ${profile.display_name}. Level: ${profile.level ?? "unknown"}. Goal: ${profile.goal ?? "unspecified"}.` +
    (body.language ? ` Device language: ${body.language}.` : "");
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: "text", text: BASE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: MODE_INSTRUCTIONS[mode] },
    { type: "text", text: studentLine },
  ];
  if (context) system.push({ type: "text", text: context });

  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    ...normaliseHistory(history),
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      send({ type: "meta", conversation_id: conversationId });

      let reply = "";
      try {
        const response = anthropic.beta.messages.stream({
          model: MODEL,
          max_tokens: 64000,
          output_config: { effort: "medium" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system,
          messages,
        });

        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            reply += event.delta.text;
            send({ type: "delta", text: event.delta.text });
          }
        }

        const final = await response.finalMessage();
        if (final.stop_reason === "refusal" && reply.trim() === "") {
          reply = "I can't help with that one, but I'd be glad to help you study something else. What are you working on?";
          send({ type: "delta", text: reply });
        } else if (final.stop_reason === "max_tokens") {
          const note = "\n\n_(That answer was long, so I stopped here. Ask me to continue.)_";
          reply += note;
          send({ type: "delta", text: note });
        }

        await db.from("tutor_messages").insert({
          conversation_id: conversationId,
          user_id: userId,
          role: "assistant",
          content: reply,
          input_tokens: final.usage.input_tokens,
          output_tokens: final.usage.output_tokens,
        });
        await db.from("tutor_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
        send({ type: "done" });
      } catch (err) {
        console.error("tutor stream failed", err);
        if (err instanceof Anthropic.RateLimitError) {
          send({ type: "error", message: "The tutor is busy right now. Please try again in a moment." });
        } else if (err instanceof Anthropic.APIError) {
          send({ type: "error", message: "The tutor couldn't respond. Please try again." });
        } else {
          send({ type: "error", message: "Something went wrong. Please try again." });
        }
        // Persist partial output so the conversation history stays consistent.
        if (reply) {
          await db.from("tutor_messages").insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: reply });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

/** The API requires alternating roles starting with the user; repair any gaps from interrupted turns. */
function normaliseHistory(history: { role: "user" | "assistant"; content: string }[]): Anthropic.Beta.Messages.BetaMessageParam[] {
  const result: Anthropic.Beta.Messages.BetaMessageParam[] = [];
  for (const turn of history) {
    if (!turn.content?.trim()) continue;
    const last = result[result.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content as string}\n\n${turn.content}`;
    } else {
      result.push({ role: turn.role, content: turn.content });
    }
  }
  while (result.length && result[0].role !== "user") result.shift();
  // The new user message is appended by the caller; merge if history ends with a user turn.
  if (result.length && result[result.length - 1].role === "user") {
    result.push({ role: "assistant", content: "(No reply was recorded for the previous message.)" });
  }
  return result;
}

/** Lesson notes and question details the student is asking about, respecting entitlements. */
async function buildContext(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  isPremium: boolean,
  lessonId: string | null,
  body: ChatRequest,
): Promise<string | null> {
  const parts: string[] = [];

  if (lessonId) {
    const { data: lesson } = await db
      .from("lessons")
      .select("title, summary, is_premium, course:courses(title, is_premium), content:lesson_contents(notes_markdown, key_terms)")
      .eq("id", lessonId)
      .maybeSingle();
    if (lesson) {
      // deno-lint-ignore no-explicit-any
      const course = lesson.course as any;
      // deno-lint-ignore no-explicit-any
      const content = lesson.content as any;
      const entitled = isPremium || (!lesson.is_premium && !course?.is_premium);
      parts.push(`The student is studying the lesson "${lesson.title}" from the course "${course?.title ?? ""}".`);
      if (lesson.summary) parts.push(`Lesson summary: ${lesson.summary}`);
      if (entitled && content?.notes_markdown) {
        parts.push(`<lesson_notes>\n${String(content.notes_markdown).slice(0, 30_000)}\n</lesson_notes>`);
      }
    }
  }

  if (body.question_id) {
    const { data: question } = await db
      .from("questions")
      .select("id, prompt, kind, choices, usage, key:question_keys(correct_choice_ids, accepted_answers, explanation)")
      .eq("id", body.question_id)
      .maybeSingle();
    if (question) {
      // Only reveal the key if the student has already attempted this question.
      const { count } = await db
        .from("question_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("question_id", question.id);
      const attempted = (count ?? 0) > 0;
      // deno-lint-ignore no-explicit-any
      const choices = (question.choices as any[] ?? []).map((c) => `${c.id}) ${c.text}`).join("\n");
      parts.push(`<question>\n${question.prompt}\n${choices}\n</question>`);
      if (body.submitted_answer) {
        const submitted = body.submitted_answer.choice_ids?.length ? body.submitted_answer.choice_ids.join(", ") : body.submitted_answer.text;
        if (submitted) parts.push(`The student's answer: ${submitted}`);
      }
      // deno-lint-ignore no-explicit-any
      const key = question.key as any;
      if (attempted && key) {
        parts.push(`Correct answer: ${(key.correct_choice_ids ?? []).join(", ") || (key.accepted_answers ?? [])[0] || "n/a"}.` +
          (key.explanation ? ` Official explanation: ${key.explanation}` : ""));
      } else {
        parts.push("The student has not answered this question yet. Do NOT reveal the answer; help them reason towards it.");
      }
    }
  }

  return parts.length ? `Context for this conversation:\n${parts.join("\n\n")}` : null;
}

// ---------------------------------------------------------------------------
// Flashcard generation (structured output)
// ---------------------------------------------------------------------------

async function generateFlashcards(body: ChatRequest, userId: string, db: ReturnType<typeof serviceClient>): Promise<Response> {
  const topic = (body.topic ?? "").trim().slice(0, 500);
  if (!topic) return error(400, "missing_topic");
  const count = Math.min(Math.max(body.count ?? 12, 3), 30);

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["cards"],
            properties: {
              cards: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["front", "back"],
                  properties: { front: { type: "string" }, back: { type: "string" } },
                },
              },
            },
          },
        },
      },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: FLASHCARD_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Create ${count} flashcards about: ${topic}` }],
    });

    if (response.stop_reason === "refusal") return error(422, "topic_not_supported");
    const text = response.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") return error(502, "empty_response");
    const parsed = JSON.parse(text.text) as { cards: { front: string; back: string }[] };
    const cards = parsed.cards
      .filter((c) => c.front?.trim() && c.back?.trim())
      .slice(0, count)
      .map((c) => ({ front: c.front.trim().slice(0, 1000), back: c.back.trim().slice(0, 2000) }));

    await db.from("tutor_usage").insert({ user_id: userId, kind: "flashcards" });
    return json({ cards });
  } catch (err) {
    console.error("flashcard generation failed", err);
    if (err instanceof Anthropic.RateLimitError) return error(429, "rate_limited");
    return error(502, "generation_failed");
  }
}
