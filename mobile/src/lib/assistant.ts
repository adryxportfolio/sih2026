/**
 * Samiksha AI — the conversation behind the mascot.
 *
 * Officers ask questions and clear doubts; administrators ask for data and hand
 * over tasks. Both go through the `assistant` Edge Function, which holds the
 * model key server-side. Anything the administrator assistant wants to change
 * comes back as a `pending_action` that a person confirms before it runs.
 *
 * A demo session has no account, so it sends the demo dataset along with the
 * question. The server uses it only to answer and never writes to a database
 * on a demo's behalf.
 */
import { supabase } from "./supabase";
import {
  DEMO_COMPETENCIES, DEMO_OFFICERS, DEMO_ORG_GAPS, DEMO_ORG_SUMMARY, DEMO_USER,
} from "./demo";
import { DEMO_DEPARTMENTS, DEMO_LEARNER_ID, listDemoMaterials } from "./materials";

export type AssistantMode = "learner" | "admin";

export interface PendingAction {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  pending?: PendingAction | null;
  /** What became of a proposed action. */
  actionState?: "proposed" | "running" | "done" | "cancelled";
  error?: boolean;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("assistant", { body });
  if (error) {
    // FunctionsHttpError hides the server's message behind a generic one.
    let message = "Samiksha AI could not be reached. Check your connection and try again.";
    try {
      const ctx = (error as { context?: Response }).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

async function demoContext(mode: AssistantMode) {
  const materials = await listDemoMaterials();
  if (mode === "learner") {
    return {
      profile: {
        full_name: DEMO_USER.full_name,
        designation: DEMO_USER.designation,
        department: DEMO_USER.organization,
      },
      gaps: DEMO_COMPETENCIES
        .filter((c) => c.current < c.required)
        .map((c) => `${c.name}: level ${c.current.toFixed(1)} of the ${c.required} the post needs${c.is_critical ? " (critical)" : ""}`),
      materials: materials
        .filter((m) => m.user_ids.includes(DEMO_LEARNER_ID))
        .map((m) => ({ title: m.title, kind: m.kind })),
    };
  }

  const roster = new Map(DEMO_OFFICERS.map((o) => [o.user_id, o]));
  const nameOf = new Map(DEMO_DEPARTMENTS.flatMap((d) =>
    d.people.map((p) => [p.user_id, `${p.full_name} (${p.employee_code})`] as const)));
  return {
    summary: DEMO_ORG_SUMMARY,
    org_gaps: DEMO_ORG_GAPS,
    departments: DEMO_DEPARTMENTS.map((d) => ({ name: d.name, officers: d.people.length })),
    officers: DEMO_DEPARTMENTS.flatMap((d) => d.people.map((p) => {
      const o = roster.get(p.user_id);
      return {
        full_name: p.full_name, employee_code: p.employee_code, designation: p.designation,
        department: d.name,
        presence: o?.presence ?? "offline",
        current_activity: o?.current_activity ?? null,
        competencies_met: o ? `${o.competencies_met}/${o.competencies_mapped}` : null,
        critical_gaps: o?.critical_gaps ?? 0,
        biggest_gap: o?.top_gap_name ?? null,
        next_step: o?.next_step ?? null,
        minutes_last_7d: o?.minutes_last_7d ?? 0,
        quizzes_completed: o?.quizzes_completed ?? 0,
      };
    })),
    materials: materials.map((m) => ({
      id: m.id, title: m.title, kind: m.kind, published_to: m.published_to,
      assigned: m.user_ids.length, opened: m.opened_ids.length,
      not_opened_by: m.user_ids.filter((id) => !m.opened_ids.includes(id)).map((id) => nameOf.get(id) ?? id),
    })),
  };
}

export async function askAssistant(opts: {
  mode: AssistantMode;
  history: ChatTurn[];
  isDemo: boolean;
}): Promise<{ reply: string; pending_action: PendingAction | null }> {
  const messages = opts.history
    .filter((t) => !t.error && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content }));
  return invoke({
    mode: opts.mode,
    messages,
    demo: opts.isDemo ? await demoContext(opts.mode) : undefined,
  });
}

export async function confirmAssistantAction(opts: {
  action: PendingAction;
  isDemo: boolean;
}): Promise<{ reply: string; demo_effect?: { tool: string; args: Record<string, unknown> } }> {
  return invoke({
    mode: "admin",
    confirm: { tool: opts.action.tool, args: opts.action.args },
    demo: opts.isDemo ? await demoContext("admin") : undefined,
  });
}
