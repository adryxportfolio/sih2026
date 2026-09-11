/**
 * POST /functions/v1/diagnose-competency
 *
 * The "identifies competency gaps" half of the problem statement.
 *
 * Two layers, deliberately:
 *   DETERMINISTIC  SQL computes the gap arithmetic — required level minus
 *                  measured proficiency, weighted by importance and damped by
 *                  how much evidence we actually have. Reproducible, auditable,
 *                  and identical for every officer with the same record.
 *   INTERPRETIVE   The reasoning model then explains the numbers: what the
 *                  pattern means for this person's job, and what to do first.
 *
 * Keeping the maths out of the model matters. A capacity-building decision in
 * government has to be defensible; "the model said so" is not a defence.
 */
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { adminClient, userClient, requireUser } from "../_shared/supabase.ts";
import { chat, logGeneration } from "../_shared/openrouter.ts";
import { diagnosisSchema } from "../_shared/schemas.ts";

interface Diagnosis {
  overall_summary: string;
  strengths: { competency_code: string; note: string }[];
  priority_gaps: {
    competency_code: string;
    rationale: string;
    impact_on_role: string;
    suggested_first_step: string;
  }[];
  recommended_focus_weeks: number;
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

    // ── 1. Recompute the deterministic gap arithmetic ───────────────────────
    const { error: rpcErr } = await supabase.rpc("recompute_competency_gaps", { p_user_id: userId });
    if (rpcErr) console.warn("[diagnose] recompute failed", rpcErr.message);

    // ── 2. Gather the evidence ──────────────────────────────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, designation, years_of_service, job_role_id, daily_goal_minutes, preferred_language")
      .eq("id", userId)
      .single();

    if (!profile?.job_role_id) {
      return errorResponse(
        "No job role set. Complete onboarding and pick your role so we can measure you against its FRAC requirements.",
        409,
        { needs_onboarding: true },
      );
    }

    const { data: jobRole } = await admin
      .from("job_roles").select("code, name, grade_level, description").eq("id", profile.job_role_id).single();

    const { data: gaps } = await supabase
      .from("competency_gaps")
      .select(`
        gap_size, priority_score, is_critical, required_level, current_level,
        competencies!inner ( code, name, comp_type, category, description )
      `)
      .eq("user_id", userId)
      .order("priority_score", { ascending: false });

    const { data: scores } = await supabase
      .from("user_competency_scores")
      .select("score, confidence, correct_count, total_count, competencies!inner ( code, name )")
      .eq("user_id", userId);

    // Recurring misconceptions — the same false belief demonstrated more than
    // once. Far more actionable than "scored 60%".
    const { data: misconceptions } = await supabase
      .from("v_recurring_misconceptions")
      .select("competency_code, competency_name, misconception, occurrences, last_seen")
      .eq("user_id", userId)
      .order("occurrences", { ascending: false })
      .limit(8);

    // Learnable frontier: gaps whose prerequisites the officer already holds.
    const { data: zpd } = await supabase.rpc("get_zpd_competencies", {
      p_user_id: userId,
      p_limit: 8,
    });

    const { data: attempts } = await supabase
      .from("quiz_attempts")
      .select("score, correct_count, total_count, calibration_error, created_at, quizzes ( title )")
      .eq("user_id", userId)
      .not("submitted_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!gaps?.length) {
      return errorResponse(
        "No competency requirements found for your role yet. Ask an administrator to map FRAC requirements to this role.",
        409,
      );
    }

    // ── 3. Build the evidence brief ─────────────────────────────────────────
    const scoreByCode = new Map(
      (scores ?? []).map((s: any) => [s.competencies.code, s]),
    );

    const gapLines = (gaps ?? []).slice(0, 25).map((g: any) => {
      const s = scoreByCode.get(g.competencies.code);
      const evidence = s
        ? `measured ${Number(s.score).toFixed(2)}/4 from ${s.total_count} items (${s.correct_count} correct), confidence ${Math.round(Number(s.confidence) * 100)}%`
        : "NO ASSESSMENT DATA YET";
      return `- ${g.competencies.code} | ${g.competencies.name} [${g.competencies.comp_type}]
    required: ${g.required_level} · current: ${g.current_level} · gap: ${Number(g.gap_size).toFixed(2)} · priority: ${Number(g.priority_score).toFixed(2)}${g.is_critical ? " · CRITICAL FOR ROLE" : ""}
    evidence: ${evidence}`;
    }).join("\n");

    const attemptLines = (attempts ?? []).length
      ? (attempts ?? []).map((a: any) =>
          `- "${a.quizzes?.title ?? "quiz"}": ${a.correct_count}/${a.total_count} (${Math.round((a.score ?? 0) * 100)}%)` +
          (a.calibration_error != null ? `, calibration error ${Number(a.calibration_error).toFixed(2)}` : ""),
        ).join("\n")
      : "  (no quizzes completed yet)";

    const misconceptionLines = (misconceptions ?? []).length
      ? (misconceptions ?? []).map((m: any) =>
          `- [${m.competency_code ?? "—"}] demonstrated ${m.occurrences}×: "${m.misconception}"`,
        ).join("\n")
      : "  (none detected yet — either no wrong answers, or no repeated pattern)";

    const zpdLines = (zpd ?? []).length
      ? (zpd ?? []).map((z: any) =>
          `- ${z.code} | ${z.name} · readiness ${Math.round((z.readiness ?? 0) * 100)}%` +
          ((z.blocked_by ?? []).length
            ? ` · BLOCKED until: ${(z.blocked_by as string[]).join(", ")}`
            : " · prerequisites met, ready to start now"),
        ).join("\n")
      : "  (no prerequisite data available)";

    const avgCalibration = (attempts ?? [])
      .map((a: any) => a.calibration_error)
      .filter((c: any) => c != null);
    const calibrationNote = avgCalibration.length
      ? `Mean calibration error across ${avgCalibration.length} quizzes: ${(avgCalibration.reduce((x: number, y: number) => x + y, 0) / avgCalibration.length).toFixed(2)} (0 = perfectly self-aware; >0.3 suggests over- or under-confidence worth naming).`
      : "No confidence data captured yet.";

    // ── 4. Interpret ────────────────────────────────────────────────────────
    const result = await chat<Diagnosis>({          // judgement call → strongest model
      task: "diagnose_gaps",
      userId,
      schema: diagnosisSchema,
      temperature: 0.4,
      maxTokens: 6000,
      timeoutMs: 120_000,
      messages: [
        {
          role: "system",
          content: `You are a senior capacity-building advisor at the National Statistical Systems Training Academy (NSSTA), MoSPI. You advise officers of India's Official Statistical System on their development, using the Mission Karmayogi FRAC framework.

You are given a competency profile where the gap arithmetic has ALREADY been computed deterministically. Do not recompute or dispute the numbers. Your job is to interpret them.

HOW TO ADVISE
· Address the officer directly as "you". Be warm, specific and respectful — these are serving professionals, not students.
· Lead with genuine strengths before gaps. People act on advice they trust.
· Distinguish "low score" from "no evidence". A competency with NO ASSESSMENT DATA is an unknown, not a weakness — say so, and recommend assessing it rather than training it.
· Weight CRITICAL competencies heavily; those are the ones where weakness actually damages statistical output.
· For impact_on_role, be concrete about statistical work: biased estimates, misapplied weights, a release that fails SQAF review, a disclosure breach. Not vague "reduced effectiveness".
· suggested_first_step must be doable this week and specific.
· Name at most 5 priority gaps. A list of fifteen priorities is a list of none.
· RESPECT THE PREREQUISITE GRAPH. A competency marked BLOCKED is not the right next step no matter how large the gap — recommend its blocker instead, and say why. Teaching someone variance estimation before they can compute a design weight wastes their time and dents their confidence.
· USE THE MISCONCEPTIONS. If a specific false belief keeps recurring, name it explicitly and correct it. "You are treating the final sampling stage as the whole design" is worth more than "revise sampling".
· Use only competency codes that appear in the data below.
· Write in language: ${profile.preferred_language ?? "en"}.`,
        },
        {
          role: "user",
          content: `OFFICER PROFILE
Name: ${profile.full_name ?? "Officer"}
Designation: ${profile.designation ?? "—"}
FRAC Role: ${jobRole?.name ?? "—"} (${jobRole?.code ?? "—"}, ${jobRole?.grade_level ?? "—"})
Role scope: ${jobRole?.description ?? "—"}
Years of service: ${profile.years_of_service ?? "not stated"}
Daily study capacity: ${profile.daily_goal_minutes ?? 20} minutes

COMPETENCY GAP ANALYSIS (deterministic, sorted by priority)
${gapLines}

RECURRING MISCONCEPTIONS (from which distractors were chosen, not just scores)
${misconceptionLines}

LEARNABLE FRONTIER (prerequisite-aware — what is actually startable now)
${zpdLines}

RECENT ASSESSMENT HISTORY
${attemptLines}

METACOGNITION
${calibrationNote}

Produce the diagnosis.`,
        },
      ],
    });

    const d = result.parsed;
    if (!d) {
      await logGeneration(admin, {
        userId, task: "diagnose_gaps", model: result.model, success: false,
        errorMessage: "unparseable diagnosis",
      });
      return errorResponse("Diagnosis generation failed. Please try again.", 502);
    }

    // ── 5. Write rationales back onto the gap rows ──────────────────────────
    const { data: compRows } = await admin
      .from("competencies").select("id, code")
      .in("code", d.priority_gaps.map((g) => g.competency_code));
    const idByCode = new Map((compRows ?? []).map((c: any) => [c.code, c.id]));

    for (const g of d.priority_gaps) {
      const cid = idByCode.get(g.competency_code);
      if (!cid) continue;
      await supabase
        .from("competency_gaps")
        .update({ rationale: `${g.rationale}\n\nImpact: ${g.impact_on_role}\n\nStart here: ${g.suggested_first_step}` })
        .eq("user_id", userId)
        .eq("competency_id", cid);
    }

    await supabase.from("activity_events").insert({
      user_id: userId,
      event_type: "competency_diagnosed",
      meta: { priority_gaps: d.priority_gaps.length, model: result.model },
    });

    await logGeneration(admin, {
      userId, task: "diagnose_gaps", model: result.model,
      promptTokens: result.promptTokens, completionTokens: result.completionTokens,
      costUsd: result.costUsd, latencyMs: result.latencyMs, success: true,
      meta: { gaps_analysed: gaps.length, priority_gaps: d.priority_gaps.length },
    });

    return jsonResponse({
      diagnosis: d,
      role: jobRole,
      gap_count: gaps.length,
      critical_gap_count: (gaps ?? []).filter((g: any) => g.is_critical && g.gap_size > 0).length,
      recurring_misconceptions: misconceptions ?? [],
      learnable_now: (zpd ?? []).filter((z: any) => (z.readiness ?? 0) >= 0.99),
      usage: { model: result.model, cost_usd: result.costUsd, latency_ms: result.latencyMs },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[diagnose-competency] unhandled", err);
    return errorResponse("Competency diagnosis failed", 500, (err as Error)?.message);
  }
});
