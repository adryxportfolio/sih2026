/**
 * Department study material.
 *
 * Administrators publish PDFs, slide decks, videos and links to a department —
 * or to every department — and choose which officers inside it receive them.
 * Officers see what they were given in their Library.
 *
 * Live mode goes through Supabase (Storage for files, `assign_material()` for
 * recipients). Demo mode keeps the same shapes in AsyncStorage on the device,
 * so something published in the administrator demo shows up in the officer
 * demo on the same phone — which is the part of the story worth seeing.
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import { File as FSFile } from "expo-file-system";
import { supabase } from "./supabase";
import { DEMO_OFFICERS, DEMO_VIDEOS } from "./demo";
import { notify } from "./dialog";

export type MaterialKind = "pdf" | "pptx" | "docx" | "video" | "youtube" | "link" | "image" | "document";
export type Audience = "all_departments" | "department";

export interface DirectoryPerson {
  user_id: string;
  full_name: string;
  employee_code: string | null;
  designation: string | null;
  department_id: string;
  department_name: string;
}

export interface Department {
  id: string;
  name: string;
  people: DirectoryPerson[];
}

export interface PublishedMaterial {
  id: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  audience: Audience;
  published_to: string;
  assigned: number;
  opened: number;
  created_at: string;
}

export interface AssignedMaterial {
  id: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  external_url: string | null;
  youtube_id: string | null;
  storage_path: string | null;
  file_name: string | null;
  assigned_at: string;
  opened_at: string | null;
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  /** Present on web — the browser File behind the picker result. */
  file?: Blob | null;
}

export interface PublishInput {
  title: string;
  description?: string;
  kind: MaterialKind;
  url?: string;
  file?: PickedFile;
  audience: Audience;
  departmentId: string | null;
  departmentName: string;
  userIds: string[];
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const UNASSIGNED = "unassigned";

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
export function youtubeIdFrom(url: string): string | null {
  const m = url.trim().match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/,
  );
  return m?.[1] ?? null;
}

export function kindFromFile(name: string, mime?: string | null): MaterialKind {
  const n = name.toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (m.includes("presentation") || m.includes("powerpoint") || /\.(pptx?|ppsx)$/.test(n)) return "pptx";
  if (m.includes("wordprocessing") || m.includes("msword") || /\.docx?$/.test(n)) return "docx";
  if (m.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|3gp)$/.test(n)) return "video";
  if (m.startsWith("image/")) return "image";
  return "document";
}

export const KIND_META: Record<MaterialKind, { label: string; icon: string }> = {
  pdf: { label: "PDF", icon: "document-text" },
  pptx: { label: "SLIDES", icon: "easel" },
  docx: { label: "DOCUMENT", icon: "document" },
  video: { label: "VIDEO", icon: "videocam" },
  youtube: { label: "YOUTUBE", icon: "logo-youtube" },
  link: { label: "LINK", icon: "link" },
  image: { label: "IMAGE", icon: "image" },
  document: { label: "FILE", icon: "document-attach" },
};

export function formatBytes(n?: number | null): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) throw new Error("Your session has expired. Sign in again.");
  return data.user.id;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Demo store
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_STORE_KEY = "samiksha.demoMaterials.v1";

/** The demo learner is Ananya, who is d1 on the administrator's roster. */
export const DEMO_LEARNER_ID = "d1";

interface DemoMaterial {
  id: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  external_url: string | null;
  youtube_id: string | null;
  file_name: string | null;
  audience: Audience;
  published_to: string;
  user_ids: string[];
  opened_ids: string[];
  created_at: string;
}

/** A small multi-department organisation for the picker. */
export const DEMO_DEPARTMENTS: Department[] = (() => {
  const mh: DirectoryPerson[] = DEMO_OFFICERS.map((o) => ({
    user_id: o.user_id, full_name: o.full_name, employee_code: o.employee_code,
    designation: o.designation, department_id: "dept-mh",
    department_name: "Directorate of Economics and Statistics, Maharashtra",
  }));
  const make = (id: string, name: string, rows: [string, string, string, string][]): Department => ({
    id, name,
    people: rows.map(([user_id, full_name, employee_code, designation]) => ({
      user_id, full_name, employee_code, designation, department_id: id, department_name: name,
    })),
  });
  return [
    { id: "dept-mh", name: "Directorate of Economics and Statistics, Maharashtra", people: mh },
    make("dept-nso", "National Statistical Office", [
      ["n1", "Farah Siddiqui", "NSO-SSO-1182", "Senior Statistical Officer"],
      ["n2", "Deepak Rawat", "NSO-JSO-2046", "Junior Statistical Officer"],
      ["n3", "Lakshmi Menon", "NSO-DD-0310", "Deputy Director"],
    ]),
    make("dept-tn", "Directorate of Economics and Statistics, Tamil Nadu", [
      ["t1", "Karthik Subramanian", "TN-JSO-7731", "Junior Statistical Officer"],
      ["t2", "Revathi Balan", "TN-FI-6620", "Field Investigator"],
      ["t3", "Senthil Kumar", "TN-ASD-0415", "Assistant Director (Statistics)"],
    ]),
    make("dept-wb", "Directorate of Economics and Statistics, West Bengal", [
      ["w1", "Sayan Chatterjee", "WB-SSO-3390", "Senior Statistical Officer"],
      ["w2", "Moumita Ghosh", "WB-JSO-4108", "Junior Statistical Officer"],
    ]),
  ];
})();

function demoSeed(): DemoMaterial[] {
  const all = DEMO_DEPARTMENTS.flatMap((d) => d.people.map((p) => p.user_id));
  const mh = DEMO_DEPARTMENTS[0].people.map((p) => p.user_id);
  const day = 86_400_000;
  return [
    {
      id: "dm-1", title: DEMO_VIDEOS[1].title,
      description: "Watch before the two-stage weights exercise on Friday.",
      kind: "youtube", external_url: `https://www.youtube.com/watch?v=${DEMO_VIDEOS[1].youtube_id}`,
      youtube_id: DEMO_VIDEOS[1].youtube_id, file_name: null,
      audience: "department", published_to: DEMO_DEPARTMENTS[0].name,
      user_ids: mh, opened_ids: ["d2", "d3"], created_at: new Date(Date.now() - 2 * day).toISOString(),
    },
    {
      id: "dm-2", title: "iGOT Karmayogi — DPDP Act for Data Handlers",
      description: "Mandatory for everyone who handles unit-level survey data.",
      kind: "link", external_url: "https://igotkarmayogi.gov.in/",
      youtube_id: null, file_name: null,
      audience: "all_departments", published_to: "All departments",
      user_ids: all, opened_ids: ["d2", "n1", "t3"], created_at: new Date(Date.now() - 5 * day).toISOString(),
    },
  ];
}

async function readDemo(): Promise<DemoMaterial[]> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_STORE_KEY);
    if (raw) return JSON.parse(raw) as DemoMaterial[];
  } catch { /* fall through to the seed */ }
  const seed = demoSeed();
  await writeDemo(seed);
  return seed;
}

async function writeDemo(rows: DemoMaterial[]) {
  try { await AsyncStorage.setItem(DEMO_STORE_KEY, JSON.stringify(rows)); } catch { /* best effort */ }
}

export async function listDemoMaterials() {
  return readDemo();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Directory — departments and the officers in each
// ─────────────────────────────────────────────────────────────────────────────
export async function loadDirectory(isDemo: boolean): Promise<Department[]> {
  if (isDemo) return DEMO_DEPARTMENTS;

  const { data, error } = await supabase.rpc("admin_directory");
  if (error) throw new Error(error.message);

  const byDept = new Map<string, Department>();
  for (const row of (data ?? []) as any[]) {
    if (row.role === "admin" || row.is_active === false) continue;
    const id = row.department_id ?? UNASSIGNED;
    const name = row.department_name ?? "No department";
    const dept: Department = byDept.get(id) ?? { id, name, people: [] };
    dept.people.push({
      user_id: row.user_id, full_name: row.full_name ?? "Unnamed officer",
      employee_code: row.employee_code, designation: row.designation,
      department_id: id, department_name: name,
    });
    byDept.set(id, dept);
  }
  // Departments with no officers are still valid targets for later, but an
  // empty checklist is noise when choosing who gets something now.
  return [...byDept.values()].sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Publishing (administrator)
// ─────────────────────────────────────────────────────────────────────────────
export async function publishMaterial(isDemo: boolean, input: PublishInput): Promise<{ assigned: number }> {
  const title = input.title.trim();
  if (!title) throw new Error("Give the material a title.");
  if (!input.userIds.length) throw new Error("Choose at least one officer.");

  const youtubeId = input.kind === "youtube" && input.url ? youtubeIdFrom(input.url) : null;
  if (input.kind === "youtube" && !youtubeId) throw new Error("That does not look like a YouTube link.");
  if (input.kind === "link" && !/^https?:\/\/\S+\.\S+/i.test(input.url ?? "")) {
    throw new Error("Enter a full link starting with https://");
  }
  if (input.file?.size && input.file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Files up to ${formatBytes(MAX_UPLOAD_BYTES)} can be uploaded. For longer videos, publish a YouTube link instead.`);
  }

  if (isDemo) {
    const rows = await readDemo();
    rows.unshift({
      id: `dm-${Date.now()}`, title, description: input.description?.trim() || null,
      kind: input.kind, external_url: input.url?.trim() || null, youtube_id: youtubeId,
      file_name: input.file?.name ?? null, audience: input.audience,
      published_to: input.audience === "all_departments" ? "All departments" : input.departmentName,
      user_ids: input.userIds, opened_ids: [], created_at: new Date().toISOString(),
    });
    await writeDemo(rows);
    return { assigned: input.userIds.length };
  }

  const uid = await currentUserId();
  let storagePath: string | null = null;

  if (input.file) {
    const safe = input.file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
    storagePath = `${uid}/${Date.now()}-${safe}`;
    // Web hands us the browser File. On a phone the picker returns a cached
    // file:// path, and React Native's fetch cannot reliably read those into
    // bytes — expo-file-system can.
    const body: Blob | ArrayBuffer = input.file.file
      ?? (Platform.OS === "web"
        ? await (await fetch(input.file.uri)).arrayBuffer()
        : await new FSFile(input.file.uri).arrayBuffer());
    const { error } = await supabase.storage.from("materials").upload(storagePath, body, {
      contentType: input.file.mimeType ?? "application/octet-stream",
      upsert: false,
    });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: row, error: insertErr } = await supabase.from("materials").insert({
    owner_id: uid,
    title,
    description: input.description?.trim() || null,
    kind: input.kind,
    external_url: input.url?.trim() || null,
    youtube_id: youtubeId,
    storage_path: storagePath,
    mime_type: input.file?.mimeType ?? null,
    file_size_bytes: input.file?.size ?? null,
    status: "ready",
    visibility: "organization",
  }).select("id").single();
  if (insertErr || !row) {
    if (storagePath) await supabase.storage.from("materials").remove([storagePath]).catch(() => {});
    throw new Error(insertErr?.message ?? "Could not save the material.");
  }

  const { data: count, error: assignErr } = await supabase.rpc("assign_material", {
    p_material_id: row.id,
    p_user_ids: input.userIds,
    p_audience: input.audience,
    p_department_id: input.audience === "department" && input.departmentId !== UNASSIGNED ? input.departmentId : null,
  });
  if (assignErr) throw new Error(assignErr.message);
  return { assigned: Number(count ?? input.userIds.length) };
}

export async function listPublished(isDemo: boolean): Promise<PublishedMaterial[]> {
  if (isDemo) {
    return (await readDemo()).map((m) => ({
      id: m.id, title: m.title, description: m.description, kind: m.kind, audience: m.audience,
      published_to: m.published_to, assigned: m.user_ids.length, opened: m.opened_ids.length,
      created_at: m.created_at,
    }));
  }
  const { data, error } = await supabase
    .from("materials")
    .select("id, title, description, kind, audience, created_at, organizations:department_id(name), material_assignments(opened_at)")
    .neq("audience", "owner")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((m) => ({
    id: m.id, title: m.title, description: m.description, kind: m.kind, audience: m.audience,
    published_to: m.audience === "all_departments" ? "All departments" : m.organizations?.name ?? "Selected officers",
    assigned: m.material_assignments?.length ?? 0,
    opened: (m.material_assignments ?? []).filter((a: any) => a.opened_at).length,
    created_at: m.created_at,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Receiving (officer)
// ─────────────────────────────────────────────────────────────────────────────
export async function listAssigned(isDemo: boolean): Promise<AssignedMaterial[]> {
  if (isDemo) {
    return (await readDemo())
      .filter((m) => m.user_ids.includes(DEMO_LEARNER_ID))
      .map((m) => ({
        id: m.id, title: m.title, description: m.description, kind: m.kind,
        external_url: m.external_url, youtube_id: m.youtube_id, storage_path: null,
        file_name: m.file_name, assigned_at: m.created_at,
        opened_at: m.opened_ids.includes(DEMO_LEARNER_ID) ? m.created_at : null,
      }));
  }
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("material_assignments")
    .select("assigned_at, opened_at, materials!inner(id, title, description, kind, external_url, youtube_id, storage_path)")
    .eq("user_id", uid)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((a) => ({
    ...a.materials,
    file_name: a.materials.storage_path?.split("/").pop()?.replace(/^\d+-/, "") ?? null,
    assigned_at: a.assigned_at,
    opened_at: a.opened_at,
  }));
}

async function markOpened(isDemo: boolean, materialId: string) {
  if (isDemo) {
    const rows = await readDemo();
    const m = rows.find((r) => r.id === materialId);
    if (m && !m.opened_ids.includes(DEMO_LEARNER_ID)) {
      m.opened_ids.push(DEMO_LEARNER_ID);
      await writeDemo(rows);
    }
    return;
  }
  const uid = await currentUserId().catch(() => null);
  if (!uid) return;
  await supabase.from("material_assignments")
    .update({ opened_at: new Date().toISOString() })
    .eq("material_id", materialId).eq("user_id", uid).is("opened_at", null);
}

/**
 * Open a material the way its format needs.
 *
 * YouTube plays in-app. Slides and documents go through a hosted viewer
 * because Android has no built-in renderer for PPTX, and a PDF handed to the
 * browser on Android downloads instead of opening. Files are served through
 * short-lived signed URLs, so the bucket itself stays private.
 */
export async function openMaterial(
  isDemo: boolean,
  m: AssignedMaterial,
  push: (href: string) => void,
): Promise<void> {
  markOpened(isDemo, m.id).catch(() => {});

  if (m.kind === "youtube" && m.youtube_id) {
    push(`/video/${m.youtube_id}?title=${encodeURIComponent(m.title)}`);
    return;
  }
  if (m.external_url) {
    await openUrl(m.external_url);
    return;
  }
  if (isDemo || !m.storage_path) {
    notify(
      "Demo material",
      `"${m.file_name ?? m.title}" was published in demo mode, so the file stays on the administrator's device. With an account, it opens here from secure storage.`,
    );
    return;
  }

  const { data, error } = await supabase.storage.from("materials").createSignedUrl(m.storage_path, 60 * 60);
  if (error || !data?.signedUrl) {
    notify("Could not open this file", error?.message ?? "Try again in a moment.");
    return;
  }
  const signed = data.signedUrl;
  if (Platform.OS === "web" || m.kind === "video" || m.kind === "image") {
    await openUrl(signed);
  } else if (m.kind === "pptx" || m.kind === "docx") {
    await openUrl(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(signed)}`);
  } else {
    await openUrl(`https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(signed)}`);
  }
}

async function openUrl(url: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener");
    return;
  }
  await WebBrowser.openBrowserAsync(url).catch(() => notify("Could not open the link", url));
}

// Words every directorate shares; matching on them picks whichever is listed first.
const COMMON_WORDS = new Set(["directorate", "department", "economics", "statistics", "statistical",
  "national", "office", "ministry", "state", "and", "the", "for"]);

/** The department a person means by a full name, part of one, or a place. */
export function matchDepartmentName<T extends { name: string }>(items: T[], query?: string | null): T | undefined {
  const q = String(query ?? "").toLowerCase().trim();
  if (!q) return undefined;
  const exact = items.find((d) => d.name.toLowerCase() === q);
  if (exact) return exact;
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  for (const distinctiveOnly of [true, false]) {
    let best: T | undefined;
    let bestScore = 0;
    for (const d of items) {
      const n = d.name.toLowerCase();
      let score = n.includes(q) ? 1000 : 0;
      for (const w of words) if ((!distinctiveOnly || !COMMON_WORDS.has(w)) && n.includes(w)) score += w.length;
      if (score > bestScore) { best = d; bestScore = score; }
    }
    if (best) return best;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Demo effects from the administrator assistant
// ─────────────────────────────────────────────────────────────────────────────
export async function applyDemoAssistantEffect(tool: string, args: Record<string, any>) {
  if (tool !== "publish_link" && tool !== "assign_material") return;

  const deptMatch = (name?: string) => matchDepartmentName(DEMO_DEPARTMENTS, name);
  let userIds: string[] = [];
  let publishedTo = "Selected officers";
  let audience: Audience = "department";
  if (Array.isArray(args.employee_codes) && args.employee_codes.length) {
    const codes = args.employee_codes.map((c: string) => String(c).toUpperCase());
    userIds = DEMO_DEPARTMENTS.flatMap((d) => d.people).filter((p) => codes.includes(String(p.employee_code))).map((p) => p.user_id);
  } else if (args.all_departments) {
    userIds = DEMO_DEPARTMENTS.flatMap((d) => d.people.map((p) => p.user_id));
    publishedTo = "All departments";
    audience = "all_departments";
  } else if (args.department) {
    const d = deptMatch(args.department);
    if (d) { userIds = d.people.map((p) => p.user_id); publishedTo = d.name; }
  }

  const rows = await readDemo();
  if (tool === "publish_link") {
    const url = String(args.url ?? "");
    const yt = youtubeIdFrom(url);
    rows.unshift({
      id: `dm-${Date.now()}`, title: String(args.title ?? "Study material"),
      description: args.description ? String(args.description) : null,
      kind: yt ? "youtube" : "link", external_url: url, youtube_id: yt, file_name: null,
      audience, published_to: publishedTo, user_ids: userIds, opened_ids: [],
      created_at: new Date().toISOString(),
    });
  } else {
    const q = String(args.material ?? "").toLowerCase();
    const m = rows.find((r) => r.id === args.material || r.title.toLowerCase().includes(q));
    if (m) {
      m.user_ids = [...new Set([...m.user_ids, ...userIds])];
      m.audience = audience;
      m.published_to = publishedTo;
    }
  }
  await writeDemo(rows);
}

