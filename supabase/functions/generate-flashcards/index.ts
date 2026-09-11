/**
 * POST /functions/v1/generate-flashcards
 *
 * Turns material (or a competency's weak spots) into atomic recall cards that
 * feed the FSRS scheduler.
 *
 * Card-writing quality is what makes or breaks spaced repetition. Cards that
 * bundle three facts, or that can be answered by pattern-matching the cue,
 * produce the illusion of learning. The prompt enforces the rules good
 * practice converged on: one idea per card, cue forces genuine retrieval,
 * and an elaboration that explains *why* rather than restating *what*.
 */
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { adminClient, userClient, requireUser } from "../_shared/supabase.ts";
import { chat, logGeneration } from "../_shared/openrouter.ts";
import { flashcardSchema } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const admin = adminClient();
  let userId: string | null = null;

  try {
    const user = await requireUser(req);
    userId = user.id;
    const supabase = userClient(req);

    const {
      material_id, raw_text, competency_code,
      count = 15, deck_id, deck_title, language = "en",
    } = await req.json().catch(() => ({}));

    const n = Math.max(1, Math.min(40, Number(count) || 15));

    // ── Source ──────────────────────────────────────────────────────────────
    let sourceText = typeof raw_text === "string" ? raw_text : "";
    let title = deck_title ?? "New deck";

    if (material_id) {
      const { data, error } = await supabase
        .from("materials").select("id, title, extracted_text, status")
        .eq("id", material_id).single();
      if (error || !data) return errorResponse("Material not found", 404, error?.message);
      if (!data.extracted_text) return errorResponse(`Material not ready (status: ${data.status})`, 409);
      sourceText = data.extracted_text;
      title = deck_title ?? data.title;
    }

    if (!sourceText || sourceText.trim().length < 80) {
      return errorResponse("Need source material or `raw_text` of at least ~80 characters.", 400);
    }

    const { data: comps } = await admin
      .from("competencies").select("id, code, name, comp_type").eq("is_active", true).limit(60);
    const compList = (comps ?? []).map((c: any) => `  ${c.code} — ${c.name}`).join("\n");

    let competencyId: string | null = null;
    if (competency_code) {
      competencyId = (comps ?? []).find((c: any) => c.code === competency_code)?.id ?? null;
    }

    // ── Generate ────────────────────────────────────────────────────────────
    const result = await chat<{ cards: any[] }>({
      tier: "fast",
      task: "generate_flashcards",
      userId,
      schema: flashcardSchema,
      temperature: 0.5,
      maxTokens: Math.min(24_000, 700 * n + 1500),
      timeoutMs: 150_000,
      messages: [
        {
          role: "system",
          content: `You write spaced-repetition flashcards for officers in India's Official Statistical System (MoSPI / NSSTA).

Card quality determines whether spaced repetition works at all. Follow these rules strictly.

1. ONE IDEA PER CARD. If the back contains "and" joining two facts, split it into two cards. Atomic cards are recalled reliably; compound cards are not.
2. THE FRONT MUST FORCE RETRIEVAL. "What is stratification?" is weak — it invites a memorised phrase. "Why does stratification reduce variance compared to SRS of the same size?" forces real recall. Prefer why/when/what-happens-if over what-is.
3. NO CUE-GIVEAWAYS. The front must not contain the answer's distinctive wording.
4. THE BACK IS SHORT. One sentence where possible. Long backs are not recalled, they are re-read.
5. ELABORATION CARRIES THE 'WHY'. Explain the mechanism or the consequence. Asking and answering "why is this true" at encoding measurably improves later recall — that is what this field is for.
6. CONCRETE INDIAN CONTEXT where the material supports it: NSS rounds, PLFS, HCES, ASI, IIP, CPI, GVA, NIC/NCO, SQAF, NMDS 2.0.
7. source_quote must be VERBATIM from the material, or an empty string. Never paraphrase into it.
8. Vary Bloom levels — not every card should be `remember`.

Tag each card with the best-fitting FRAC competency code, or "" if none applies:
${compList}

Write in language: ${language}.`,
        },
        {
          role: "user",
          content: `Write exactly ${n} flashcards from this material.\n\n=== MATERIAL ===\n${sourceText.slice(0, 300_000)}\n=== END ===`,
        },
      ],
    });

    const cards = result.parsed?.cards ?? [];
    if (!cards.length) return errorResponse("No flashcards were generated. Try again.", 502);

    // ── Deck ────────────────────────────────────────────────────────────────
    let targetDeck = deck_id as string | undefined;
    if (!targetDeck) {
      const { data, error } = await supabase
        .from("decks")
        .insert({
          owner_id: userId, title,
          description: `Generated from ${material_id ? "uploaded material" : "supplied text"}`,
          material_id: material_id ?? null,
          competency_id: competencyId,
        })
        .select("id").single();
      if (error || !data) return errorResponse("Could not create deck", 500, error?.message);
      targetDeck = data.id;
    }

    const codeToId = new Map((comps ?? []).map((c: any) => [c.code, c.id]));
    const rows = cards
      .filter((c: any) => c?.front?.trim() && c?.back?.trim())
      .map((c: any) => ({
        deck_id: targetDeck,
        user_id: userId,
        front: String(c.front).trim(),
        back: String(c.back).trim(),
        hint: c.hint?.trim() || null,
        elaboration: c.elaboration?.trim() || null,
        competency_id: codeToId.get(c.competency_code) ?? competencyId,
        source_material_id: material_id ?? null,
        source_quote: c.source_quote?.trim() || null,
        bloom: ["remember","understand","apply","analyze","evaluate","create"].includes(c.bloom)
          ? c.bloom : "remember",
        // FSRS: every card starts `new` and due immediately.
        state: "new",
        due: new Date().toISOString(),
      }));

    const { error: cErr } = await supabase.from("flashcards").insert(rows);
    if (cErr) return errorResponse("Could not save flashcards", 500, cErr.message);

    await logGeneration(admin, {
      userId, task: "generate_flashcards", model: result.model,
      promptTokens: result.promptTokens, completionTokens: result.completionTokens,
      costUsd: result.costUsd, latencyMs: result.latencyMs, success: true,
      meta: { deck_id: targetDeck, cards: rows.length },
    });

    return jsonResponse({
      deck_id: targetDeck,
      card_count: rows.length,
      usage: { model: result.model, cost_usd: result.costUsd, latency_ms: result.latencyMs },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[generate-flashcards] unhandled", err);
    return errorResponse("Flashcard generation failed", 500, (err as Error)?.message);
  }
});
