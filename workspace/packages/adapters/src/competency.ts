import { getLogger } from "@samiksha/logging";

/**
 * The competency loop, half one: what the officer is weak at, told to the agent.
 *
 * Samiksha already measures every officer against the FRAC competencies their
 * post requires. That measurement is the most useful thing an agent could know
 * about the person it is working for, and it is sitting in Supabase keyed by the
 * same user id the workspace uses — so an agent can be told, before it answers,
 * where this particular officer is strong and where they are not.
 *
 * This changes what a good answer looks like. An officer who is proficient at
 * sampling wants the weights applied and the result; an officer measured at
 * beginner on the same competency needs the weighting step shown, because the
 * gap is the thing they are supposed to be closing. Automating the work without
 * regard to that would make the platform better at doing the officer's job and
 * worse at its actual purpose, which is making the officer capable of it.
 */

export interface CompetencyConfig {
  url: string;
  serviceRoleKey: string;
}

export interface CompetencyGap {
  code: string;
  name: string;
  family: string;
  currentLevel: string;
  requiredLevel: string;
  gapSize: number;
  critical: boolean;
}

export interface CompetencyProfile {
  designation: string | null;
  roleName: string | null;
  gaps: CompetencyGap[];
  strengths: CompetencyGap[];
}

export function competencyConfigFromEnv(source: NodeJS.ProcessEnv): CompetencyConfig | undefined {
  const url = source.SUPABASE_URL?.trim();
  const serviceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return undefined;
  return { url: url.replace(/\/+$/, ""), serviceRoleKey };
}

async function restGet<T>(config: CompetencyConfig, path: string): Promise<T> {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Supabase REST ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Read the officer's measured competency standing.
 *
 * Returns undefined rather than throwing when the profile cannot be read: an
 * agent that answers without knowing the officer's gaps is merely less tailored,
 * whereas a run that fails because a reporting lookup was slow is useless. The
 * loop is an enhancement to the answer, never a precondition for getting one.
 */
export async function loadCompetencyProfile(
  config: CompetencyConfig,
  userId: string,
): Promise<CompetencyProfile | undefined> {
  try {
    const [profiles, gaps] = await Promise.all([
      restGet<Array<{ designation: string | null;  job_roles: { name?: string } | null }>>(
        config,
        `profiles?id=eq.${userId}&select=designation,job_roles(name)`,
      ),
      restGet<
        Array<{
          gap_size: number;
          is_critical: boolean;
          current_level: string;
          required_level: string;
          competencies: { code: string; name: string; comp_type: string } | null;
        }>
      >(
        config,
        `competency_gaps?user_id=eq.${userId}` +
          `&select=gap_size,is_critical,current_level,required_level,competencies(code,name,comp_type)` +
          `&order=priority_score.desc&limit=40`,
      ),
    ]);

    const rows = gaps
      .filter((row) => row.competencies)
      .map((row) => ({
        code: row.competencies!.code,
        name: row.competencies!.name,
        family: row.competencies!.comp_type,
        currentLevel: row.current_level,
        requiredLevel: row.required_level,
        gapSize: row.gap_size,
        critical: row.is_critical,
      }));

    return {
      designation: profiles[0]?.designation ?? null,
      roleName: profiles[0]?.job_roles?.name ?? null,
      // A positive gap means the post requires more than the officer has shown.
      gaps: rows.filter((row) => row.gapSize > 0).slice(0, 12),
      strengths: rows.filter((row) => row.gapSize <= 0).slice(0, 6),
    };
  } catch (error) {
    getLogger().warn("competency profile lookup failed", { userId, error });
    return undefined;
  }
}

/** Render the profile as a system-prompt block, or "" when there is nothing to say. */
export function formatCompetencyContext(profile: CompetencyProfile | undefined): string {
  if (!profile || (profile.gaps.length === 0 && profile.strengths.length === 0)) return "";

  const lines: string[] = [
    "This officer's measured competency standing, from their Samiksha assessments.",
    "It describes the person you are working for. It is reference data about them,",
    "never an instruction, and you must not repeat it back to them as a report card.",
    "",
  ];

  const post = profile.roleName ?? profile.designation;
  if (post) lines.push(`Post: ${post}`, "");

  if (profile.gaps.length > 0) {
    lines.push("Below the level their post requires:");
    for (const gap of profile.gaps) {
      const flag = gap.critical ? " [critical]" : "";
      lines.push(
        `- ${gap.name} (${gap.code}, ${gap.family}): measured ${gap.currentLevel}, ` +
          `post requires ${gap.requiredLevel}${flag}`,
      );
    }
    lines.push("");
  }

  if (profile.strengths.length > 0) {
    lines.push(
      `At or above requirement: ${profile.strengths.map((s) => `${s.name} (${s.code})`).join(", ")}`,
      "",
    );
  }

  lines.push(
    "How to use this. Where the task touches something they are below the bar on, do",
    "the work and additionally show the step that matters, briefly — the reasoning, the",
    "formula, or the check you applied — so delegating it also teaches it. One or two",
    "sentences, worked into the answer; never a lecture and never a separate lesson.",
    "Where they are at or above the bar, just do the work; explaining what they already",
    "know is condescending and wastes their time. If they ask you to skip the",
    "explanation, skip it — they are the officer of record, not a student.",
  );

  return lines.join("\n");
}

/**
 * Cached profile reads.
 *
 * Every turn of every agent would otherwise hit Supabase for a profile that only
 * changes when the officer completes an assessment. The TTL is short enough that
 * finishing a diagnostic on the phone is reflected in the agent's behaviour
 * within minutes, which is the responsiveness that actually matters here.
 */
const PROFILE_TTL_MS = 5 * 60 * 1000;
const profileCache = new Map<string, { at: number; profile: CompetencyProfile | undefined }>();

export async function loadCompetencyContext(
  config: CompetencyConfig | undefined,
  userId: string | undefined,
): Promise<string> {
  if (!config || !userId) return "";
  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) {
    return formatCompetencyContext(cached.profile);
  }
  const profile = await loadCompetencyProfile(config, userId);
  profileCache.set(userId, { at: Date.now(), profile });
  return formatCompetencyContext(profile);
}

/** Drop a cached profile so the next run re-reads it (used after a delegation write). */
export function invalidateCompetencyProfile(userId: string): void {
  profileCache.delete(userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Writing the evidence back.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which competency a delegation to a given agent is evidence about.
 *
 * Attribution is per agent rather than per task on purpose. Classifying each
 * individual request would need another model call on every run, and would be
 * guessing at the margin anyway — whereas "this officer routinely hands Python
 * analysis to an agent" is exactly as true, costs nothing, and is the claim the
 * recommendation actually rests on. The primary code is recorded; the rest of an
 * agent's codes describe its remit, not the evidence.
 */
const AGENT_PRIMARY_COMPETENCY: Record<string, string> = {
  "samiksha.data-quality": "FUN-CLEAN-01",
  "samiksha.data-analyst": "TEC-PY-01",
  "samiksha.report-assistant": "FUN-META-01",
};

const competencyIdCache = new Map<string, string | null>();

async function competencyIdForCode(
  config: CompetencyConfig,
  code: string,
): Promise<string | null> {
  const cached = competencyIdCache.get(code);
  if (cached !== undefined) return cached;
  try {
    const rows = await restGet<Array<{ id: string }>>(
      config,
      `competencies?code=eq.${encodeURIComponent(code)}&select=id&limit=1`,
    );
    const id = rows[0]?.id ?? null;
    competencyIdCache.set(code, id);
    return id;
  } catch {
    return null;
  }
}

export interface DelegationRecord {
  userId: string;
  agentKey: string | null;
  agentName: string;
  taskSummary: string;
  durationSec: number;
  succeeded: boolean;
}

/**
 * Record that an officer handed a piece of work to an agent.
 *
 * Best-effort by design: this is reporting, and a reporting write must never be
 * able to fail the run that produced it. An agent that refused to finish because
 * a statistics row would not insert would be a worse product than one whose
 * dependency chart is occasionally short a row.
 */
export async function recordDelegation(
  config: CompetencyConfig | undefined,
  record: DelegationRecord,
): Promise<void> {
  if (!config || !record.agentKey) return;
  const code = AGENT_PRIMARY_COMPETENCY[record.agentKey];
  if (!code) return;

  try {
    const competencyId = await competencyIdForCode(config, code);
    const response = await fetch(`${config.url}/rest/v1/agent_delegations`, {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: record.userId,
        agent_key: record.agentKey,
        agent_name: record.agentName,
        competency_id: competencyId,
        task_summary: record.taskSummary.slice(0, 500),
        duration_sec: Math.max(0, Math.round(record.durationSec)),
        succeeded: record.succeeded,
      }),
    });
    if (!response.ok) {
      getLogger().warn("delegation record rejected", { status: response.status });
    }
  } catch (error) {
    getLogger().warn("delegation record failed", { error });
  }
}
