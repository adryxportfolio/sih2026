/**
 * POST /functions/v1/tutor
 *
 * A Socratic tutor grounded in the learner's own uploaded material.
 *
 * Retrieval-augmented: we embed the question with the same `gte-small` model
 * used at ingest, pull the nearest chunks, and require the model to cite them.
 * The reply carries a `confidence` field distinguishing "this is in your
 * material" from "this is general knowledge" — a learner preparing for a
 * departmental exam needs to know which is which.
 */
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { adminClient, userClient, requireUser } from "../_shared/supabase.ts";
import { chat, logGeneration } from "../_shared/openrouter.ts";
import { tutorSchema } from "../_shared/schemas.ts";

// deno-lint-ignore no-explicit-any
declare const Supabase: any;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const admin = adminClient();
  let userId: string | null = null;

  try {
    const user = await requireUser(req);
    userId = user.id;
    const supabase = userClient(req);

    const { conversation_id, message, material_id, competency_code } = await req.json().catch(() => ({}));
    if (!message || typeof message !== "string" || !message.trim()) {
      return errorResponse("`message` is required", 400);
    }

    // ── 1. Conversation ─────────────────────────────────────────────────────
    let convId = conversation_id as string | undefined;
    if (!convId) {
      const { data, error } = await supabase
        .from("tutor_conversations")
        .insert({
          user_id: userId,
          title: message.slice(0, 60),
          material_id: material_id ?? null,
        })
        .select("id").single();
      if (error || !data) return errorResponse("Could not start conversation", 500, error?.message);
      convId = data.id;
    }

    await supabase.from("tutor_messages").insert({
      conversation_id: convId, user_id: userId, role: "user", content: message,
    });

    // ── 2. Retrieve grounding chunks ────────────────────────────────────────
    let contextBlock = "";
    let retrieved: { chunk_index: number; content: string; similarity: number }[] = [];

    if (material_id) {
      try {
        const session = new Supabase.ai.Session("gte-small");
        const queryEmbedding = await session.run(message, { mean_pool: true, normalize: true });

        const { data: matches } = await supabase.rpc("match_material_chunks", {
          p_material_id: material_id,
          p_query_embedding: queryEmbedding,
          p_match_count: 6,
          p_min_similarity: 0.2,
        });
        retrieved = matches ?? [];
      } catch (e) {
        console.warn("[tutor] retrieval failed, answering without grounding", e);
      }

      if (retrieved.length) {
        contextBlock = retrieved.map((m: any) =>
          `[chunk ${m.chunk_index}${m.heading ? ` · ${m.heading}` : ""}] (similarity ${Number(m.similarity).toFixed(2)})\n${m.content}`,
        ).join("\n\n---\n\n");
      }
    }

    // ── 3. Recent turns for continuity ──────────────────────────────────────
    const { data: history } = await supabase
      .from("tutor_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(9);

    const priorTurns = (history ?? []).reverse().slice(0, -1)
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const { data: profile } = await supabase
      .from("profiles").select("full_name, designation, preferred_language").eq("id", userId).single();

    // ── 4. Answer ───────────────────────────────────────────────────────────
    const result = await chat<{
      answer: string;
      citations: { chunk_index: number; quote: string }[];
      follow_up_questions: string[];
      confidence: string;
    }>({
      tier: contextBlock ? "fast" : "reasoning",
      task: "tutor_reply",
      userId,
      schema: tutorSchema,
      temperature: 0.4,
      maxTokens: 4000,
      messages: [
        {
          role: "system",
          content: `You are a patient, expert tutor for officers of India's Official Statistical System (MoSPI / NSSTA).

HOW YOU TEACH
· Explain clearly, then check understanding. Prefer a worked example over an abstract definition.
· Use Indian statistical context where natural — NSS, PLFS, HCES, ASI, IIP, CPI, GVA, NIC/NCO, SQAF.
· When the learner is wrong, say so plainly and kindly, then show why. Never let a misconception stand to be agreeable.
· Do not simply hand over answers to practice questions. Give the next step and let them attempt it.
· End with follow-up questions that make them RETRIEVE, not re-read. Retrieval practice is the single strongest study intervention we have.

GROUNDING RULES
${contextBlock
  ? `· Material from the learner's own upload is supplied below. Prefer it, and cite the chunk indices you used.
· If the material genuinely doesn't cover the question, say so and set confidence="general_knowledge" before answering from expertise.
· Never invent a citation. Only cite chunks that appear below.`
  : `· No source material is attached, so answer from expertise and set confidence="general_knowledge".`}

Write in language: ${profile?.preferred_language ?? "en"}. Format the answer in markdown.`,
        },
        ...priorTurns,
        {
          role: "user",
          content: contextBlock
            ? `=== MATERIAL FROM MY UPLOAD ===\n${contextBlock}\n=== END MATERIAL ===\n\nMy question: ${message}`
            : message,
        },
      ],
    });

    const r = result.parsed;
    if (!r?.answer) return errorResponse("Tutor could not produce a reply. Please retry.", 502);

    // Drop any citation pointing at a chunk we didn't actually retrieve
    const validIdx = new Set(retrieved.map((m: any) => m.chunk_index));
    const citations = (r.citations ?? []).filter((c) => validIdx.has(c.chunk_index));

    await supabase.from("tutor_messages").insert({
      conversation_id: convId, user_id: userId, role: "assistant",
      content: r.answer, citations, model: result.model,
    });
    await supabase.from("tutor_conversations")
      .update({ updated_at: new Date().toISOString() }).eq("id", convId);

    await logGeneration(admin, {
      userId, task: "tutor_reply", model: result.model,
      promptTokens: result.promptTokens, completionTokens: result.completionTokens,
      costUsd: result.costUsd, latencyMs: result.latencyMs, success: true,
      meta: { conversation_id: convId, chunks_retrieved: retrieved.length, confidence: r.confidence },
    });

    return jsonResponse({
      conversation_id: convId,
      answer: r.answer,
      citations,
      follow_up_questions: r.follow_up_questions ?? [],
      confidence: r.confidence ?? "general_knowledge",
      chunks_retrieved: retrieved.length,
      usage: { model: result.model, cost_usd: result.costUsd, latency_ms: result.latencyMs },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[tutor] unhandled", err);
    return errorResponse("Tutor request failed", 500, (err as Error)?.message);
  }
});
