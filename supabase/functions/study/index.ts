/**
 * POST /functions/v1/study
 *
 * Practice generated from a piece of assigned study material: a short quiz
 * with feedback, a deck of flashcards, or a timed mock test.
 *
 * The questions have to come from the material, not from the model's general
 * idea of the topic, so the first job is getting the material's words:
 *
 *   PDF / PPTX / DOCX   read the file itself (text layer, slide XML incl. notes)
 *   YouTube             the video's title, channel and full description —
 *                       YouTube no longer serves caption tracks to servers
 *   Web link            the page's readable text
 *   Video file          title and the administrator's description only
 *
 * Extracted text is cached on the material, so the second officer to practise
 * does not pay for extraction again, and Samiksha AI can quote the same text.
 * The response says which of these the questions rest on, because "from your
 * slides" and "from the video's description" deserve different trust.
 *
 * YouTube refuses requests from cloud data centres but answers a phone, so the
 * app may send the video's details it fetched as `source_text`; it is used
 * only for YouTube material, and only when the server could not do better.
 *
 * Body: { mode: "quiz" | "flashcards" | "mock", material_id?, material? (demo), source_text? }
 */
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/supabase.ts";
import { chat, logGeneration, type ChatResult } from "../_shared/openrouter.ts";
import { extractPptx, extractDocx, isPptx, isDocx } from "../_shared/officedocs.ts";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

// deno-lint-ignore no-explicit-any
type Any = any;
type Mode = "quiz" | "flashcards" | "mock";
type Grounding = "document" | "video_description" | "web_page" | "title_only";

const DEMO_CALLS_PER_10_MIN = 60;
const MAX_SOURCE_CHARS = 120_000;
const COUNTS: Record<Mode, number> = { quiz: 6, flashcards: 10, mock: 15 };

const questionSchema = {
  name: "practice_questions",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "questions"],
    properties: {
      title: { type: "string" },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "options", "answer_index", "explanation", "source_hint"],
          properties: {
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            answer_index: { type: "integer" },
            explanation: { type: "string" },
            source_hint: { type: "string" },
          },
        },
      },
    },
  },
};

const flashcardSchema = {
  name: "practice_flashcards",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "cards"],
    properties: {
      title: { type: "string" },
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
};

/**
 * Run `make`; if it has not answered within `hedgeAfterMs`, start a second
 * identical request and take whichever finishes first. Providers behind the
 * model occasionally stall for minutes, and one stalled call must not hold an
 * officer on a spinner past the function's time limit.
 */
function hedged<T>(make: () => Promise<T>, hedgeAfterMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let started = 0;
    let failed = 0;
    let lastError: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const launch = () => {
      started++;
      make().then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }).catch((err) => {
        failed++;
        lastError = err;
        if (settled) return;
        if (started < 2) { clearTimeout(timer); launch(); }
        else if (failed >= 2) { settled = true; reject(lastError); }
      });
    };
    launch();
    timer = setTimeout(() => { if (!settled && started < 2) launch(); }, hedgeAfterMs);
  });
}

const withTimeout = (ms: number) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

const decodeEntities = (s: string) => s
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/**
 * What YouTube will tell a server about a video: title, channel, description.
 * The player API answers from data-centre addresses where the watch page often
 * serves a consent wall instead; the page is the fallback.
 */
async function youtubeSource(id: string): Promise<{ text: string; ok: boolean }> {
  const compose = (title: string, author: string, description: string, keywords: string[] = []) => ({
    text: [title && `Video title: ${title}`, author && `Channel: ${author}`,
      keywords.length ? `Tags: ${keywords.slice(0, 15).join(", ")}` : "",
      description && `Video description:\n${description}`].filter(Boolean).join("\n\n"),
    ok: description.length > 80,
  });
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({ videoId: id, context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" } } }),
      signal: withTimeout(8000),
    });
    const v = (await res.json())?.videoDetails;
    if (v?.title) return compose(v.title, v.author ?? "", v.shortDescription ?? "", v.keywords ?? []);
  } catch (e) {
    console.warn("[study] youtube player api failed", e);
  }
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" },
      signal: withTimeout(8000),
    });
    const html = await res.text();
    const json = (key: string) => {
      const m = html.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`));
      if (!m) return "";
      try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
    };
    return compose(json("title"), json("author"), json("shortDescription"));
  } catch (e) {
    console.warn("[study] youtube page fetch failed", e);
    return { text: "", ok: false };
  }
}

async function webPageSource(url: string): Promise<{ text: string; ok: boolean }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: withTimeout(8000) });
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.startsWith("text/")) return { text: "", ok: false };
    const html = (await res.text()).slice(0, 2_000_000);
    const pageTitle = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
    const metaDescription = decodeEntities(
      html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? "").trim();
    const body = decodeEntities(html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "))
      .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*/g, "\n\n").trim();
    const text = [pageTitle && `Page title: ${pageTitle}`, metaDescription && `Page summary: ${metaDescription}`, body]
      .filter(Boolean).join("\n\n");
    return { text: text.slice(0, MAX_SOURCE_CHARS), ok: body.length > 400 };
  } catch (e) {
    console.warn("[study] page fetch failed", e);
    return { text: "", ok: false };
  }
}

async function fileSource(db: Any, path: string, mime: string | null): Promise<string> {
  const { data: blob, error } = await db.storage.from("materials").download(path);
  if (error || !blob) throw new Error(`Could not read the file: ${error?.message ?? "not found"}`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = mime ?? blob.type ?? "";
  if (type === "application/pdf" || /\.pdf$/i.test(path)) {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text ?? "");
  }
  if (isPptx(type, path)) return extractPptx(bytes).text;
  if (isDocx(type, path)) return extractDocx(bytes).text;
  if (type.startsWith("text/")) return new TextDecoder().decode(bytes);
  return "";
}

interface MaterialLike {
  title: string;
  description?: string | null;
  kind: string;
  youtube_id?: string | null;
  external_url?: string | null;
}

/** The words the practice is written from, and what they are. */
async function sourceFor(db: Any, m: MaterialLike & { id?: string; storage_path?: string | null;
  mime_type?: string | null; extracted_text?: string | null }, live: boolean, clientText = ""):
  Promise<{ text: string; grounding: Grounding }> {
  const header = `Title: ${m.title}${m.description ? `\nAdministrator's note: ${m.description}` : ""}`;

  if (m.extracted_text && m.extracted_text.length > 200) {
    const grounding: Grounding = m.kind === "youtube" ? "video_description"
      : m.kind === "link" ? "web_page" : "document";
    return { text: `${header}\n\n${m.extracted_text}`, grounding };
  }

  let text = "";
  let grounding: Grounding = "title_only";

  if (live && m.storage_path && ["pdf", "pptx", "docx", "document"].includes(m.kind)) {
    text = (await fileSource(db, m.storage_path, m.mime_type ?? null)).replace(/\n{3,}/g, "\n\n").trim();
    if (text.length > 200) grounding = "document";
  } else if (m.kind === "youtube" && m.youtube_id) {
    const yt = await youtubeSource(m.youtube_id);
    text = yt.text;
    if (yt.ok) grounding = "video_description";
    else if (clientText.length > text.length) {
      text = clientText;
      if (/Video description:\s*\S[\s\S]{80,}/.test(clientText)) grounding = "video_description";
    }
  } else if (m.kind === "link" && m.external_url && /^https:\/\//i.test(m.external_url)) {
    const page = await webPageSource(m.external_url);
    text = page.text;
    if (page.ok) grounding = "web_page";
  }

  text = text.slice(0, MAX_SOURCE_CHARS);
  if (live && m.id && grounding !== "title_only") {
    await db.from("materials").update({
      extracted_text: text,
      word_count: text.split(/\s+/).filter(Boolean).length,
    }).eq("id", m.id);
  }
  return { text: text ? `${header}\n\n${text}` : header, grounding };
}

const GROUNDING_RULE: Record<Grounding, string> = {
  document: "Write every item from the SOURCE below. Test what it actually says — its definitions, procedures, numbers and examples — not general knowledge about the topic. source_hint names the section, slide or heading the item comes from.",
  video_description: "The SOURCE is the video's title and description, not a transcript. Base items on the concepts the video says it covers, keep them to the standard, uncontroversial content of those concepts, and do not invent specifics (numbers, claims, quotes) the video may not contain. source_hint names the concept from the description.",
  web_page: "Write every item from the SOURCE page text below, ignoring navigation and boilerplate. source_hint names the part of the page used.",
  title_only: "Only the title (and perhaps a short note) is available. Write items on the core, standard concepts that title names, at the level an Indian official statistics officer needs, and avoid invented specifics. source_hint is \"topic\".",
};

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const db = adminClient();
  let userId: string | null = null;
  let task = "study";

  try {
    const body = await req.json().catch(() => ({}));
    const mode: Mode = ["quiz", "flashcards", "mock"].includes(body.mode) ? body.mode : "quiz";
    task = `study_${mode}`;

    const { data: auth } = await userClient(req).auth.getUser().catch(() => ({ data: null }));
    const user = auth?.user ?? null;

    let material: Any;
    if (user) {
      userId = user.id;
      if (!body.material_id) return errorResponse("material_id is required", 400);
      // Read through the caller's own permissions: an officer can only practise
      // on material they were given (or staff on anything they can see).
      const { data, error } = await userClient(req).from("materials")
        .select("id, title, description, kind, youtube_id, external_url, storage_path, mime_type, extracted_text")
        .eq("id", body.material_id).maybeSingle();
      if (error || !data) return errorResponse("That material is not available to you.", 404);
      material = data;
    } else {
      if (!body.material?.title) return errorResponse("Sign in to practise on this material.", 401);
      task = `study_${mode}_demo`;
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { count } = await db.from("ai_generations").select("id", { count: "exact", head: true })
        .like("task", "study_%_demo").gte("created_at", since);
      if ((count ?? 0) >= DEMO_CALLS_PER_10_MIN) {
        return errorResponse("The demo is busy right now. Try again in a few minutes.", 429);
      }
      const m = body.material;
      material = {
        title: String(m.title).slice(0, 200),
        description: m.description ? String(m.description).slice(0, 1000) : null,
        kind: String(m.kind ?? "document"),
        youtube_id: m.youtube_id && /^[A-Za-z0-9_-]{11}$/.test(m.youtube_id) ? m.youtube_id : null,
        external_url: m.external_url ? String(m.external_url).slice(0, 500) : null,
      };
    }

    const clientText = typeof body.source_text === "string" ? body.source_text.slice(0, 20_000) : "";
    const { text: source, grounding } = await sourceFor(db, material, !!user, clientText);
    const n = COUNTS[mode];

    const instructions = mode === "flashcards"
      ? `Write ${n} flashcards. Front: one precise question or term. Back: a complete answer in one to three sentences that a learner can check themselves against. Cover the most important ideas first; no two cards test the same fact.`
      : `Write ${n} multiple-choice questions, each with exactly 4 options and one correct answer (answer_index is 0-3).
- Mix recall with application: ${mode === "mock" ? "at least half should ask the officer to apply, compare or spot an error, like a departmental exam" : "at least two should ask the officer to apply the idea to a realistic case"}.
- Distractors must be plausible mistakes a real officer makes, not obviously wrong.
- Vary the position of the correct answer.
- explanation: why the answer is right and what the most tempting wrong option gets wrong, in two sentences.`;

    const system = `You write practice material for officers of India's Official Statistical System from the study material their department assigned. Plain text only inside fields — no markdown. Never mention the underlying model or vendor.
${GROUNDING_RULE[grounding]}
title: a short title for this ${mode === "mock" ? "mock test" : mode === "flashcards" ? "flashcard deck" : "quiz"}.`;

    // A mock test is written in parallel batches: one 15-question call can run
    // past the function's time limit when the provider is busy, three 5-question
    // calls finish in the time of one. Each batch is hedged against a stall.
    const batches = mode === "mock" ? [5, 5, 5] : [n];
    const results = await Promise.all(batches.map((count, b) => hedged(() => chat<Any>({
      task, userId,
      schema: mode === "flashcards" ? flashcardSchema : questionSchema,
      temperature: 0.4,
      maxTokens: mode === "flashcards" ? 3000 : 800 * count,
      timeoutMs: 60_000,
      retries: 0,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${instructions.replace(`Write ${n} `, `Write ${count} `)}${batches.length > 1
            ? `\n- This is part ${b + 1} of ${batches.length} of one test. Focus on ${["the core definitions and concepts", "procedures, calculations and how the method is applied", "judgement: spotting errors, comparing approaches and edge cases"][b]}.`
            : ""}\n\n=== SOURCE (${material.kind}) ===\n${source}\n=== END SOURCE ===`,
        },
      ],
    }), 25_000).catch((e) => { console.warn(`[study] batch ${b + 1} failed`, e); return null; })));

    const ok = results.filter(Boolean) as ChatResult<Any>[];
    if (!ok.length) throw new Error("Every generation attempt failed");
    const result = {
      model: ok[0].model,
      promptTokens: ok.reduce((a, r) => a + r.promptTokens, 0),
      completionTokens: ok.reduce((a, r) => a + r.completionTokens, 0),
      costUsd: ok.reduce((a, r) => a + r.costUsd, 0),
      latencyMs: Math.max(...ok.map((r) => r.latencyMs)),
    };
    const parsed = {
      title: ok[0].parsed?.title,
      questions: ok.flatMap((r) => r.parsed?.questions ?? []),
      cards: ok.flatMap((r) => r.parsed?.cards ?? []),
    };
    let items: Any[] = mode === "flashcards" ? parsed.cards : parsed.questions;
    if (mode !== "flashcards") {
      items = items.filter((q: Any) => Array.isArray(q.options) && q.options.length >= 2
        && Number.isInteger(q.answer_index) && q.answer_index >= 0 && q.answer_index < q.options.length);
    } else {
      items = items.filter((c: Any) => c.front && c.back);
    }
    if (!items.length) return errorResponse("Could not write practice from this material. Try again.", 502);

    await logGeneration(db, {
      userId, task, model: result.model, promptTokens: result.promptTokens,
      completionTokens: result.completionTokens, costUsd: result.costUsd, latencyMs: result.latencyMs,
      success: true, meta: { material_id: material.id ?? null, grounding, items: items.length, batches: ok.length },
    });

    return jsonResponse({
      mode,
      title: parsed.title || material.title,
      material_title: material.title,
      grounding,
      items,
      time_limit_seconds: mode === "mock" ? items.length * 60 : null,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[study] unhandled", err);
    await logGeneration(db, { userId, task, model: "", success: false, errorMessage: (err as Error)?.message });
    return errorResponse("Could not prepare practice right now. Please try again.", 500, (err as Error)?.message);
  }
});
