/**
 * Data access layer.
 *
 * Every screen talks to this, never to `supabase` directly. That keeps the
 * demo-mode fallback in one place: when the app is running without a backend
 * (offline judging, or before keys are configured) these functions return the
 * seeded dataset instead of throwing, and the screens above are unchanged.
 */
import { supabase } from "./supabase";
import * as demo from "./demo";

export interface OfficerOverview {
  user_id: string;
  full_name: string | null;
  email: string | null;
  employee_code: string | null;
  designation: string | null;
  role_code: string | null;
  role_name: string | null;
  years_of_service: number | null;
  xp: number;
  streak_current: number;
  last_login_at: string | null;
  is_active: boolean;
  onboarded_at: string | null;
  presence: "online" | "away" | "offline";
  last_seen_at: string | null;
  current_activity: string | null;
  current_entity: string | null;
  competencies_mapped: number;
  competencies_met: number;
  critical_gaps: number;
  avg_score: number | null;
  avg_confidence: number | null;
  top_gap_name: string | null;
  top_gap_code: string | null;
  next_step: string | null;
  minutes_last_7d: number;
  quizzes_completed: number;
  cards_due: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PRESENCE
// ─────────────────────────────────────────────────────────────────────────────
export type Activity =
  | "idle" | "reviewing" | "quiz" | "reading" | "video" | "tutor" | "assessment" | "browsing";

/**
 * Heartbeat. Fire-and-forget by design — a failed heartbeat must never
 * interrupt what the learner is doing.
 */
export async function heartbeat(
  activity: Activity = "browsing",
  entity?: string | null,
  competencyId?: string | null,
): Promise<void> {
  try {
    await supabase.rpc("heartbeat", {
      p_activity: activity,
      p_entity: entity ?? null,
      p_competency_id: competencyId ?? null,
      p_device: "android",
    });
  } catch {
    /* presence is best-effort */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN
// ─────────────────────────────────────────────────────────────────────────────
async function callAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export async function listOfficers(isDemo: boolean): Promise<OfficerOverview[]> {
  if (isDemo) return demo.DEMO_OFFICERS as unknown as OfficerOverview[];
  const { officers } = await callAdmin<{ officers: OfficerOverview[] }>({ action: "list" });
  return officers ?? [];
}

export interface CreateOfficerInput {
  email: string;
  full_name: string;
  employee_code: string;
  designation?: string;
  job_role_code?: string;
  years_of_service?: number;
  role?: "learner" | "trainer" | "nodal_officer" | "admin";
}

export async function createOfficer(input: CreateOfficerInput) {
  return callAdmin<{
    created: boolean;
    user_id: string;
    email: string;
    employee_code: string;
    temporary_password: string | null;
  }>({ action: "create", ...input });
}

export async function resetOfficerPassword(userId: string) {
  return callAdmin<{ reset: boolean; temporary_password: string }>({
    action: "reset_password", user_id: userId,
  });
}

export async function setOfficerActive(userId: string, active: boolean) {
  return callAdmin<{ user_id: string; is_active: boolean }>({
    action: active ? "reactivate" : "deactivate", user_id: userId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPETENCY
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchGaps(userId: string) {
  const { data, error } = await supabase
    .from("competency_gaps")
    .select(`gap_size, priority_score, is_critical, required_level, current_level, rationale,
             competencies!inner ( id, code, name, comp_type, category, description )`)
    .eq("user_id", userId)
    .order("priority_score", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchZpd(userId: string, limit = 10) {
  const { data, error } = await supabase.rpc("get_zpd_competencies", {
    p_user_id: userId, p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchMisconceptions(userId: string) {
  const { data, error } = await supabase
    .from("v_recurring_misconceptions")
    .select("*")
    .eq("user_id", userId)
    .order("occurrences", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADAPTIVE ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────
export interface AdaptiveItem {
  question_id: string;
  stem: string;
  options: { id: string; text: string }[];
  kind: string;
  difficulty: number;
  bloom: string;
  competency_id: string;
  information: number;
}

export async function startAdaptiveSession(competencyIds: string[] = []) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("adaptive_sessions")
    .insert({ user_id: auth.user.id, competency_ids: competencyIds })
    .select("id, theta, standard_error, max_items, min_items, target_se")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function nextAdaptiveItem(sessionId: string): Promise<AdaptiveItem | null> {
  const { data, error } = await supabase.rpc("next_adaptive_item", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return (row as AdaptiveItem) ?? null;
}

export async function submitAdaptiveResponse(
  sessionId: string, questionId: string,
  isCorrect: boolean, confidence?: number, timeMs?: number,
) {
  const { data, error } = await supabase.rpc("submit_adaptive_response", {
    p_session_id: sessionId,
    p_question_id: questionId,
    p_is_correct: isCorrect,
    p_confidence: confidence ?? null,
    p_time_ms: timeMs ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as { theta: number; standard_error: number; items: number; should_stop: boolean };
}

export async function completeAdaptiveSession(sessionId: string) {
  const { data, error } = await supabase.rpc("complete_adaptive_session", {
    p_session_id: sessionId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as { theta: number; standard_error: number; items: number };
}

// ─────────────────────────────────────────────────────────────────────────────
//  AI EDGE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
async function invokeAi<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export const ai = {
  generateQuiz:   (b: Record<string, unknown>) => invokeAi<any>("generate-quiz", b),
  processMaterial:(b: Record<string, unknown>) => invokeAi<any>("process-material", b),
  diagnose:       (b: Record<string, unknown> = {}) => invokeAi<any>("diagnose-competency", b),
  generatePath:   (b: Record<string, unknown> = {}) => invokeAi<any>("generate-path", b),
  curateVideos:   (b: Record<string, unknown>) => invokeAi<any>("curate-videos", b),
  tutor:          (b: Record<string, unknown>) => invokeAi<any>("tutor", b),
  flashcards:     (b: Record<string, unknown>) => invokeAi<any>("generate-flashcards", b),
};

// ─────────────────────────────────────────────────────────────────────────────
//  PROGRESS
// ─────────────────────────────────────────────────────────────────────────────
export async function recordProgress(p: {
  minutes?: number; cards?: number; cardsOk?: number;
  questions?: number; questionsOk?: number; videos?: number; xp?: number;
}) {
  const { data, error } = await supabase.rpc("record_study_progress", {
    p_minutes: p.minutes ?? 0,
    p_cards: p.cards ?? 0,
    p_cards_ok: p.cardsOk ?? 0,
    p_questions: p.questions ?? 0,
    p_questions_ok: p.questionsOk ?? 0,
    p_videos: p.videos ?? 0,
    p_xp: p.xp ?? 0,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as { streak_current: number; goal_met: boolean; xp: number };
}

// ─────────────────────────────────────────────────────────────────────────────
//  AGENT DEPENDENCY  —  the competency loop, closing
// ─────────────────────────────────────────────────────────────────────────────
export interface AgentDependency {
  competency_code: string;
  competency_name: string;
  comp_type: string;
  delegations: number;
  delegations_30d: number;
  seconds_automated: number;
  gap_size: number | null;
  is_critical: boolean | null;
  dependency_score: number;
}

/**
 * Where this officer is leaning on their agents for work their post expects
 * them to be able to do.
 *
 * Only rows with a live gap score above zero, because delegating something you
 * are already proficient at is good delegation, not a development need — the
 * view keeps those at zero precisely so they do not get read as a weakness.
 */
export async function listAgentDependencies(): Promise<AgentDependency[]> {
  const { data, error } = await supabase
    .from("v_officer_dependency")
    .select("*")
    .gt("dependency_score", 0)
    .order("dependency_score", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentDependency[];
}
