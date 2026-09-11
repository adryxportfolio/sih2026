/**
 * Demo dataset.
 *
 * Two jobs:
 *  1. Lets the UI run before the Supabase schema is applied.
 *  2. Is the offline safety net for the SIH demo itself. Venue wifi fails,
 *     and a judging slot is a bad time to find out. Demo mode renders the
 *     complete journey with zero network calls.
 *
 * Content is real MoSPI/NSSTA subject matter, not lorem ipsum — the numbers
 * below are what a mid-career Junior Statistical Officer's profile plausibly
 * looks like.
 */

export const DEMO_USER = {
  id: "demo-user-0000-0000-000000000001",
  full_name: "Ananya Deshmukh",
  email: "demo@samiksha.gov.in",
  designation: "Junior Statistical Officer",
  organization: "Directorate of Economics and Statistics, Maharashtra",
  job_role_code: "JSO",
  job_role_name: "Junior Statistical Officer",
  grade_level: "Group B",
  years_of_service: 4,
  daily_goal_minutes: 25,
  desired_retention: 0.9,
  xp: 4820,
  streak_current: 12,
  streak_longest: 21,
  preferred_language: "en",
};

export interface DemoCompetency {
  code: string; name: string; comp_type: "behavioural" | "functional" | "domain";
  category: string; short: string;
  current: number; required: number; confidence: number;
  is_critical: boolean; evidence: number;
  rationale?: string;
}

export const DEMO_COMPETENCIES: DemoCompetency[] = [
  { code: "FUN-SAMP-01", name: "Sampling Design and Estimation", comp_type: "functional",
    category: "Statistical Methods", short: "Sampling",
    current: 1.2, required: 2, confidence: 0.78, is_critical: true, evidence: 18,
    rationale: "You answer definitional questions on stratification correctly, but items requiring you to compute design weights for a two-stage sample are going wrong consistently. The concept is there; the mechanics are not yet automatic." },
  { code: "FUN-COLL-01", name: "Data Collection and Field Operations", comp_type: "functional",
    category: "Operations", short: "Field Ops",
    current: 2.9, required: 3, confidence: 0.85, is_critical: true, evidence: 24 },
  { code: "FUN-CLEAN-01", name: "Data Cleaning, Editing and Imputation", comp_type: "functional",
    category: "Data Processing", short: "Cleaning",
    current: 1.6, required: 2, confidence: 0.71, is_critical: true, evidence: 14,
    rationale: "Edit-rule design is solid. Imputation is the gap — you selected mean imputation for a skewed income variable, which biases the variance downward." },
  { code: "FUN-TOOL-01", name: "Statistical Computing", comp_type: "functional",
    category: "Digital Skills", short: "Compute",
    current: 0.8, required: 1, confidence: 0.55, is_critical: false, evidence: 8 },
  { code: "FUN-META-01", name: "Metadata and Standards (NMDS 2.0)", comp_type: "functional",
    category: "Data Governance", short: "Metadata",
    current: 0.4, required: 1, confidence: 0.31, is_critical: false, evidence: 4,
    rationale: "Only four items answered here, so this reads as unmeasured rather than weak. Worth a short diagnostic before we prescribe any training." },
  { code: "FUN-CONF-01", name: "Confidentiality and Disclosure Control", comp_type: "functional",
    category: "Data Governance", short: "Disclose",
    current: 2.1, required: 2, confidence: 0.82, is_critical: true, evidence: 20 },
  { code: "DOM-NSS-01", name: "NSS Survey Methodology", comp_type: "domain",
    category: "Survey Systems", short: "NSS",
    current: 1.9, required: 2, confidence: 0.74, is_critical: false, evidence: 16 },
  { code: "BEH-INT-01", name: "Integrity and Statistical Ethics", comp_type: "behavioural",
    category: "Ethos", short: "Ethics",
    current: 3.1, required: 2, confidence: 0.88, is_critical: true, evidence: 22 },
  { code: "BEH-COM-01", name: "Communication", comp_type: "behavioural",
    category: "Personal Effectiveness", short: "Comms",
    current: 2.4, required: 2, confidence: 0.79, is_critical: false, evidence: 19 },
  { code: "BEH-RES-01", name: "Result Orientation", comp_type: "behavioural",
    category: "Personal Effectiveness", short: "Results",
    current: 2.6, required: 2, confidence: 0.68, is_critical: false, evidence: 12 },
];

export const DEMO_DIAGNOSIS = {
  overall_summary:
    "You are performing at or above your role's requirement on seven of ten mapped competencies, and your ethics and field-operations scores are genuinely strong — above what a Junior Statistical Officer post demands. The picture is not one of broad weakness; it is two specific technical gaps and one blind spot.\n\nSampling design is the gap that matters most. You handle the vocabulary confidently, which can mask the issue, but weight computation for multi-stage designs is going wrong often enough that it would affect published estimates. Imputation is the second. Metadata looks low, but with only four assessed items that is a measurement gap rather than a skill gap — we should test it before prescribing anything.",
  strengths: [
    { competency_code: "BEH-INT-01",
      note: "Consistently correct on confidentiality obligations and on scenarios involving pressure to alter a release. This is the competency that protects the institution, and you are above the bar for your grade." },
    { competency_code: "FUN-COLL-01",
      note: "Near-proficient in field operations with strong evidence behind it — 24 assessed items. Your non-response handling answers were notably good." },
  ],
  priority_gaps: [
    { competency_code: "FUN-SAMP-01",
      rationale: "18 assessed items show a clear split: conceptual questions on stratification are answered correctly, while every item requiring computation of design weights for a two-stage sample was missed. You know what stratification is for; you cannot yet operationalise it.",
      impact_on_role: "Incorrect design weights produce biased state-level estimates that pass every plausibility check and are caught only at national aggregation, if at all. This is the single highest-consequence gap in your profile.",
      suggested_first_step: "Work through the two-stage weight computation for a single NSS district sub-sample by hand, then verify it against the published multiplier." },
    { competency_code: "FUN-CLEAN-01",
      rationale: "Edit-rule design is solid, but imputation choices are not. You selected mean imputation for a right-skewed income variable — a choice that preserves the mean while shrinking the variance.",
      impact_on_role: "Understated variance means published confidence intervals are too narrow, which overstates the precision of the estimate to anyone using it for policy.",
      suggested_first_step: "Compare mean, hot-deck and regression imputation on one skewed variable and observe what each does to the variance." },
    { competency_code: "FUN-META-01",
      rationale: "Only four items assessed, with 31% measurement confidence. This is not evidence of weakness — it is an absence of evidence.",
      impact_on_role: "Unknown. Undocumented metadata breaks comparability across rounds, but we cannot yet say whether that risk applies to you.",
      suggested_first_step: "Take the 10-question NMDS 2.0 diagnostic so this stops being a blind spot." },
  ],
  recommended_focus_weeks: 6,
};

export const DEMO_PATH = {
  id: "demo-path-01",
  title: "Closing the Sampling and Imputation Gap",
  summary: "A six-week plan targeting design weights, imputation strategy and one unmeasured competency, sequenced for retention rather than coverage.",
  rationale:
    "Sampling comes first because it carries the highest consequence and everything downstream depends on it. Note that it appears three times across the six weeks rather than once — spacing the same material across sessions produces substantially better long-term retention than completing it in one block, even though a single block feels more efficient.\n\nEvery input step is followed by a retrieval step. Watching a lecture on imputation feels like learning; being asked to reconstruct it from memory afterwards is what actually consolidates it. Weeks 4 and 5 deliberately interleave sampling with imputation instead of finishing one before starting the other — that feels harder and transfers better.",
  estimated_minutes: 750,
  progress_pct: 34,
  items: [
    { id: "pi-1", kind: "quiz", title: "NMDS 2.0 Diagnostic", description: "10 questions to turn your metadata blind spot into a measurement.",
      why_this: "We shouldn't prescribe training for a competency we haven't measured. This takes eight minutes and removes the guesswork.",
      competency_code: "FUN-META-01", estimated_minutes: 10, status: "completed" },
    { id: "pi-2", kind: "course", title: "Foundations of Sampling Theory for Official Statistics",
      description: "NSSTA · 8 hours · Practitioner level",
      why_this: "Your highest-consequence gap. Starts from stratification, which you already hold, and builds to the weight computation you're missing.",
      competency_code: "FUN-SAMP-01", estimated_minutes: 120, status: "completed", provider: "NSSTA" },
    { id: "pi-3", kind: "flashcard_deck", title: "Design Weights — Active Recall",
      description: "18 cards on weight computation and variance estimation.",
      why_this: "Retrieval practice on the exact mechanics you're getting wrong. Scheduled to resurface across the remaining five weeks, not crammed today.",
      competency_code: "FUN-SAMP-01", estimated_minutes: 15, status: "in_progress" },
    { id: "pi-4", kind: "video", title: "Two-Stage Sampling Weights, Worked Example",
      description: "AI-vetted tutorial · 14 min",
      why_this: "A worked numerical example, because your gap is procedural rather than conceptual.",
      competency_code: "FUN-SAMP-01", estimated_minutes: 14, status: "pending" },
    { id: "pi-5", kind: "course", title: "Data Cleaning, Editing and Imputation",
      description: "NSSTA · 6 hours · Practitioner level",
      why_this: "Second priority gap. Placed after a sampling block so the two interleave rather than stack.",
      competency_code: "FUN-CLEAN-01", estimated_minutes: 120, status: "pending", provider: "NSSTA" },
    { id: "pi-6", kind: "practice", title: "Imputation Under Skew — Applied Exercise",
      description: "Compare three imputation methods on one skewed variable.",
      why_this: "Directly targets the mean-imputation error. You'll see the variance shrink yourself rather than be told it does.",
      competency_code: "FUN-CLEAN-01", estimated_minutes: 30, status: "pending" },
    { id: "pi-7", kind: "quiz", title: "Mixed Retrieval — Sampling and Imputation",
      description: "Interleaved questions across both competencies.",
      why_this: "Mixing the two is harder than practising them separately, and that difficulty is exactly what makes the knowledge transfer to real work.",
      competency_code: "FUN-SAMP-01", estimated_minutes: 20, status: "pending" },
    { id: "pi-8", kind: "reflection", title: "Apply It to Your Own Survey",
      description: "Write how you'd re-check weights on a survey you actually worked on.",
      why_this: "Consolidation. Connecting new technique to a concrete case you remember is what moves it from course knowledge to working knowledge.",
      competency_code: "FUN-SAMP-01", estimated_minutes: 25, status: "pending" },
  ],
};

export interface DemoQuestion {
  id: string;
  stem: string;
  kind: string;
  options: { id: string; text: string }[];
  correct_option_ids: string[];
  explanation: string;
  bloom: string;
  difficulty: number;
  competency_code: string;
  source_quote: string;
  distractor_rationales: Record<string, string>;
}

export const DEMO_QUIZ: {
  id: string; title: string; description: string;
  question_count: number; questions: DemoQuestion[];
} = {
  id: "demo-quiz-01",
  title: "Sampling Design & Estimation — Practice",
  description: "Generated from your uploaded NSS methodology handbook.",
  question_count: 5,
  questions: [
    {
      id: "q1",
      stem: "A two-stage sample selects 40 villages from a district with probability proportional to population, then 8 households by SRS within each selected village. What is the design weight for a sampled household?",
      kind: "mcq_single",
      options: [
        { id: "a", text: "The inverse of the village selection probability only" },
        { id: "b", text: "The product of the inverses of both stage-one and stage-two selection probabilities" },
        { id: "c", text: "The total district population divided by 320" },
        { id: "d", text: "The inverse of the within-village selection probability only" },
      ],
      correct_option_ids: ["b"],
      explanation:
        "In multi-stage sampling the overall selection probability is the product of the stage probabilities, so the design weight is the product of their inverses: w = 1/(P_village × P_household|village). Using only one stage discards the other stage's unequal selection and biases the estimate.",
      bloom: "apply",
      difficulty: 2.6,
      competency_code: "FUN-SAMP-01",
      source_quote: "The overall probability of selection in a multi-stage design is the product of the probabilities at each stage, and the design weight is its reciprocal.",
      distractor_rationales: {
        a: "Treats the design as single-stage cluster sampling, ignoring that households were also sub-sampled.",
        c: "Confuses a raw expansion factor with a design weight; PPS selection means villages did not have equal probability.",
        d: "Ignores the PPS village stage entirely — the most common error when only the final stage feels like 'the sampling'.",
      },
    },
    {
      id: "q2",
      stem: "Why does stratification typically reduce the variance of an estimator compared with simple random sampling of the same total size?",
      kind: "mcq_single",
      options: [
        { id: "a", text: "It increases the total sample size" },
        { id: "b", text: "It removes between-stratum variation from the sampling error" },
        { id: "c", text: "It guarantees every unit has an equal selection probability" },
        { id: "d", text: "It eliminates non-sampling error from the survey" },
      ],
      correct_option_ids: ["b"],
      explanation:
        "Stratified sampling fixes the allocation across strata, so variation between strata no longer contributes to sampling error — only within-stratum variance remains. The more homogeneous the strata internally, the larger the gain.",
      bloom: "understand",
      difficulty: 1.8,
      competency_code: "FUN-SAMP-01",
      source_quote: "Under stratified sampling the between-stratum component is eliminated from the sampling variance, leaving only the within-stratum contribution.",
      distractor_rationales: {
        a: "Stratification reallocates a fixed sample; it does not add units.",
        c: "That describes equal-probability designs; stratification often deliberately uses unequal probabilities.",
        d: "Non-sampling error comes from measurement and non-response and is untouched by the sample design.",
      },
    },
    {
      id: "q3",
      stem: "An analyst imputes missing values in a right-skewed household income variable using the sample mean. What is the principal consequence for published estimates?",
      kind: "mcq_single",
      options: [
        { id: "a", text: "The estimated mean is heavily biased upward" },
        { id: "b", text: "The estimated variance is understated, so confidence intervals are too narrow" },
        { id: "c", text: "The estimates are unaffected provided under 10% of values are missing" },
        { id: "d", text: "The median becomes undefined" },
      ],
      correct_option_ids: ["b"],
      explanation:
        "Mean imputation inserts values with zero deviation from the mean, shrinking the variance. The point estimate of the mean survives roughly intact, but the precision is overstated — published confidence intervals become narrower than the data justifies.",
      bloom: "analyze",
      difficulty: 3.0,
      competency_code: "FUN-CLEAN-01",
      source_quote: "Mean imputation preserves the sample mean but systematically reduces the estimated variance, since imputed records contribute no dispersion.",
      distractor_rationales: {
        a: "The mean is largely preserved — that is precisely why this error survives review.",
        c: "Even modest missingness distorts variance; there is no safe threshold that makes this valid.",
        d: "The median remains well defined, though it shifts.",
      },
    },
    {
      id: "q4",
      stem: "Under the Statistical Quality Assurance Framework (SQAF), which dimension does a delayed statistical release primarily compromise?",
      kind: "mcq_single",
      options: [
        { id: "a", text: "Accuracy and reliability" },
        { id: "b", text: "Timeliness and punctuality" },
        { id: "c", text: "Coherence and comparability" },
        { id: "d", text: "Accessibility and clarity" },
      ],
      correct_option_ids: ["b"],
      explanation:
        "SQAF treats timeliness (the lag between reference period and release) and punctuality (adherence to the announced calendar) as a distinct quality dimension. A late release can be perfectly accurate and still fail on quality.",
      bloom: "remember",
      difficulty: 1.2,
      competency_code: "FUN-QUAL-01",
      source_quote: "Timeliness and punctuality constitute a distinct quality dimension under SQAF, assessed independently of accuracy.",
      distractor_rationales: {
        a: "Accuracy concerns closeness to the true value, which delay does not change.",
        c: "Coherence concerns consistency across sources and over time.",
        d: "Accessibility concerns how easily users can find and use the release once published.",
      },
    },
    {
      id: "q5",
      stem: "A district-level table would reveal that a single establishment accounts for over 90% of reported output in one cell. Which disclosure control response is appropriate?",
      kind: "mcq_single",
      options: [
        { id: "a", text: "Publish it — establishment data is not personal data" },
        { id: "b", text: "Suppress the cell and apply secondary suppression to prevent recovery by subtraction" },
        { id: "c", text: "Round the value to the nearest lakh and publish" },
        { id: "d", text: "Publish with a footnote naming the dominant establishment" },
      ],
      correct_option_ids: ["b"],
      explanation:
        "This is a dominance disclosure: the cell effectively discloses one respondent's confidential return. Primary suppression alone is insufficient, because the value can be recovered by subtracting published cells from a published total — hence secondary suppression.",
      bloom: "evaluate",
      difficulty: 3.4,
      competency_code: "FUN-CONF-01",
      source_quote: "Where a single respondent dominates a cell, primary suppression must be accompanied by secondary suppression to prevent residual disclosure through differencing.",
      distractor_rationales: {
        a: "Confidentiality obligations under the Collection of Statistics Act cover establishment returns.",
        c: "Rounding does not defeat dominance disclosure; the value remains effectively attributable.",
        d: "Naming the respondent is a direct breach of statutory confidentiality.",
      },
    },
  ],
};

export const DEMO_CARDS = [
  { id: "c1", front: "Why does a two-stage design need weights from BOTH stages rather than just the final stage?",
    back: "Because the overall selection probability is the product of the stage probabilities — omitting either stage leaves unequal selection uncorrected and biases the estimate.",
    elaboration: "This is the error that most often survives review: the final stage feels like 'the sampling', so the PPS first stage gets forgotten. The bias it creates is invisible in plausibility checks.",
    competency_code: "FUN-SAMP-01", bloom: "understand", state: "review", due: -1, stability: 4.2, difficulty: 6.1, reps: 3, lapses: 1 },
  { id: "c2", front: "What happens to the estimated VARIANCE when you mean-impute a skewed variable?",
    back: "It shrinks — imputed records contribute zero deviation, so confidence intervals become narrower than the data supports.",
    elaboration: "The mean survives, which is exactly why this passes review. Precision is overstated, not the level.",
    competency_code: "FUN-CLEAN-01", bloom: "analyze", state: "learning", due: 0, stability: 1.1, difficulty: 7.4, reps: 1, lapses: 0 },
  { id: "c3", front: "Under SQAF, can a release be fully accurate and still fail on quality?",
    back: "Yes. Timeliness and punctuality are a separate quality dimension — a late release fails on quality regardless of accuracy.",
    elaboration: "SQAF deliberately separates these so accuracy cannot be used to excuse chronic delay.",
    competency_code: "FUN-QUAL-01", bloom: "understand", state: "review", due: 2, stability: 12.8, difficulty: 4.2, reps: 5, lapses: 0 },
  { id: "c4", front: "When one establishment dominates a table cell, why is primary suppression alone insufficient?",
    back: "The suppressed value can be recovered by subtracting the other published cells from the published total — so secondary suppression is required.",
    elaboration: "Disclosure control has to reason about what the published set implies, not just what each cell states.",
    competency_code: "FUN-CONF-01", bloom: "evaluate", state: "new", due: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
  { id: "c5", front: "Stratification reduces variance by removing which component?",
    back: "The between-stratum component. Only within-stratum variance remains, so more internally homogeneous strata give bigger gains.",
    elaboration: "This is why you stratify on something correlated with the outcome — homogeneity inside strata is where the benefit comes from.",
    competency_code: "FUN-SAMP-01", bloom: "understand", state: "review", due: 0, stability: 6.5, difficulty: 5.0, reps: 4, lapses: 0 },
];

export const DEMO_VIDEOS = [
  { id: "v1", youtube_id: "yGGV0-PxWpw", title: "Stratified Sampling — Clearly Explained with Worked Example",
    channel_title: "Statistics Learning Centre", duration_seconds: 842, view_count: 412000,
    quality_score: 0.91, quality_rationale: "Derives the variance reduction rather than asserting it, and works a full numerical example at a level appropriate for practising statisticians.",
    competency_code: "FUN-SAMP-01" },
  { id: "v2", youtube_id: "Zrz_bX2s_zY", title: "Multi-Stage Sampling and Design Weights",
    channel_title: "Survey Methods", duration_seconds: 1103, view_count: 88000,
    quality_score: 0.87, quality_rationale: "Directly targets the two-stage weight computation, which is the exact procedural gap in this profile.",
    competency_code: "FUN-SAMP-01" },
  { id: "v3", youtube_id: "oCkmGUlKtRk", title: "Handling Missing Data: Imputation Methods Compared",
    channel_title: "Quantitative Methods", duration_seconds: 967, view_count: 156000,
    quality_score: 0.84, quality_rationale: "Shows the variance consequence of mean imputation empirically instead of only warning about it.",
    competency_code: "FUN-CLEAN-01" },
];

/** Last 12 weeks of study minutes, shaped like a real habit — with gaps. */
export function demoHeatmap(): Record<string, number> {
  const out: Record<string, number> = {};
  const today = new Date();
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    // Deterministic pseudo-random so the demo looks identical every run
    const seed = (i * 9301 + 49297) % 233280;
    const rnd = seed / 233280;
    let minutes = 0;
    if (i < 12) minutes = 22 + Math.floor(rnd * 28);            // current streak
    else if (dow === 0) minutes = rnd > 0.7 ? 15 : 0;            // quiet Sundays
    else if (rnd > 0.28) minutes = 12 + Math.floor(rnd * 35);
    out[key] = minutes;
  }
  return out;
}

/**
 * Recurring misconceptions — the same false belief demonstrated more than once.
 * Derived from WHICH distractor was chosen, not from the score.
 */
export const DEMO_MISCONCEPTIONS = [
  {
    competency_code: "FUN-SAMP-01",
    competency_name: "Sampling Design and Estimation",
    misconception: "Ignores the PPS village stage entirely — treats the final sampling stage as if it were the whole design.",
    occurrences: 4,
    last_seen: "2 days ago",
  },
  {
    competency_code: "FUN-CLEAN-01",
    competency_name: "Data Cleaning, Editing and Imputation",
    misconception: "Believes preserving the mean means the imputation was harmless — does not consider what happens to the variance.",
    occurrences: 3,
    last_seen: "4 days ago",
  },
  {
    competency_code: "FUN-SAMP-01",
    competency_name: "Sampling Design and Estimation",
    misconception: "Confuses a raw expansion factor with a design weight under unequal selection probability.",
    occurrences: 2,
    last_seen: "1 week ago",
  },
];

/** Prerequisite-aware learnable frontier. */
export const DEMO_ZPD = [
  { code: "FUN-SAMP-01", name: "Sampling Design and Estimation", readiness: 1.0, blocked_by: [] as string[] },
  { code: "FUN-CLEAN-01", name: "Data Cleaning, Editing and Imputation", readiness: 1.0, blocked_by: [] as string[] },
  { code: "FUN-META-01", name: "Metadata and Standards (NMDS 2.0)", readiness: 1.0, blocked_by: [] as string[] },
  { code: "FUN-ANAL-01", name: "Statistical Analysis and Inference", readiness: 0.38,
    blocked_by: ["Sampling Design and Estimation"] },
  { code: "FUN-QUAL-01", name: "Statistical Quality Assurance (SQAF)", readiness: 0.43,
    blocked_by: ["Data Cleaning, Editing and Imputation"] },
];

export const DEMO_ACCURACY_TREND = [0.52, 0.58, 0.55, 0.63, 0.67, 0.64, 0.72, 0.75, 0.71, 0.78, 0.81, 0.84];
