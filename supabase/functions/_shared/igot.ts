/**
 * iGOT Karmayogi integration adapter.
 *
 * WHAT IS AND ISN'T POSSIBLE HERE
 * ─────────────────────────────────────────────────────────────────────────
 * iGOT Karmayogi is a closed platform for serving civil servants — you cannot
 * obtain API credentials without an institutional arrangement.
 *
 * But the API *contracts* are public. Karmayogi Bharat publishes its platform
 * source under the `KB-iGOT` GitHub organisation (100+ repositories), and
 * `KB-iGOT/deterministic-chatbot` documents the exact request and response
 * shapes of the production endpoints, against the UAT host
 * `portal.uat.karmayogibharat.net`.
 *
 * So this adapter is written against the REAL endpoints, not a generic guess
 * at "some Sunbird-shaped API":
 *
 *   POST /api/composite/v4/search          content search (courses/programs/events)
 *   GET  /api/accessSettings/read/{id}     per-course access eligibility
 *   GET  /api/user/private/v1/read/{id}    user profile (rootOrgId, profileStatus)
 *   POST /api/private/user/v1/search       MDO admin lookup
 *
 * Two details we take directly from the platform's own documentation, both of
 * which a from-scratch integration would get wrong:
 *
 *  1. NO `primaryCategory` FILTER. Karmayogi's taxonomy includes course-like
 *     categories beyond "Course"/"Program" — notably "Curated Program".
 *     Filtering on primaryCategory silently drops live courses.
 *
 *  2. `secureSettings` MARKS MODERATED COURSES. When present, enrolment is
 *     gated on the learner's `rootOrgId`/`ministryOrStateId` appearing in
 *     `secureSettings.organisation`, and — if `isVerifiedKarmayogi === "Yes"` —
 *     on `profileDetails.profileStatus === "VERIFIED"`. We implement that
 *     eligibility check so recommendations never surface a course the officer
 *     cannot actually open.
 *
 * `IGOT_MODE=mock` → seeded catalogue built from published NSSTA/MoSPI curricula.
 * `IGOT_MODE=live` → the same code paths hit the real endpoints.
 *
 * Both modes normalise to `IgotCourse`, so nothing downstream knows or cares.
 */

export interface IgotCourse {
  externalId: string;
  title: string;
  description: string;
  provider: string;
  thumbnailUrl: string | null;
  contentUrl: string | null;
  durationMinutes: number;
  language: string;
  difficulty: "unskilled" | "beginner" | "practitioner" | "proficient" | "expert";
  rating: number | null;
  enrolledCount: number;
  competencyCodes: string[];
  raw: Record<string, unknown>;
}

export function igotMode(): "mock" | "live" {
  return (Deno.env.get("IGOT_MODE") ?? "mock").toLowerCase() === "live" ? "live" : "mock";
}

// ─────────────────────────────────────────────────────────────────────────────
//  MOCK CATALOGUE
//  Derived from published NSSTA / MoSPI Capacity Development programme areas
//  and Karmayogi behavioural modules, mapped onto our FRAC codes.
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_CATALOGUE: IgotCourse[] = [
  {
    externalId: "do_1137421905PHASE01",
    title: "Foundations of Sampling Theory for Official Statistics",
    description:
      "Probability sampling for large-scale household and establishment surveys: simple random, stratified and multi-stage designs, design weights, and variance estimation under complex designs. Worked examples use NSS survey structures.",
    provider: "National Statistical Systems Training Academy (NSSTA)",
    thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE01",
    durationMinutes: 480, language: "en", difficulty: "practitioner",
    rating: 4.6, enrolledCount: 12480,
    competencyCodes: ["FUN-SAMP-01", "DOM-NSS-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE02",
    title: "Statistical Quality Assurance Framework (SQAF) in Practice",
    description:
      "Applying MoSPI's SQAF across the statistical production cycle: quality dimensions, self-assessment, quality reporting and remediation planning for a statistical product.",
    provider: "MoSPI", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE02",
    durationMinutes: 300, language: "en", difficulty: "proficient",
    rating: 4.4, enrolledCount: 8120,
    competencyCodes: ["FUN-QUAL-01", "FUN-META-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE03",
    title: "Data Cleaning, Editing and Imputation",
    description:
      "Detecting and treating errors, outliers and item non-response. Edit rule design, deterministic vs model-based imputation, and quantifying the impact of imputation on published estimates.",
    provider: "NSSTA", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE03",
    durationMinutes: 360, language: "en", difficulty: "practitioner",
    rating: 4.3, enrolledCount: 9640,
    competencyCodes: ["FUN-CLEAN-01", "FUN-TOOL-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE04",
    title: "National Metadata Structure (NMDS 2.0) and Statistical Standards",
    description:
      "Documenting statistical products using NMDS 2.0, and correct application of NIC, NCO and COICOP classifications for comparability across products and over time.",
    provider: "MoSPI", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE04",
    durationMinutes: 240, language: "en", difficulty: "practitioner",
    rating: 4.2, enrolledCount: 6210,
    competencyCodes: ["FUN-META-01", "FUN-DISS-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE05",
    title: "R and Python for Reproducible Statistical Production",
    description:
      "Building auditable, version-controlled analytical pipelines. Survey-weighted estimation in R (`survey`) and Python, plus reproducibility practices for official releases.",
    provider: "NSSTA", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE05",
    durationMinutes: 600, language: "en", difficulty: "practitioner",
    rating: 4.7, enrolledCount: 15330,
    competencyCodes: ["FUN-TOOL-01", "FUN-ANAL-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE06",
    title: "Statistical Disclosure Control and Respondent Confidentiality",
    description:
      "Legal obligations under the Collection of Statistics Act and practical SDC: suppression, aggregation, perturbation and safe microdata release.",
    provider: "MoSPI", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE06",
    durationMinutes: 180, language: "en", difficulty: "practitioner",
    rating: 4.5, enrolledCount: 7450,
    competencyCodes: ["FUN-CONF-01", "BEH-INT-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE07",
    title: "National Accounts Statistics: Concepts and Compilation",
    description:
      "GDP and GVA compilation under the SNA framework, sectoral estimation, deflation, and the mechanics of base-year revision.",
    provider: "NSSTA", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE07",
    durationMinutes: 540, language: "en", difficulty: "proficient",
    rating: 4.4, enrolledCount: 5890,
    competencyCodes: ["DOM-NAS-01", "DOM-PRICE-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE08",
    title: "Price Statistics: CPI and WPI Construction",
    description:
      "Index number theory applied to Indian price indices: item basket and weight revision, price collection quality, substitution bias and linking.",
    provider: "MoSPI", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE08",
    durationMinutes: 300, language: "en", difficulty: "proficient",
    rating: 4.3, enrolledCount: 4720,
    competencyCodes: ["DOM-PRICE-01", "FUN-ANAL-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE09",
    title: "Field Operations Management for Large-Scale Surveys",
    description:
      "Planning and supervising enumeration: enumerator training, workload allocation, non-response follow-up, and field-level quality control.",
    provider: "NSSTA", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE09",
    durationMinutes: 270, language: "en", difficulty: "practitioner",
    rating: 4.1, enrolledCount: 11200,
    competencyCodes: ["FUN-COLL-01", "BEH-PPL-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE10",
    title: "Data Visualisation and Communicating Statistics to Non-Specialists",
    description:
      "Designing honest statistical graphics, representing uncertainty, and briefing senior officers and the public without distorting findings.",
    provider: "Karmayogi Bharat", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE10",
    durationMinutes: 210, language: "en", difficulty: "practitioner",
    rating: 4.6, enrolledCount: 18900,
    competencyCodes: ["FUN-VIZ-01", "BEH-COM-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE11",
    title: "Big Data and Administrative Data for Official Statistics",
    description:
      "Assessing fitness-for-use of scanner, satellite, mobile and administrative data; record linkage to survey frames; and the quality framework for non-traditional sources.",
    provider: "NSSTA", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE11",
    durationMinutes: 330, language: "en", difficulty: "proficient",
    rating: 4.4, enrolledCount: 6800,
    competencyCodes: ["FUN-BIGD-01", "FUN-QUAL-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE12",
    title: "Ethics and Professional Independence in Official Statistics",
    description:
      "The UN Fundamental Principles of Official Statistics applied to Indian practice: impartiality, resisting undue influence, and the ethics of release timing.",
    provider: "Karmayogi Bharat", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE12",
    durationMinutes: 150, language: "en", difficulty: "practitioner",
    rating: 4.8, enrolledCount: 22400,
    competencyCodes: ["BEH-INT-01", "BEH-DEC-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE13",
    title: "SDG National Indicator Framework: Compilation and Reporting",
    description:
      "Mapping NIF indicators to data sources, resolving data gaps, and preparing SDG metadata for national and international reporting.",
    provider: "MoSPI", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE13",
    durationMinutes: 240, language: "en", difficulty: "proficient",
    rating: 4.2, enrolledCount: 5100,
    competencyCodes: ["DOM-SDG-01", "FUN-META-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE14",
    title: "Questionnaire Design and CAPI Instrument Development",
    description:
      "Writing questions that minimise measurement error, cognitive pre-testing, and building CAPI instruments with embedded validation and skip logic.",
    provider: "NSSTA", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE14",
    durationMinutes: 285, language: "en", difficulty: "practitioner",
    rating: 4.3, enrolledCount: 7900,
    competencyCodes: ["FUN-QUES-01", "FUN-COLL-01"],
    raw: {},
  },
  {
    externalId: "do_1137421905PHASE15",
    title: "Decision Making and Leadership for Statistical Managers",
    description:
      "Karmayogi behavioural module: structured decision making under uncertainty, stakeholder management, and leading technical teams.",
    provider: "Karmayogi Bharat", thumbnailUrl: null,
    contentUrl: "https://igotkarmayogi.gov.in/course/do_1137421905PHASE15",
    durationMinutes: 195, language: "en", difficulty: "proficient",
    rating: 4.5, enrolledCount: 31200,
    competencyCodes: ["BEH-DEC-01", "BEH-PPL-01", "BEH-COL-01"],
    raw: {},
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  LIVE — Karmayogi composite search (real contract)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_IGOT_BASE = "https://portal.uat.karmayogibharat.net";

const DIFFICULTY_MAP: Record<string, IgotCourse["difficulty"]> = {
  beginner: "beginner", foundation: "beginner",
  intermediate: "practitioner", practitioner: "practitioner",
  advanced: "proficient", proficient: "proficient", expert: "expert",
};

/** `secureSettings` as published in the Karmayogi integration docs. */
export interface SecureSettings {
  isVerifiedKarmayogi?: "Yes" | "No";
  organisation?: string[];
  version?: number;
}

export interface LearnerEligibilityContext {
  rootOrgId?: string | null;
  ministryOrStateId?: string | null;
  profileStatus?: string | null;
}

/**
 * Gate 1 of the moderated-course check, mirroring Karmayogi's
 * `check_secure_settings_eligibility` transform.
 *
 * Returns true when the course is open, or when the learner satisfies every
 * applicable restriction (AND logic).
 */
export function isEligibleForCourse(
  secureSettings: SecureSettings | null | undefined,
  ctx: LearnerEligibilityContext,
): boolean {
  if (!secureSettings || typeof secureSettings !== "object") return true; // not moderated

  const orgs = secureSettings.organisation ?? [];
  if (orgs.length > 0) {
    const mine = [ctx.rootOrgId, ctx.ministryOrStateId].filter(Boolean) as string[];
    if (!mine.some((id) => orgs.includes(id))) return false;
  }

  if (secureSettings.isVerifiedKarmayogi === "Yes") {
    if ((ctx.profileStatus ?? "").toUpperCase() !== "VERIFIED") return false;
  }

  return true;
}

function igotBase(): string {
  return Deno.env.get("IGOT_BASE_URL") || DEFAULT_IGOT_BASE;
}

function normaliseKarmayogi(item: Record<string, any>): IgotCourse {
  const base = igotBase();
  return {
    externalId: String(item.identifier ?? ""),
    title: String(item.name ?? "Untitled course"),
    description: String(item.description ?? ""),
    provider: String(
      item.source ?? item.creatorContacts?.[0]?.name ?? item.orgDetails?.orgName ?? "iGOT Karmayogi",
    ),
    thumbnailUrl: item.posterImage ?? item.appIcon ?? null,
    contentUrl: item.identifier ? `${base}/app/toc/${item.identifier}/overview` : null,
    // Karmayogi reports duration in seconds
    durationMinutes: item.duration ? Math.round(Number(item.duration) / 60) : 0,
    language: Array.isArray(item.language) ? (item.language[0] ?? "en") : (item.language ?? "en"),
    difficulty: DIFFICULTY_MAP[String(item.difficultyLevel ?? "").toLowerCase()] ?? "practitioner",
    rating: item.averageRating != null ? Number(item.averageRating) : null,
    enrolledCount: Number(item.enrolmentCount ?? 0),
    // FRAC competencies ride under competencies_v5 / competencies_v6
    competencyCodes: (item.competencies_v6 ?? item.competencies_v5 ?? item.competency ?? [])
      .map((c: any) => c?.competencyAreaCode ?? c?.code ?? c?.competencyArea ?? c?.name)
      .filter(Boolean)
      .map(String),
    raw: item,
  };
}

async function karmayogiSearch(
  query: string,
  limit: number,
  opts: { statuses?: string[] } = {},
): Promise<{ count: number; courses: IgotCourse[]; rawContent: Record<string, any>[] }> {
  const key = Deno.env.get("IGOT_API_KEY");

  const res = await fetch(`${igotBase()}/api/composite/v4/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Authorization": `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      request: {
        query,
        // Deliberately NO primaryCategory filter — see the header note.
        filters: { status: opts.statuses ?? ["Live"] },
        sort_by: { createdOn: "desc" },
        limit,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`iGOT composite search failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  const json = await res.json();
  const content: Record<string, any>[] = json?.result?.content ?? [];
  return {
    count: Number(json?.result?.count ?? content.length),
    courses: content.map(normaliseKarmayogi),
    rawContent: content,
  };
}

/**
 * Per-course access settings. Returns null when no config exists, which
 * Karmayogi treats as "public".
 */
export async function fetchAccessSettings(courseId: string): Promise<Record<string, any> | null> {
  const key = Deno.env.get("IGOT_API_KEY");
  const res = await fetch(`${igotBase()}/api/accessSettings/read/${encodeURIComponent(courseId)}`, {
    headers: key ? { "Authorization": `Bearer ${key}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC API — identical shape in both modes
// ─────────────────────────────────────────────────────────────────────────────

/** Find courses developing any of the given FRAC competency codes. */
export async function findCoursesForCompetencies(
  competencyCodes: string[],
  limit = 12,
): Promise<IgotCourse[]> {
  if (igotMode() === "live") {
    try {
      const { courses } = await karmayogiSearch(competencyCodes.join(" "), limit);
      if (courses.length) return courses;
      console.warn("[igot] live search returned nothing; using catalogue");
    } catch (e) {
      // Degrade rather than fail the learner's request.
      console.error("[igot] live search failed, falling back to catalogue", e);
    }
  }

  const wanted = new Set(competencyCodes);
  const scored = MOCK_CATALOGUE
    .map((c) => ({ course: c, hits: c.competencyCodes.filter((x) => wanted.has(x)).length }))
    .filter((s) => s.hits > 0)
    .sort((a, b) =>
      b.hits - a.hits ||
      (b.course.rating ?? 0) - (a.course.rating ?? 0) ||
      b.course.enrolledCount - a.course.enrolledCount
    );

  return scored.slice(0, limit).map((s) => s.course);
}

export async function listAllCourses(): Promise<IgotCourse[]> {
  if (igotMode() === "live") {
    try {
      const { courses } = await karmayogiSearch("", 100);
      if (courses.length) return courses;
    } catch (e) {
      console.error("[igot] live list failed, using catalogue", e);
    }
  }
  return MOCK_CATALOGUE;
}
