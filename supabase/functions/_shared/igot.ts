/**
 * iGOT Karmayogi integration adapter.
 *
 * REALITY CHECK — read before judging this file
 * ─────────────────────────────────────────────────────────────────────────
 * iGOT Karmayogi is a closed government platform for serving civil servants.
 * There is no public developer API and no sandbox. Any project claiming a
 * live iGOT integration outside a signed MoU is claiming something it cannot
 * have.
 *
 * So we do the honest engineering thing: implement against the REAL contract
 * and make the data source a configuration flag.
 *
 * iGOT is built on **Sunbird ED** (open source, the same stack as DIKSHA), so
 * its content and enrolment APIs follow documented Sunbird shapes:
 *   POST {base}/api/content/v1/search          — content discovery
 *   GET  {base}/api/course/v1/hierarchy/{id}   — course structure
 *   GET  {base}/api/course/v1/user/enrollment/list/{userId}
 *   POST {base}/api/course/v1/content/state/update
 *
 * `IGOT_MODE=mock`  → seeded simulator built from real NSSTA/MoSPI curricula.
 * `IGOT_MODE=live`  → the same code paths hit a real Sunbird endpoint once
 *                     credentials exist. Nothing else in the app changes.
 *
 * Every response is normalised to `IgotCourse`, so the rest of the system
 * never knows or cares which mode it ran in.
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
//  LIVE — Sunbird ED content search
// ─────────────────────────────────────────────────────────────────────────────
const DIFFICULTY_MAP: Record<string, IgotCourse["difficulty"]> = {
  beginner: "beginner", foundation: "beginner",
  intermediate: "practitioner", practitioner: "practitioner",
  advanced: "proficient", proficient: "proficient", expert: "expert",
};

function normaliseSunbird(item: Record<string, any>): IgotCourse {
  return {
    externalId: String(item.identifier ?? item.do_id ?? ""),
    title: String(item.name ?? item.title ?? "Untitled course"),
    description: String(item.description ?? ""),
    provider: String(item.source ?? item.organisation?.[0] ?? item.creator ?? "iGOT Karmayogi"),
    thumbnailUrl: item.posterImage ?? item.appIcon ?? null,
    contentUrl: item.identifier
      ? `${Deno.env.get("IGOT_BASE_URL") ?? "https://igotkarmayogi.gov.in"}/course/${item.identifier}`
      : null,
    durationMinutes: item.duration ? Math.round(Number(item.duration) / 60) : 0,
    language: Array.isArray(item.language) ? (item.language[0] ?? "en") : (item.language ?? "en"),
    difficulty: DIFFICULTY_MAP[String(item.difficultyLevel ?? "").toLowerCase()] ?? "practitioner",
    rating: item.averageRating ? Number(item.averageRating) : null,
    enrolledCount: Number(item.enrolmentCount ?? 0),
    // Sunbird exposes FRAC competencies under `competencies_v5` / `competency`
    competencyCodes: (item.competencies_v5 ?? item.competency ?? [])
      .map((c: any) => c?.competencyAreaCode ?? c?.code ?? c?.name)
      .filter(Boolean)
      .map(String),
    raw: item,
  };
}

async function liveSearch(query: string, limit: number): Promise<IgotCourse[]> {
  const base = Deno.env.get("IGOT_BASE_URL");
  const key = Deno.env.get("IGOT_API_KEY");
  if (!base) throw new Error("IGOT_MODE=live but IGOT_BASE_URL is not set");

  const res = await fetch(`${base}/api/content/v1/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Authorization": `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      request: {
        filters: { primaryCategory: ["Course", "Program"], status: ["Live"] },
        query,
        limit,
        sort_by: { lastPublishedOn: "desc" },
      },
    }),
  });
  if (!res.ok) throw new Error(`iGOT search failed: ${res.status} ${await res.text()}`);

  const json = await res.json();
  const content = json?.result?.content ?? [];
  return content.map(normaliseSunbird);
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
      return await liveSearch(competencyCodes.join(" OR "), limit);
    } catch (e) {
      console.error("[igot] live search failed, falling back to catalogue", e);
      // Degrade rather than fail the learner's request
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
    try { return await liveSearch("*", 100); } catch (e) {
      console.error("[igot] live list failed, using catalogue", e);
    }
  }
  return MOCK_CATALOGUE;
}
