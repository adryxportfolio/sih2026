/**
 * POST /functions/v1/assistant
 *
 * The conversation behind the floating mascot.
 *
 *   mode "learner"  An officer asks questions and clears doubts. The assistant
 *                   knows where they are below the bar for their post and what
 *                   their department has assigned them, so "explain this" is
 *                   answered against their gaps and their material rather
 *                   than as a generic chatbot.
 *
 *   mode "admin"    An administrator asks for data or delegates a task. The
 *                   assistant reads the platform through tools, and anything
 *                   that changes state — publishing material, provisioning or
 *                   switching off an account — comes back as a proposed action
 *                   the administrator confirms. Agents draft, people decide.
 *
 * Demo sessions have no account, so they carry their own dataset in the
 * request. That data only ever shapes the prompt: a demo call reads nothing
 * from the database and writes nothing to it, and it is rate-limited because
 * it spends the deployment's model budget.
 *
 * Body:
 *   { mode, messages: [{role, content}], confirm?: {tool, args}, demo?: DemoContext }
 */
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/supabase.ts";
import { chatWithTools, logGeneration, type RawMessage, type ToolDef } from "../_shared/openrouter.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

type Mode = "learner" | "admin";
interface Turn { role: "user" | "assistant"; content: string }
interface PendingAction { tool: string; args: Record<string, unknown>; summary: string }

const DEMO_CALLS_PER_10_MIN = 120;
const MAX_TOOL_ROUNDS = 6;

const PERSONA = `You are Samiksha AI, the assistant inside Samiksha — the capacity-building platform for India's Official Statistical System (MoSPI, NSO, NSSTA and the state Directorates of Economics and Statistics).
Never name the underlying model, provider or vendor; if asked, you are Samiksha AI.
Write plain text for a phone screen: short paragraphs, "-" bullets where a list helps, no markdown headings, tables or bold markers. Be precise with numbers and never invent data.`;

// ─────────────────────────────────────────────────────────────────────────────
//  Tools
// ─────────────────────────────────────────────────────────────────────────────
const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object", properties, required, additionalProperties: false });
const str = (description: string) => ({ type: "string", description });

const READ_TOOLS: ToolDef[] = [
  { type: "function", function: { name: "platform_overview",
    description: "Headline numbers: officers, active accounts, who is online, critical gaps, published materials.",
    parameters: obj({}) } },
  { type: "function", function: { name: "list_departments",
    description: "Departments / directorates with how many officers each has.",
    parameters: obj({}) } },
  { type: "function", function: { name: "list_officers",
    description: "Officers with presence, competency position, biggest gap and engagement. Filter by department name and/or a search on name, employee ID or designation.",
    parameters: obj({ department: str("Department name or part of it"), search: str("Name, employee ID or designation"),
                      only_critical: { type: "boolean", description: "Only officers with at least one critical gap" } }) } },
  { type: "function", function: { name: "get_officer",
    description: "One officer in detail, including every competency gap. Look up by employee ID or name.",
    parameters: obj({ query: str("Employee ID or name") }, ["query"]) } },
  { type: "function", function: { name: "competency_gap_summary",
    description: "Which competencies officers are collectively weakest in, optionally within one department.",
    parameters: obj({ department: str("Department name or part of it") }) } },
  { type: "function", function: { name: "list_materials",
    description: "Study materials administrators have published, with who they went to and how many opened them.",
    parameters: obj({}) } },
];

const recipients = {
  department: str("Department to publish to. Omit when using all_departments or employee_codes."),
  all_departments: { type: "boolean", description: "Publish to every department" },
  employee_codes: { type: "array", items: { type: "string" }, description: "Specific officers by employee ID" },
};

const WRITE_TOOLS: ToolDef[] = [
  { type: "function", function: { name: "publish_link",
    description: "Publish a YouTube video or web link as study material to a department, all departments or named officers.",
    parameters: obj({ title: str("Title officers will see"), url: str("YouTube or https link"),
                      description: str("One-line description"), ...recipients }, ["title", "url"]) } },
  { type: "function", function: { name: "assign_material",
    description: "Give an already-published material to a department, all departments or named officers.",
    parameters: obj({ material: str("Material title or id"), ...recipients }, ["material"]) } },
  { type: "function", function: { name: "create_officer",
    description: "Provision a new officer account. Returns a one-time temporary password.",
    parameters: obj({ full_name: str("Full name"), email: str("Official email"), employee_code: str("Employee ID"),
                      designation: str("Designation"), department: str("Department name") },
                    ["full_name", "email", "employee_code"]) } },
  { type: "function", function: { name: "set_officer_active",
    description: "Deactivate or reactivate an officer account.",
    parameters: obj({ employee_code: str("Employee ID"), active: { type: "boolean" } }, ["employee_code", "active"]) } },
  { type: "function", function: { name: "reset_officer_password",
    description: "Issue a new temporary password for an officer.",
    parameters: obj({ employee_code: str("Employee ID") }, ["employee_code"]) } },
];

const WRITE_NAMES = new Set(WRITE_TOOLS.map((t) => t.function.name));

function describeAction(tool: string, a: Record<string, Any>): string {
  const who = a.employee_codes?.length ? `${a.employee_codes.join(", ")}`
    : a.all_departments ? "every department"
    : a.department ? `everyone in ${a.department}` : "no one yet";
  switch (tool) {
    case "publish_link": return `Publish "${a.title}" (${a.url}) to ${who}.`;
    case "assign_material": return `Assign "${a.material}" to ${who}.`;
    case "create_officer": return `Create an account for ${a.full_name} (${a.employee_code}, ${a.email})${a.department ? ` in ${a.department}` : ""}.`;
    case "set_officer_active": return `${a.active ? "Reactivate" : "Deactivate"} the account of ${a.employee_code}.`;
    case "reset_officer_password": return `Reset the password of ${a.employee_code}.`;
    default: return `${tool}`;
  }
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().trim();

// Words every directorate shares. Matching on them sends "West Bengal" to
// whichever department happens to be listed first.
const COMMON_WORDS = new Set(["directorate", "department", "economics", "statistics", "statistical",
  "national", "office", "ministry", "state", "and", "the", "for"]);

/** The department a person means by a name, a part of one, or a short name. */
function matchDepartment<T extends { name: string; short_name?: string | null }>(items: T[], query: unknown): T | null {
  const q = norm(query);
  if (!q) return null;
  const exact = items.find((d) => norm(d.name) === q || norm(d.short_name) === q);
  if (exact) return exact;
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const score = (d: T, distinctiveOnly: boolean) => {
    const n = `${norm(d.name)} ${norm(d.short_name)}`;
    let total = n.includes(q) ? 1000 : 0;
    for (const w of words) if ((!distinctiveOnly || !COMMON_WORDS.has(w)) && n.includes(w)) total += w.length;
    return total;
  };
  for (const distinctiveOnly of [true, false]) {
    let best: T | null = null;
    let bestScore = 0;
    for (const d of items) {
      const sc = score(d, distinctiveOnly);
      if (sc > bestScore) { best = d; bestScore = sc; }
    }
    if (best) return best;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Live data access (real administrators)
// ─────────────────────────────────────────────────────────────────────────────
class LiveData {
  constructor(private db: Any, private scopeOrg: string | null) {}

  async departments() {
    const { data: orgs } = await this.db.from("organizations").select("id, name, short_name, org_type");
    const { data: people } = await this.db.from("profiles").select("organization_id, role, is_active");
    return (orgs ?? [])
      .filter((o: Any) => !this.scopeOrg || o.id === this.scopeOrg)
      .map((o: Any) => ({
        id: o.id, name: o.name, short_name: o.short_name, type: o.org_type,
        officers: (people ?? []).filter((p: Any) => p.organization_id === o.id && p.role !== "admin").length,
      }));
  }

  async resolveDepartment(name: unknown) {
    return matchDepartment(await this.departments(), name);
  }

  async officers() {
    const { data } = await this.db.from("v_admin_officer_overview").select("*").limit(1000);
    const deps = await this.departments();
    const byId = new Map(deps.map((d: Any) => [d.id, d.name]));
    return (data ?? [])
      .filter((o: Any) => !this.scopeOrg || o.organization_id === this.scopeOrg)
      .map((o: Any) => ({ ...o, department: byId.get(o.organization_id) ?? null }));
  }

  async run(tool: string, a: Record<string, Any>): Promise<unknown> {
    switch (tool) {
      case "platform_overview": {
        const officers = await this.officers();
        const { count: materials } = await this.db.from("materials")
          .select("id", { count: "exact", head: true }).neq("audience", "owner");
        return {
          officers: officers.length,
          active_accounts: officers.filter((o: Any) => o.is_active).length,
          online_now: officers.filter((o: Any) => o.presence === "online").length,
          officers_with_critical_gaps: officers.filter((o: Any) => o.critical_gaps > 0).length,
          total_critical_gaps: officers.reduce((s: number, o: Any) => s + (o.critical_gaps ?? 0), 0),
          study_minutes_last_7d: officers.reduce((s: number, o: Any) => s + (o.minutes_last_7d ?? 0), 0),
          published_materials: materials ?? 0,
        };
      }
      case "list_departments":
        return (await this.departments()).map(({ id: _id, ...d }: Any) => d);
      case "list_officers": {
        let rows = await this.officers();
        if (a.department) {
          const d = await this.resolveDepartment(a.department);
          if (!d) return { error: `No department matches "${a.department}".` };
          rows = rows.filter((o: Any) => o.organization_id === d.id);
        }
        if (a.search) {
          const q = norm(a.search);
          rows = rows.filter((o: Any) => [o.full_name, o.employee_code, o.designation].some((v) => norm(v).includes(q)));
        }
        if (a.only_critical) rows = rows.filter((o: Any) => o.critical_gaps > 0);
        return rows.slice(0, 60).map((o: Any) => ({
          name: o.full_name, employee_code: o.employee_code, designation: o.designation, department: o.department,
          active: o.is_active, presence: o.presence, current_activity: o.current_activity,
          competencies_met: `${o.competencies_met}/${o.competencies_mapped}`, critical_gaps: o.critical_gaps,
          biggest_gap: o.top_gap_name, next_step: o.next_step, minutes_last_7d: o.minutes_last_7d,
          quizzes_completed: o.quizzes_completed, last_login: o.last_login_at,
        }));
      }
      case "get_officer": {
        const q = norm(a.query);
        const o = (await this.officers()).find((x: Any) => norm(x.employee_code) === q)
          ?? (await this.officers()).find((x: Any) => norm(x.full_name).includes(q));
        if (!o) return { error: `No officer matches "${a.query}".` };
        const { data: gaps } = await this.db.from("competency_gaps")
          .select("gap_size, is_critical, required_level, current_level, competencies!inner(code, name, comp_type)")
          .eq("user_id", o.user_id).order("priority_score", { ascending: false });
        const { data: assigned } = await this.db.from("material_assignments")
          .select("opened_at, completed_at, materials!inner(title)").eq("user_id", o.user_id);
        return {
          ...o, user_id: undefined, organization_id: undefined,
          gaps: (gaps ?? []).map((g: Any) => ({ competency: g.competencies.name, type: g.competencies.comp_type,
            required: g.required_level, current: g.current_level, gap: g.gap_size, critical: g.is_critical })),
          assigned_materials: (assigned ?? []).map((m: Any) => ({ title: m.materials.title,
            opened: !!m.opened_at, completed: !!m.completed_at })),
        };
      }
      case "competency_gap_summary": {
        let userIds: string[] | null = null;
        if (a.department) {
          const d = await this.resolveDepartment(a.department);
          if (!d) return { error: `No department matches "${a.department}".` };
          const { data } = await this.db.from("profiles").select("id").eq("organization_id", d.id);
          userIds = (data ?? []).map((p: Any) => p.id);
        } else if (this.scopeOrg) {
          const { data } = await this.db.from("profiles").select("id").eq("organization_id", this.scopeOrg);
          userIds = (data ?? []).map((p: Any) => p.id);
        }
        let query = this.db.from("competency_gaps")
          .select("user_id, gap_size, is_critical, competencies!inner(name, comp_type)").gt("gap_size", 0);
        if (userIds) query = query.in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
        const { data } = await query;
        const agg = new Map<string, Any>();
        for (const g of data ?? []) {
          const k = g.competencies.name;
          const e = agg.get(k) ?? { competency: k, type: g.competencies.comp_type, officers: 0, critical: 0, total_gap: 0 };
          e.officers++; if (g.is_critical) e.critical++; e.total_gap += g.gap_size;
          agg.set(k, e);
        }
        return [...agg.values()].sort((x, y) => y.critical - x.critical || y.officers - x.officers).slice(0, 15)
          .map((e) => ({ ...e, average_gap: Number((e.total_gap / e.officers).toFixed(2)), total_gap: undefined }));
      }
      case "list_materials": {
        const { data } = await this.db.from("materials")
          .select("id, title, kind, audience, department_id, created_at, external_url, material_assignments(opened_at, completed_at, officer:profiles!material_assignments_user_id_fkey(full_name, employee_code))")
          .neq("audience", "owner").order("created_at", { ascending: false }).limit(50);
        const deps = await this.departments();
        const byId = new Map(deps.map((d: Any) => [d.id, d.name]));
        return (data ?? []).map((m: Any) => ({
          id: m.id, title: m.title, kind: m.kind, link: m.external_url,
          published_to: m.audience === "all_departments" ? "All departments" : byId.get(m.department_id) ?? "Selected officers",
          assigned: m.material_assignments.length,
          opened: m.material_assignments.filter((x: Any) => x.opened_at).length,
          not_opened_by: m.material_assignments.filter((x: Any) => !x.opened_at)
            .map((x: Any) => `${x.officer?.full_name ?? "Unknown"} (${x.officer?.employee_code ?? "no ID"})`),
          published_at: m.created_at,
        }));
      }
    }
    return { error: `Unknown tool ${tool}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Demo data access — same tools, over the dataset the demo app carries
// ─────────────────────────────────────────────────────────────────────────────
function demoRun(demo: Any, tool: string, a: Record<string, Any>): unknown {
  const officers: Any[] = Array.isArray(demo?.officers) ? demo.officers.slice(0, 200) : [];
  const departments: Any[] = Array.isArray(demo?.departments) ? demo.departments.slice(0, 50) : [];
  const materials: Any[] = Array.isArray(demo?.materials) ? demo.materials.slice(0, 50) : [];
  const dept = (name: unknown) => matchDepartment(departments, name);
  switch (tool) {
    case "platform_overview":
      return { ...(demo?.summary ?? {}), officers: officers.length,
        online_now: officers.filter((o) => o.presence === "online").length,
        officers_with_critical_gaps: officers.filter((o) => o.critical_gaps > 0).length,
        published_materials: materials.length };
    case "list_departments": return departments;
    case "list_officers": {
      let rows = officers;
      if (a.department) { const d = dept(a.department); rows = d ? rows.filter((o) => o.department === d.name) : []; }
      if (a.search) { const q = norm(a.search); rows = rows.filter((o) => [o.full_name, o.employee_code, o.designation].some((v) => norm(v).includes(q))); }
      if (a.only_critical) rows = rows.filter((o) => o.critical_gaps > 0);
      return rows;
    }
    case "get_officer": {
      const q = norm(a.query);
      return officers.find((o) => norm(o.employee_code) === q || norm(o.full_name).includes(q)) ?? { error: "No officer matches." };
    }
    case "competency_gap_summary": return demo?.org_gaps ?? [];
    case "list_materials": return materials;
  }
  return { error: `Unknown tool ${tool}` };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Executing a confirmed action (real administrators)
// ─────────────────────────────────────────────────────────────────────────────
async function callAdminUsers(req: Request, body: Record<string, unknown>) {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/admin-users`, {
    method: "POST",
    headers: {
      "Authorization": req.headers.get("Authorization") ?? "",
      "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error ?? `admin-users failed (${res.status})`);
  return data;
}

async function executeLive(
  req: Request, db: Any, live: LiveData, callerId: string, callerRole: string,
  tool: string, a: Record<string, Any>,
): Promise<string> {
  const officerByCode = async (code: unknown) => {
    const { data } = await db.from("profiles").select("id, full_name, employee_code")
      .ilike("employee_code", String(code ?? "").trim()).maybeSingle();
    if (!data) throw new Error(`No officer has employee ID ${code}.`);
    return data;
  };

  const resolveRecipients = async () => {
    if (Array.isArray(a.employee_codes) && a.employee_codes.length) {
      const { data } = await db.from("profiles").select("id, employee_code").in(
        "employee_code", a.employee_codes.map((c: string) => String(c).trim().toUpperCase()));
      return { ids: (data ?? []).map((p: Any) => p.id), audience: "department", departmentId: null, label: `${(data ?? []).length} named officer(s)` };
    }
    if (a.all_departments) {
      const { data } = await db.from("profiles").select("id").neq("role", "admin").eq("is_active", true);
      return { ids: (data ?? []).map((p: Any) => p.id), audience: "all_departments", departmentId: null, label: "all departments" };
    }
    if (a.department) {
      const d = await live.resolveDepartment(a.department);
      if (!d) throw new Error(`No department matches "${a.department}".`);
      const { data } = await db.from("profiles").select("id").eq("organization_id", d.id).neq("role", "admin").eq("is_active", true);
      return { ids: (data ?? []).map((p: Any) => p.id), audience: "department", departmentId: d.id, label: d.name };
    }
    throw new Error("Say who should receive it: a department, all departments, or employee IDs.");
  };

  const assign = async (materialId: string) => {
    const r = await resolveRecipients();
    await db.from("materials").update({ audience: r.audience, department_id: r.departmentId }).eq("id", materialId);
    if (r.ids.length) {
      await db.from("material_assignments").upsert(
        r.ids.map((id: string) => ({ material_id: materialId, user_id: id, assigned_by: callerId })),
        { onConflict: "material_id,user_id", ignoreDuplicates: true });
    }
    return r;
  };

  switch (tool) {
    case "publish_link": {
      const url = String(a.url ?? "").trim();
      if (!/^https:\/\//i.test(url)) throw new Error("The link must start with https://");
      const yt = youtubeId(url);
      const { data: m, error } = await db.from("materials").insert({
        owner_id: callerId, title: String(a.title).slice(0, 200), description: a.description ?? null,
        kind: yt ? "youtube" : "link", external_url: url, youtube_id: yt, status: "ready",
        visibility: "organization", audience: "department",
      }).select("id").single();
      if (error) throw new Error(error.message);
      const r = await assign(m.id);
      return `Published "${a.title}" to ${r.label} — ${r.ids.length} officer(s) will see it in their Library.`;
    }
    case "assign_material": {
      const q = String(a.material ?? "");
      let { data: m } = await db.from("materials").select("id, title").eq("id", /^[0-9a-f-]{36}$/i.test(q) ? q : "00000000-0000-0000-0000-000000000000").maybeSingle();
      if (!m) ({ data: m } = await db.from("materials").select("id, title").ilike("title", `%${q}%`).neq("audience", "owner").limit(1).maybeSingle());
      if (!m) throw new Error(`No published material matches "${q}".`);
      const r = await assign(m.id);
      return `Assigned "${m.title}" to ${r.label} (${r.ids.length} officer(s)).`;
    }
    case "create_officer": {
      if (callerRole !== "admin") throw new Error("Only an administrator can create accounts.");
      const d = a.department ? await live.resolveDepartment(a.department) : null;
      const r = await callAdminUsers(req, {
        action: "create", email: a.email, full_name: a.full_name, employee_code: a.employee_code,
        designation: a.designation, organization_id: d?.id,
      });
      return `Created ${a.full_name} (${r.employee_code}). Temporary password: ${r.temporary_password} — hand it over in person; they will be asked to change it.`;
    }
    case "set_officer_active": {
      if (callerRole !== "admin") throw new Error("Only an administrator can change account status.");
      const o = await officerByCode(a.employee_code);
      await callAdminUsers(req, { action: a.active ? "reactivate" : "deactivate", user_id: o.id });
      return `${o.full_name} (${o.employee_code}) is now ${a.active ? "active" : "deactivated"}.`;
    }
    case "reset_officer_password": {
      if (callerRole !== "admin") throw new Error("Only an administrator can reset passwords.");
      const o = await officerByCode(a.employee_code);
      const r = await callAdminUsers(req, { action: "reset_password", user_id: o.id });
      return `New temporary password for ${o.full_name}: ${r.temporary_password}`;
    }
  }
  throw new Error(`Unknown action ${tool}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Context for the learner assistant
// ─────────────────────────────────────────────────────────────────────────────
async function learnerContext(db: Any, userId: string): Promise<string> {
  const [{ data: profile }, { data: gaps }, { data: assigned }] = await Promise.all([
    db.from("profiles").select("full_name, designation, preferred_language, organizations(name)").eq("id", userId).maybeSingle(),
    db.from("competency_gaps").select("gap_size, is_critical, required_level, current_level, competencies!inner(name)")
      .eq("user_id", userId).gt("gap_size", 0).order("priority_score", { ascending: false }).limit(8),
    db.from("material_assignments").select("materials!inner(title, kind, description, summary, key_topics, external_url, extracted_text)")
      .eq("user_id", userId).limit(20),
  ]);
  let budget = 60_000;
  const materials = (assigned ?? []).map((row: Any) => {
    const m = row.materials;
    const text = m.extracted_text ? String(m.extracted_text).slice(0, Math.max(0, Math.min(20_000, budget))) : "";
    budget -= text.length;
    return `- ${m.title} (${m.kind})${m.description ? `: ${m.description}` : ""}${m.summary ? `\n  Summary: ${m.summary}` : ""}${text ? `\n  Content:\n${text}` : ""}`;
  }).join("\n");
  return formatLearnerContext({
    name: profile?.full_name, designation: profile?.designation, department: profile?.organizations?.name,
    gaps: (gaps ?? []).map((g: Any) => `${g.competencies.name}: at ${g.current_level}, post needs ${g.required_level}${g.is_critical ? " (critical)" : ""}`),
    materials,
  });
}

function formatLearnerContext(c: { name?: string; designation?: string; department?: string; gaps: string[]; materials: string }) {
  return `THE OFFICER
Name: ${c.name ?? "unknown"} · ${c.designation ?? ""}${c.department ? ` · ${c.department}` : ""}

MEASURED COMPETENCY GAPS FOR THEIR POST
${c.gaps.length ? c.gaps.map((g) => `- ${g}`).join("\n") : "- none recorded yet"}

STUDY MATERIAL THEIR DEPARTMENT ASSIGNED
${c.materials || "- none yet"}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Handler
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const db = adminClient();
  let userId: string | null = null;
  let task = "assistant";

  try {
    const body = await req.json().catch(() => ({}));
    const mode: Mode = body.mode === "admin" ? "admin" : "learner";
    const turns: Turn[] = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: Any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
      .slice(-16)
      .map((m: Any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

    // ── Who is calling ──────────────────────────────────────────────────────
    const { data: auth } = await userClient(req).auth.getUser().catch(() => ({ data: null }));
    const user = auth?.user ?? null;
    const isDemo = !user;
    let role = "learner";
    let orgId: string | null = null;

    if (user) {
      userId = user.id;
      const { data: p } = await db.from("profiles").select("role, organization_id, is_active").eq("id", user.id).maybeSingle();
      if (p?.is_active === false) return errorResponse("This account is deactivated.", 403);
      role = p?.role ?? "learner";
      orgId = p?.organization_id ?? null;
      if (mode === "admin" && !["admin", "nodal_officer", "trainer"].includes(role)) {
        return errorResponse("The administrator assistant needs an administrator account.", 403);
      }
    } else {
      if (!body.demo) return errorResponse("Sign in to use the assistant.", 401);
      task = "assistant_demo";
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { count } = await db.from("ai_generations").select("id", { count: "exact", head: true })
        .eq("task", "assistant_demo").gte("created_at", since);
      if ((count ?? 0) >= DEMO_CALLS_PER_10_MIN) {
        return errorResponse("The demo assistant is busy right now. Try again in a few minutes.", 429);
      }
    }

    const live = user ? new LiveData(db, role === "admin" ? null : orgId) : null;

    // ── A confirmed action ──────────────────────────────────────────────────
    if (body.confirm && mode === "admin") {
      const tool = String(body.confirm.tool ?? "");
      const args = (body.confirm.args ?? {}) as Record<string, Any>;
      if (!WRITE_NAMES.has(tool)) return errorResponse("Unknown action.", 400);
      if (isDemo) {
        return jsonResponse({ reply: `Done. ${describeAction(tool, args)}\n\n(Demo mode — nothing was changed on a real server.)`, demo_effect: { tool, args } });
      }
      try {
        const reply = await executeLive(req, db, live!, user!.id, role, tool, args);
        return jsonResponse({ reply, executed: { tool } });
      } catch (e) {
        return jsonResponse({ reply: `That did not go through: ${(e as Error).message}` });
      }
    }

    if (!turns.length || turns[turns.length - 1].role !== "user") {
      return errorResponse("Send a question.", 400);
    }

    // ── Build the conversation ──────────────────────────────────────────────
    const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" });
    let system: string;
    if (mode === "learner") {
      const ctx = user
        ? await learnerContext(db, user.id)
        : formatLearnerContext({
            name: body.demo?.profile?.full_name, designation: body.demo?.profile?.designation,
            department: body.demo?.profile?.department,
            gaps: (body.demo?.gaps ?? []).slice(0, 10).map((g: Any) => String(g).slice(0, 200)),
            materials: (body.demo?.materials ?? []).slice(0, 20)
              .map((m: Any) => `- ${String(m.title ?? "").slice(0, 200)} (${m.kind ?? "material"})`).join("\n"),
          });
      system = `${PERSONA}

You are this officer's tutor. They come to you to ask questions and clear doubts — about statistics, survey methodology, national accounts, data tools, digital governance, or the material their department assigned.
- Explain clearly, then check understanding. Prefer a small worked example to an abstract definition.
- Use Indian statistical context where it helps: NSS, PLFS, HCES, ASI, IIP, CPI, GVA, NIC/NCO, SQAF.
- If they are wrong, say so kindly and show why. Do not let a misconception stand to be agreeable.
- Connect answers to their measured gaps when relevant, and point to assigned material by title when it covers the question.
- Say plainly when something is general knowledge rather than from their material.
Today is ${today}.

${ctx}`;
    } else {
      system = `${PERSONA}

You are the administrator's operations assistant for Samiksha. They ask you for data and delegate tasks.
- Use the tools to answer from real platform data. Call as many read tools as you need before answering; never guess a number.
- For a task that changes something (publishing or assigning material, creating an account, switching one off, resetting a password), call the matching action tool. The administrator will be shown the action and must confirm it before it happens, so call it directly rather than asking "shall I?".
- After data lookups, lead with the answer, then the few details that matter. Name officers with their employee ID.
- When a request has several parts — a question and a task — answer every question in your reply as well as proposing the task.
- You cannot send messages, publish official statistics or change competency scores; say so if asked.
Today is ${today}.${isDemo ? "\nThis is the demo organisation; its data is illustrative." : ""}`;
    }

    const messages: RawMessage[] = [{ role: "system", content: system }, ...turns];
    const tools = mode === "admin" ? [...READ_TOOLS, ...WRITE_TOOLS] : [];
    let pending: PendingAction | null = null;
    let reply = "";
    let cost = 0, promptTokens = 0, completionTokens = 0, latency = 0, model = "";
    const toolsUsed: string[] = [];
    // Text the model writes alongside proposing an action is often the answer
    // to the rest of the request; keep it rather than only the final turn.
    const actionNotes: string[] = [];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const r = await chatWithTools({
        messages,
        // On the last round, withhold tools so the model has to answer.
        tools: round === MAX_TOOL_ROUNDS ? [] : tools,
        temperature: mode === "learner" ? 0.4 : 0.2,
        maxTokens: 3000,
      });
      cost += r.costUsd; promptTokens += r.promptTokens; completionTokens += r.completionTokens;
      latency += r.latencyMs; model = r.model;

      const calls = r.message.tool_calls ?? [];
      if (!calls.length) { reply = r.message.content ?? ""; break; }

      messages.push({ role: "assistant", content: r.message.content ?? "", tool_calls: calls });
      if (r.message.content?.trim() && calls.some((c) => WRITE_NAMES.has(c.function.name))) {
        actionNotes.push(r.message.content.trim());
      }
      for (const call of calls) {
        let args: Record<string, Any> = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* empty args */ }
        const name = call.function.name;
        toolsUsed.push(name);

        if (WRITE_NAMES.has(name)) {
          const queued = !pending;
          if (queued) pending = { tool: name, args, summary: describeAction(name, args) };
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(queued
            ? { status: "shown to the administrator for confirmation",
                instruction: "Do not call this action again. Your reply must still answer every question the administrator asked, using the data you looked up. End with one short line saying this action is waiting for their confirmation." }
            : { status: "not queued", reason: "Only one action can await confirmation at a time. Tell the administrator to confirm the first one and then ask for this." }) });
          continue;
        }
        let result: unknown;
        try {
          result = live ? await live.run(name, args) : demoRun(body.demo, name, args);
        } catch (e) {
          result = { error: (e as Error).message };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 30_000) });
      }
    }

    const finalText = reply.trim();
    reply = [...actionNotes.filter((n) => !finalText.includes(n)), finalText].filter(Boolean).join("\n\n");

    await logGeneration(db, {
      userId, task, model, promptTokens, completionTokens, costUsd: cost, latencyMs: latency, success: true,
      meta: { mode, tools: toolsUsed, pending: (pending as PendingAction | null)?.tool ?? null },
    });

    return jsonResponse({
      reply: reply.trim() || (pending
        ? "Here is what I will do. Confirm to go ahead."
        : "I could not put an answer together. Try asking another way."),
      pending_action: pending,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[assistant] unhandled", err);
    await logGeneration(db, { userId, task, model: "", success: false, errorMessage: (err as Error)?.message });
    return errorResponse("The assistant could not answer right now. Please try again.", 500, (err as Error)?.message);
  }
});
