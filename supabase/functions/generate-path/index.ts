/**
 * POST /functions/v1/generate-path
 *
 * The "recommends personalised training through integration with the iGOT
 * Karmayogi ecosystem" half of the problem statement.
 *
 * Pipeline:
 *   1. Recompute gaps deterministically (SQL)
 *   2. Pull matching iGOT/Sunbird courses through the adapter
 *   3. Ask the reasoning model to SEQUENCE them using learning science
 *   4. Persist a path whose every step carries a stated reason
 *
 * The sequencing constraints we impose are not decoration — each is a
 * replicated finding from the learning-science literature, and they are in
 * the prompt because an LLM left to itself produces a topic list, not a
 * curriculum.
 */
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { adminClient, userClient, requireUser } from "../_shared/supabase.ts";
import { chat, logGeneration } from "../_shared/openrouter.ts";
import { learningPathSchema } from "../_shared/schemas.ts";
import { findCoursesForCompetencies, igotMode, type IgotCourse } from "../_shared/igot.ts";

interface PathPlan {
  title: string;
  summary: string;
  rationale: string;
  estimated_minutes: number;
  items: {
    kind: string;
    title: string;
    description: string;
    why_this: string;
    competency_code: string;
    estimated_minutes: number;
    course_external_id: string;
    search_query: string;
  }[];
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const admin = adminClient();
  let userId: string | null = null;

  try {
    const user = await requireUser(req);
    userId = user.id;
    const supabase = userClient(req);

    const { focus_competency_codes, weeks = 6, max_items = 12 } = await req.json().catch(() => ({}));

    await supabase.rpc("recompute_competency_gaps", { p_user_id: userId });

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, designation, job_role_id, daily_goal_minutes, preferred_language")
      .eq("id", userId).single();

    if (!profile?.job_role_id) {
      return errorResponse("Complete onboarding and select your role first.", 409, { needs_onboarding: true });
    }

    const { data: jobRole } = await admin
      .from("job_roles").select("code, name, grade_level").eq("id", profile.job_role_id).single();

    // ── 1. Learnable frontier (ZPD) ─────────────────────────────────────────
    // Ordering by prerequisite-aware readiness rather than raw gap size, so we
    // never schedule a topic the officer cannot yet start.
    const { data: zpd } = await supabase.rpc("get_zpd_competencies", {
      p_user_id: userId, p_limit: 10,
    });

    let gapQ = supabase
      .from("competency_gaps")
      .select(`gap_size, priority_score, is_critical, required_level, current_level,
               competencies!inner ( id, code, name, comp_type, description )`)
      .eq("user_id", userId)
      .gt("gap_size", 0)
      .order("priority_score", { ascending: false })
      .limit(8);

    const { data: gaps } = await gapQ;
    let working = gaps ?? [];

    if (Array.isArray(focus_competency_codes) && focus_competency_codes.length) {
      const focus = new Set(focus_competency_codes);
      const filtered = working.filter((g: any) => focus.has(g.competencies.code));
      if (filtered.length) working = filtered;
    }

    if (!working.length) {
      return errorResponse(
        "No open competency gaps found. Take a diagnostic assessment first so we know what to recommend.",
        409,
        { needs_assessment: true },
      );
    }

    const gapCodes = working.map((g: any) => g.competencies.code);

    // ── 2. iGOT catalogue ───────────────────────────────────────────────────
    const igotCourses: IgotCourse[] = await findCoursesForCompetencies(gapCodes, 14);

    // Mirror them locally so path items can FK to a real course row
    const courseIdByExternal = new Map<string, string>();
    if (igotCourses.length) {
      const { data: upserted } = await admin
        .from("courses")
        .upsert(
          igotCourses.map((c) => ({
            external_id: c.externalId,
            source: "igot",
            title: c.title,
            description: c.description,
            provider: c.provider,
            thumbnail_url: c.thumbnailUrl,
            content_url: c.contentUrl,
            language: c.language,
            duration_minutes: c.durationMinutes,
            difficulty: c.difficulty,
            rating: c.rating,
            enrolled_count: c.enrolledCount,
            raw: c.raw,
            synced_at: new Date().toISOString(),
          })),
          { onConflict: "source,external_id" },
        )
        .select("id, external_id");
      for (const c of upserted ?? []) courseIdByExternal.set(c.external_id, c.id);

      // Link courses to the competencies they develop
      const { data: compRows } = await admin
        .from("competencies").select("id, code")
        .in("code", Array.from(new Set(igotCourses.flatMap((c) => c.competencyCodes))));
      const compIdByCode = new Map((compRows ?? []).map((c: any) => [c.code, c.id]));

      const links = igotCourses.flatMap((c) => {
        const cid = courseIdByExternal.get(c.externalId);
        if (!cid) return [];
        return c.competencyCodes
          .filter((code) => compIdByCode.has(code))
          .map((code) => ({
            course_id: cid,
            competency_id: compIdByCode.get(code) as string,
            relevance: 0.9,
          }));
      });
      if (links.length) {
        await admin.from("course_competencies").upsert(links, { onConflict: "course_id,competency_id" });
      }
    }

    // ── 3. Plan ─────────────────────────────────────────────────────────────
    const zpdByCode = new Map(
      (zpd ?? []).map((z: any) => [z.code, z]),
    );

    const gapBrief = working.map((g: any) =>
      {
        const z = zpdByCode.get(g.competencies.code);
        const readiness = z ? Math.round((z.readiness ?? 1) * 100) : 100;
        const blocked = (z?.blocked_by ?? []) as string[];
        return `- ${g.competencies.code} | ${g.competencies.name}
    required ${g.required_level}, currently ${g.current_level}, gap ${Number(g.gap_size).toFixed(2)}${g.is_critical ? " [CRITICAL]" : ""}
    readiness ${readiness}%${blocked.length ? ` — BLOCKED until: ${blocked.join(", ")}` : " — prerequisites met"}
    ${g.competencies.description ?? ""}`;
      }).join("\n");

    const courseBrief = igotCourses.length
      ? igotCourses.map((c) =>
          `- id:${c.externalId} | "${c.title}" | ${c.provider} | ${c.durationMinutes}min | ${c.difficulty} | rating ${c.rating ?? "—"} | competencies: ${c.competencyCodes.join(", ")}`,
        ).join("\n")
      : "  (no matching iGOT courses available)";

    const dailyMinutes = profile.daily_goal_minutes ?? 20;
    const totalBudget = dailyMinutes * 5 * Number(weeks); // 5 study days/week

    const result = await chat<PathPlan>({
      tier: "reasoning",
      task: "generate_path",
      userId,
      schema: learningPathSchema,
      temperature: 0.5,
      maxTokens: 8000,
      timeoutMs: 150_000,
      messages: [
        {
          role: "system",
          content: `You design personalised capacity-building plans for officers in India's Official Statistical System, drawing on the iGOT Karmayogi course ecosystem.

You are a learning scientist, not a content lister. Sequence the plan using these evidence-based constraints:

1. SPACING OVER MASSING. Distribute work on a competency across the plan rather than finishing it in one block. Revisiting material after a delay produces markedly better long-term retention than the same total time spent consecutively.
2. INTERLEAVE RELATED COMPETENCIES. Alternate between related competencies instead of completing one fully before starting the next. It feels harder and produces better transfer — a desirable difficulty.
3. TESTING EFFECT. Follow every substantial input step (course/video/reading) with a retrieval step (quiz/flashcards/practice). Retrieving knowledge strengthens it far more than re-reading. Never place two input steps back to back without retrieval between them.
4. RESPECT THE PREREQUISITE GRAPH. Each gap below carries a readiness score and, where relevant, what blocks it. NEVER schedule a blocked competency before its blocker. A blocked topic scheduled early produces failure, not learning.
5. START WITH A WIN. The first item should be achievable in one sitting — early completion drives follow-through.
6. END WITH CONSOLIDATION. Close with a reflection or mixed cumulative practice step.

RULES
· Use ONLY the iGOT course ids supplied. If you reference a course, set kind="course" and put its exact id in course_external_id. Otherwise set course_external_id to "".
· For kind="video", write a precise YouTube search query aimed at tutoring content for that concept. Otherwise set search_query to "".
· For kind="quiz"/"flashcard_deck"/"practice"/"reflection", both id fields are "".
· Use only competency codes from the gap list.
· Keep the total within roughly ${totalBudget} minutes (${dailyMinutes} min/day, 5 days/week, ${weeks} weeks).
· At most ${max_items} items.
· `why_this` must reference this officer's actual gap or the sequencing logic — never generic filler.
· Write in language: ${profile.preferred_language ?? "en"}.`,
        },
        {
          role: "user",
          content: `OFFICER
${profile.full_name ?? "Officer"} — ${profile.designation ?? "—"}
FRAC role: ${jobRole?.name ?? "—"} (${jobRole?.code ?? "—"})
Study capacity: ${dailyMinutes} minutes/day over ${weeks} weeks (~${totalBudget} min total)

COMPETENCY GAPS (most urgent first)
${gapBrief}

AVAILABLE iGOT KARMAYOGI COURSES
${courseBrief}

Design the plan.`,
        },
      ],
    });

    const plan = result.parsed;
    if (!plan?.items?.length) {
      return errorResponse("Path generation failed — the model returned no steps.", 502);
    }

    // ── 4. Persist ──────────────────────────────────────────────────────────
    const { data: compRows2 } = await admin
      .from("competencies").select("id, code")
      .in("code", Array.from(new Set(plan.items.map((i) => i.competency_code).filter(Boolean))));
    const compIdByCode2 = new Map((compRows2 ?? []).map((c: any) => [c.code, c.id]));

    // Supersede any previous active path so the learner has one clear plan
    await supabase.from("learning_paths")
      .update({ status: "superseded" }).eq("user_id", userId).eq("status", "active");

    const { data: pathRow, error: pErr } = await supabase
      .from("learning_paths")
      .insert({
        user_id: userId,
        title: plan.title,
        summary: plan.summary,
        rationale: plan.rationale,
        target_competency_ids: working
          .map((g: any) => g.competencies.id).filter(Boolean),
        estimated_minutes: Math.round(Number(plan.estimated_minutes) || totalBudget),
        generated_model: result.model,
        generation_meta: {
          igot_mode: igotMode(),
          igot_courses_considered: igotCourses.length,
          weeks, cost_usd: result.costUsd, latency_ms: result.latencyMs,
        },
      })
      .select("id, title, summary, rationale, estimated_minutes")
      .single();

    if (pErr || !pathRow) return errorResponse("Failed to save learning path", 500, pErr?.message);

    const validKinds = ["course","video","quiz","material","flashcard_deck","practice","reflection"];
    const items = plan.items.slice(0, max_items).map((it, i) => ({
      path_id: pathRow.id,
      kind: validKinds.includes(it.kind) ? it.kind : "practice",
      title: it.title,
      description: it.description ?? null,
      why_this: it.why_this ?? null,
      course_id: it.course_external_id ? (courseIdByExternal.get(it.course_external_id) ?? null) : null,
      competency_id: compIdByCode2.get(it.competency_code) ?? null,
      estimated_minutes: Math.max(1, Math.round(Number(it.estimated_minutes) || 20)),
      sort_order: i,
    }));

    const { error: iErr } = await supabase.from("path_items").insert(items);
    if (iErr) return errorResponse("Failed to save path steps", 500, iErr.message);

    // Video steps carry their search query so the client can curate on demand
    const videoQueries = plan.items
      .map((it, i) => ({ i, kind: it.kind, q: it.search_query }))
      .filter((v) => v.kind === "video" && v.q);

    await supabase.from("activity_events").insert({
      user_id: userId, event_type: "path_generated",
      entity_type: "learning_path", entity_id: pathRow.id,
      meta: { items: items.length, igot_mode: igotMode() },
    });

    await logGeneration(admin, {
      userId, task: "generate_path", model: result.model,
      promptTokens: result.promptTokens, completionTokens: result.completionTokens,
      costUsd: result.costUsd, latencyMs: result.latencyMs, success: true,
      meta: { path_id: pathRow.id, items: items.length },
    });

    return jsonResponse({
      path: pathRow,
      item_count: items.length,
      video_queries: videoQueries,
      igot: { mode: igotMode(), courses_considered: igotCourses.length },
      usage: { model: result.model, cost_usd: result.costUsd, latency_ms: result.latencyMs },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[generate-path] unhandled", err);
    return errorResponse("Learning path generation failed", 500, (err as Error)?.message);
  }
});
