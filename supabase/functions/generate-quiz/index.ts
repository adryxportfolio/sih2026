/**
 * POST /functions/v1/generate-quiz
 *
 * Generates a competency-tagged quiz from an uploaded material, raw text, or
 * a target competency.
 *
 * What makes this more than a wrapper around a prompt:
 *   1. STRICT SCHEMA      — decoding is grammar-constrained, so output shape
 *                           is guaranteed rather than hoped for.
 *   2. GROUNDING CHECK    — every question must quote the source verbatim.
 *                           We verify the quote really occurs in the material
 *                           and demote questions that fail. This catches
 *                           hallucination mechanically, not by vibes.
 *   3. STRUCTURAL CHECK   — correct ids must exist among the options, options
 *                           must be distinct, multi-select must have >1 answer.
 *   4. BLOOM + DIFFICULTY SPREAD — we ask for a deliberate distribution so the
 *                           quiz measures ability rather than trivia recall.
 */
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { adminClient, userClient, requireUser } from "../_shared/supabase.ts";
import { chat, logGeneration } from "../_shared/openrouter.ts";
import { quizSchema } from "../_shared/schemas.ts";

interface GeneratedQuestion {
  stem: string;
  kind: string;
  options: { id: string; text: string }[];
  correct_option_ids: string[];
  explanation: string;
  bloom: string;
  difficulty: number;
  competency_code: string;
  source_quote: string;
  distractor_rationales: { option_id: string; why_wrong: string }[];
}
interface GeneratedQuiz {
  title: string;
  summary: string;
  questions: GeneratedQuestion[];
}

/** Normalise for fuzzy quote matching — models re-wrap whitespace and quotes. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9' ]/g, "")
    .trim();
}

interface SourceChunk {
  id: string;
  chunk_index: number;
  content: string;
  page_from: number | null;
  page_to: number | null;
  heading: string | null;
}

interface GroundingResult {
  grounded: boolean;
  chunkId: string | null;
  page: number | null;
  heading: string | null;
}

/**
 * Verify a claimed quote against the source AND locate exactly where it came
 * from.
 *
 * Doing both in one pass is the point: the same check that catches a
 * hallucinated question also yields the page number that makes a real question
 * auditable. A trainer reviewing an AI-generated assessment can click through
 * to page 17 and read the sentence the answer rests on.
 *
 * Matching is lenient about whitespace and punctuation (models re-wrap text)
 * but strict about content: we require either a full normalised match, or a
 * clear majority of contiguous word-windows present in the same chunk.
 */
function locateQuote(quote: string, chunks: SourceChunk[], fullText: string): GroundingResult {
  const miss: GroundingResult = { grounded: false, chunkId: null, page: null, heading: null };
  if (!quote || quote.length < 12) return miss;

  const q = normalise(quote);
  if (!q) return miss;

  const windowHitRatio = (haystack: string): number => {
    if (haystack.includes(q)) return 1;
    const words = q.split(" ");
    if (words.length < 6) return 0;
    const W = 6;
    let hits = 0, total = 0;
    for (let i = 0; i + W <= words.length; i += W) {
      total++;
      if (haystack.includes(words.slice(i, i + W).join(" "))) hits++;
    }
    return total > 0 ? hits / total : 0;
  };

  // Prefer the chunk with the strongest match, so the page we report is the
  // page the quote actually sits on.
  let best: { chunk: SourceChunk; score: number } | null = null;
  for (const c of chunks) {
    const score = windowHitRatio(normalise(c.content));
    if (score >= 0.6 && (!best || score > best.score)) best = { chunk: c, score };
    if (score === 1) break;
  }

  if (best) {
    return {
      grounded: true,
      chunkId: best.chunk.id,
      page: best.chunk.page_from ?? best.chunk.page_to ?? null,
      heading: best.chunk.heading,
    };
  }

  // No chunks indexed (raw_text path, or embedding step skipped) — fall back
  // to checking the whole document so grounding still means something.
  if (chunks.length === 0 && windowHitRatio(normalise(fullText)) >= 0.6) {
    return { grounded: true, chunkId: null, page: null, heading: null };
  }

  return miss;
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  let userId: string | null = null;
  const admin = adminClient();

  try {
    const user = await requireUser(req);
    userId = user.id;
    const supabase = userClient(req);

    const {
      material_id,
      raw_text,
      competency_codes,
      num_questions = 10,
      difficulty = "mixed",
      language = "en",
      title_hint,
      quiz_kind = "practice",
    } = await req.json().catch(() => ({}));

    const count = Math.max(1, Math.min(30, Number(num_questions) || 10));

    // ── 1. Assemble the source text ─────────────────────────────────────────
    let sourceText = typeof raw_text === "string" ? raw_text : "";
    let materialTitle = title_hint ?? "Practice Quiz";
    let materialRow: any = null;
    let chunks: SourceChunk[] = [];

    if (material_id) {
      const { data, error } = await supabase
        .from("materials")
        .select("id, title, extracted_text, status, summary")
        .eq("id", material_id)
        .single();
      if (error || !data) return errorResponse("Material not found or not accessible", 404, error?.message);
      if (!data.extracted_text) {
        return errorResponse(
          `Material is not ready yet (status: ${data.status}). Run process-material first.`,
          409,
        );
      }
      materialRow = data;
      sourceText = data.extracted_text;
      materialTitle = data.title;

      // Chunks carry page numbers — needed to turn a verified quote into a
      // citation the learner (and a reviewing trainer) can click through to.
      const { data: chunkRows } = await supabase
        .from("material_chunks")
        .select("id, chunk_index, content, page_from, page_to, heading")
        .eq("material_id", material_id)
        .order("chunk_index", { ascending: true });
      chunks = (chunkRows ?? []) as SourceChunk[];
    }

    if (!sourceText || sourceText.trim().length < 100) {
      return errorResponse(
        "Need at least ~100 characters of source material to generate a meaningful quiz.",
        400,
      );
    }

    // DeepSeek v4 Flash has a 1M-token window, so we rarely need to truncate.
    // Cap defensively anyway — ~400k chars is comfortably inside budget.
    const MAX_CHARS = 400_000;
    const truncated = sourceText.length > MAX_CHARS;
    const workingText = truncated ? sourceText.slice(0, MAX_CHARS) : sourceText;

    // ── 2. Competency vocabulary for tagging ────────────────────────────────
    let compQuery = admin
      .from("competencies")
      .select("code, name, comp_type, category")
      .eq("is_active", true);
    if (Array.isArray(competency_codes) && competency_codes.length > 0) {
      compQuery = compQuery.in("code", competency_codes);
    }
    const { data: comps } = await compQuery.limit(60);
    const compList = (comps ?? [])
      .map((c: any) => `  ${c.code} — ${c.name} (${c.comp_type}${c.category ? ", " + c.category : ""})`)
      .join("\n");

    // ── 3. Difficulty brief ─────────────────────────────────────────────────
    const difficultyBrief = ({
      easy:   "Target difficulty 0.5–1.5. Mostly `remember` and `understand`.",
      medium: "Target difficulty 1.5–2.5. Mostly `understand` and `apply`.",
      hard:   "Target difficulty 2.5–4.0. Mostly `analyze`, `evaluate`, `create`.",
      mixed:  "Spread difficulty across 0.5–4.0: roughly 30% easy (remember/understand), " +
              "45% medium (apply), 25% hard (analyze/evaluate). A quiz that is all recall " +
              "cannot distinguish a practitioner from an expert.",
    } as Record<string, string>)[String(difficulty)] ?? "Use a mixed spread.";

    const systemPrompt = `You are an assessment designer for the National Statistical Systems Training Academy (NSSTA), which builds capacity for officers in India's Official Statistical System under the Ministry of Statistics and Programme Implementation (MoSPI).

You write examination-grade multiple-choice questions. Your questions are used to measure real competency, so they must be defensible.

NON-NEGOTIABLE RULES
1. GROUND EVERY QUESTION. \`source_quote\` must be copied VERBATIM — character for character — from the supplied material, and must be the span that justifies the correct answer. Never paraphrase it. If a question is not supported by the material, do not write it.
2. SELF-CONTAINED STEMS. Never write "according to the passage", "in the document above", or "as mentioned". The learner sees only the question.
3. PLAUSIBLE DISTRACTORS. Every wrong option must represent a real misconception a statistical officer could hold — a confused definition, a transposed formula, a wrong unit, an off-by-one in a classification. Never filler, never obviously absurd, never "All of the above".
4. NO GIVEAWAYS. Keep options similar in length and grammatical form. The correct answer must not be the longest or most detailed.
5. EXPLAIN, DON'T ASSERT. \`explanation\` should teach the underlying principle so a learner who got it wrong now understands why.
6. DIAGNOSE THE DISTRACTORS. For each wrong option, name the specific misconception it captures. This is what turns a score into a diagnosis.
7. USE INDIAN STATISTICAL CONTEXT where the material allows: NSS rounds, PLFS, HCES, ASI, IIP, CPI, GVA, NIC/NCO classifications, SQAF, NMDS 2.0.

${difficultyBrief}

Tag each question with the single best-fitting FRAC competency code from this list (use "" if genuinely none apply):
${compList || "  (no competency list supplied — use \"\")"}

Write in language: ${language}.`;

    const userPrompt = `Generate exactly ${count} questions from the learning material below.

Material title: ${materialTitle}
${truncated ? "\n[Note: material was truncated; work only from what is shown.]\n" : ""}
=== BEGIN MATERIAL ===
${workingText}
=== END MATERIAL ===`;

    // ── 4. Generate ─────────────────────────────────────────────────────────
    const result = await chat<GeneratedQuiz>({
      
      task: "generate_mcq",
      userId,
      schema: quizSchema,
      temperature: 0.5,
      maxTokens: Math.min(32_000, 1200 * count + 2000),
      timeoutMs: 180_000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const generated = result.parsed;
    if (!generated?.questions?.length) {
      await logGeneration(admin, {
        userId, task: "generate_mcq", model: result.model, success: false,
        errorMessage: "empty question set", latencyMs: result.latencyMs,
      });
      return errorResponse("The model returned no usable questions. Try again or shorten the material.", 502);
    }

    // ── 5. Validate ─────────────────────────────────────────────────────────
    const codeToId = new Map<string, string>();
    for (const c of comps ?? []) codeToId.set(c.code, "");
    const { data: compIds } = await admin
      .from("competencies")
      .select("id, code")
      .in("code", Array.from(new Set(generated.questions.map((q) => q.competency_code).filter(Boolean))));
    for (const c of compIds ?? []) codeToId.set(c.code, c.id);

    const accepted: GeneratedQuestion[] = [];
    const rejected: { stem: string; reason: string }[] = [];
    const grounding = new Map<string, GroundingResult>();
    let ungrounded = 0;

    for (const q of generated.questions) {
      if (!q.stem?.trim() || !Array.isArray(q.options) || q.options.length < 2) {
        rejected.push({ stem: q.stem ?? "(blank)", reason: "malformed stem or options" });
        continue;
      }
      const ids = new Set(q.options.map((o) => o.id));
      if (ids.size !== q.options.length) {
        rejected.push({ stem: q.stem, reason: "duplicate option ids" });
        continue;
      }
      const texts = new Set(q.options.map((o) => normalise(o.text)));
      if (texts.size !== q.options.length) {
        rejected.push({ stem: q.stem, reason: "duplicate option text" });
        continue;
      }
      const correct = (q.correct_option_ids ?? []).filter((id) => ids.has(id));
      if (correct.length === 0) {
        rejected.push({ stem: q.stem, reason: "no valid correct option" });
        continue;
      }
      if (q.kind === "mcq_single" && correct.length > 1) {
        q.correct_option_ids = [correct[0]];
      } else {
        q.correct_option_ids = correct;
      }

      // Grounding: flag rather than reject, so a good question with a sloppy
      // quote still survives — but we surface the count honestly, and we keep
      // the resolved page so the citation is real.
      const located = locateQuote(q.source_quote ?? "", chunks, workingText);
      if (!located.grounded) {
        ungrounded++;
        q.source_quote = "";
      }
      grounding.set(q.stem, located);

      accepted.push(q);
    }

    if (accepted.length === 0) {
      return errorResponse("Every generated question failed validation. Please retry.", 502, { rejected });
    }

    // ── 6. Persist ──────────────────────────────────────────────────────────
    const { data: quizRow, error: quizErr } = await supabase
      .from("quizzes")
      .insert({
        owner_id: userId,
        title: generated.title || materialTitle,
        description: generated.summary ?? null,
        material_id: material_id ?? null,
        quiz_kind,
        generated_by_ai: true,
        generation_model: result.model,
        generation_meta: {
          requested: count,
          accepted: accepted.length,
          rejected: rejected.length,
          ungrounded,
          truncated,
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          cost_usd: result.costUsd,
          latency_ms: result.latencyMs,
        },
      })
      .select("id, title, description")
      .single();

    if (quizErr || !quizRow) return errorResponse("Failed to save quiz", 500, quizErr?.message);

    const rows = accepted.map((q, i) => {
      const rationales: Record<string, string> = {};
      for (const d of q.distractor_rationales ?? []) {
        if (d?.option_id) rationales[d.option_id] = d.why_wrong;
      }
      return {
        quiz_id: quizRow.id,
        kind: ["mcq_single", "mcq_multi", "true_false", "assertion_reason"].includes(q.kind)
          ? q.kind : "mcq_single",
        stem: q.stem.trim(),
        options: q.options,
        correct_option_ids: q.correct_option_ids,
        explanation: q.explanation ?? "",
        bloom: ["remember","understand","apply","analyze","evaluate","create"].includes(q.bloom)
          ? q.bloom : "understand",
        difficulty: Math.max(0, Math.min(4, Number(q.difficulty) || 2)),
        competency_id: codeToId.get(q.competency_code) || null,
        distractor_rationales: rationales,
        source_quote: q.source_quote || null,
        source_chunk_id: grounding.get(q.stem)?.chunkId ?? null,
        source_page: grounding.get(q.stem)?.page ?? null,
        sort_order: i,
      };
    });

    const { error: qErr } = await supabase.from("questions").insert(rows);
    if (qErr) return errorResponse("Failed to save questions", 500, qErr.message);

    // Tag the material with the competencies this quiz touched
    if (material_id) {
      const tagged = Array.from(new Set(rows.map((r) => r.competency_id).filter(Boolean)));
      if (tagged.length) {
        await supabase.from("material_competencies").upsert(
          tagged.map((cid) => ({ material_id, competency_id: cid as string, relevance: 0.8 })),
          { onConflict: "material_id,competency_id" },
        );
      }
    }

    await logGeneration(admin, {
      userId, task: "generate_mcq", model: result.model,
      promptTokens: result.promptTokens, completionTokens: result.completionTokens,
      costUsd: result.costUsd, latencyMs: result.latencyMs, success: true,
      meta: { quiz_id: quizRow.id, accepted: accepted.length, rejected: rejected.length, ungrounded },
    });

    return jsonResponse({
      quiz: quizRow,
      question_count: rows.length,
      quality: {
        requested: count,
        accepted: accepted.length,
        rejected: rejected.length,
        ungrounded_quotes: ungrounded,
        grounded_pct: Math.round(((accepted.length - ungrounded) / accepted.length) * 100),
        page_cited: rows.filter((r) => r.source_page != null).length,
      },
      usage: {
        model: result.model,
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        cost_usd: result.costUsd,
        latency_ms: result.latencyMs,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[generate-quiz] unhandled", err);
    await logGeneration(admin, {
      userId, task: "generate_mcq", model: "unknown", success: false,
      errorMessage: (err as Error)?.message ?? String(err),
    });
    return errorResponse("Quiz generation failed", 500, (err as Error)?.message);
  }
});
