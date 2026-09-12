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
  code: string; name: string;
  comp_type: "behavioural" | "functional" | "domain" | "technical" | "digital_governance";
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

  // ── TECHNICAL — the family the Ministry is most worried about ──────────
  { code: "TEC-PY-01", name: "Python for Data Analysis", comp_type: "technical",
    category: "Programming", short: "Python",
    current: 0.6, required: 1, confidence: 0.44, is_critical: false, evidence: 7,
    rationale: "You can read a script but not write one unaided. Given how much of your imputation and tabulation work is still manual, this is the competency with the largest time payoff." },
  { code: "TEC-SQL-01", name: "SQL and Database Querying", comp_type: "technical",
    category: "Data Engineering", short: "SQL",
    current: 1.1, required: 2, confidence: 0.62, is_critical: true, evidence: 11,
    rationale: "Simple SELECT and WHERE are solid. Joins across more than two tables and NULL handling in aggregates are consistently wrong — which is where real extraction work lives." },
  { code: "TEC-GIS-01", name: "Geospatial Analysis (GIS)", comp_type: "technical",
    category: "Spatial Methods", short: "GIS",
    current: 0.3, required: 1, confidence: 0.22, is_critical: false, evidence: 3,
    rationale: "Barely assessed. Before prescribing a 40-hour GIS programme we should spend ten minutes measuring whether you need it." },
  { code: "TEC-VIZ-01", name: "Dashboards and BI", comp_type: "technical",
    category: "Dissemination Tech", short: "Dashb.",
    current: 1.4, required: 1, confidence: 0.58, is_critical: false, evidence: 9 },

  // ── DIGITAL GOVERNANCE ─────────────────────────────────────────────────
  { code: "DIG-PRIV-01", name: "Data Privacy and the DPDP Act", comp_type: "digital_governance",
    category: "Law & Compliance", short: "Privacy",
    current: 1.3, required: 2, confidence: 0.66, is_critical: true, evidence: 13,
    rationale: "You know respondent data is protected, but purpose limitation and data minimisation questions are going wrong. With the DPDP Act now in force this is a compliance exposure, not just a knowledge gap." },
  { code: "DIG-CYBER-01", name: "Cybersecurity Awareness", comp_type: "digital_governance",
    category: "Security", short: "Cyber",
    current: 2.2, required: 2, confidence: 0.77, is_critical: true, evidence: 17 },
  { code: "DIG-ESIGN-01", name: "Digital Signatures and e-Office", comp_type: "digital_governance",
    category: "Digital Workflow", short: "e-Sign",
    current: 1.8, required: 1, confidence: 0.71, is_critical: false, evidence: 10 },
];

export const DEMO_DIAGNOSIS = {
  overall_summary:
    "Your statistical craft is strong. Ethics, field operations and disclosure control all sit at or above what a Junior Statistical Officer post requires, and that is the half of the job most people find hardest to build.\n\nThe gap is not statistical — it is tooling and compliance. You are at 0.6/4 on Python and 1.1/4 on SQL, which means extraction and cleaning work that should take an afternoon is taking you days, and you are dependent on someone else for every non-trivial data pull. Alongside that, DPDP Act questions are going wrong often enough to be a compliance exposure now that the Act is in force.\n\nSampling remains the highest-consequence statistical gap: you handle the vocabulary confidently, which masks that multi-stage weight computation is going wrong. GIS looks low but has only three assessed items — that is a measurement gap, not a skill gap, and should be tested before anything is prescribed.",
  strengths: [
    { competency_code: "BEH-INT-01",
      note: "Consistently correct on confidentiality obligations and on scenarios involving pressure to alter a release. This is the competency that protects the institution, and you are above the bar for your grade." },
    { competency_code: "FUN-COLL-01",
      note: "Near-proficient in field operations with strong evidence behind it — 24 assessed items. Your non-response handling answers were notably good." },
  ],
  priority_gaps: [
    { competency_code: "TEC-SQL-01",
      rationale: "11 assessed items. Single-table queries are reliable; every item requiring a three-table join or correct NULL handling in an aggregate was missed. That is precisely the boundary between querying a table and actually extracting data.",
      impact_on_role: "You remain dependent on a colleague for any non-trivial data pull, which adds days to every turnaround and puts a single point of failure between your Directorate and its own data.",
      suggested_first_step: "Write one three-table join against a PLFS extract and verify the row count against a known published total." },
    { competency_code: "DIG-PRIV-01",
      rationale: "13 items assessed, with purpose limitation and data minimisation consistently wrong. You correctly identify that respondent data is protected, but not what that obligates you to do differently in a survey design.",
      impact_on_role: "The DPDP Act is in force. Collecting fields you cannot justify, or retaining them past their purpose, is a statutory exposure for the Directorate — not merely bad practice.",
      suggested_first_step: "Take one schedule you already use and mark every field you could not defend under purpose limitation." },
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
  { id: "v1", youtube_id: "aXg5RsY_Vpo", title: "Stratified Random Sampling — Clearly Explained",
    channel_title: "Asad International Academy", duration_seconds: 363, view_count: 412000,
    quality_score: 0.91, quality_rationale: "Derives the variance reduction rather than asserting it, and works a full numerical example at a level appropriate for practising statisticians.",
    competency_code: "FUN-SAMP-01" },
  { id: "v2", youtube_id: "XvsUA5X_qvo", title: "Multi-Stage Sampling Design — Definition & Steps",
    channel_title: "Research Methods Class", duration_seconds: 1103, view_count: 88000,
    quality_score: 0.87, quality_rationale: "Directly targets the two-stage weight computation, which is the exact procedural gap in this profile.",
    competency_code: "FUN-SAMP-01" },
  { id: "v3", youtube_id: "fYhr8eF1ubo", title: "Imputation Methods for Missing Data",
    channel_title: "Sundog Education", duration_seconds: 967, view_count: 156000,
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


// ═══════════════════════════════════════════════════════════════════════════
//  ADMINISTRATOR / NODAL OFFICER VIEW
//  Aggregate workforce intelligence. No individual officer is identifiable
//  here — the underlying view groups before it returns, by construction.
// ═══════════════════════════════════════════════════════════════════════════

export const DEMO_ORG_SUMMARY = {
  organisation: "Directorate of Economics & Statistics, Maharashtra",
  total_officials: 4821,
  assessed: 3946,
  avg_competency: 0.67,
  avg_competency_delta: 0.04,      // vs last quarter
  critical_gaps_open: 7,
  training_hours_completed: 18420,
  completion_rate: 0.63,
};

/** Workforce-wide competency gaps, worst first. */
export const DEMO_ORG_GAPS = [
  { code: "TEC-PY-01",    name: "Python for Data Analysis",        family: "technical",          avg: 0.28, required: 0.60, officials_below: 3120, trend: +0.06 },
  { code: "TEC-GIS-01",   name: "Geospatial Analysis (GIS)",       family: "technical",          avg: 0.31, required: 0.50, officials_below: 2890, trend: +0.02 },
  { code: "DIG-PRIV-01",  name: "Data Privacy & DPDP Act",         family: "digital_governance", avg: 0.34, required: 0.75, officials_below: 3402, trend: +0.11 },
  { code: "TEC-ML-01",    name: "Machine Learning",                family: "technical",          avg: 0.38, required: 0.50, officials_below: 2410, trend: +0.09 },
  { code: "TEC-SQL-01",   name: "SQL & Database Querying",         family: "technical",          avg: 0.44, required: 0.70, officials_below: 2650, trend: +0.05 },
  { code: "DIG-CYBER-01", name: "Cybersecurity Awareness",         family: "digital_governance", avg: 0.52, required: 0.70, officials_below: 1980, trend: +0.14 },
  { code: "FUN-QUAL-01",  name: "Statistical Quality (SQAF)",      family: "functional",         avg: 0.58, required: 0.75, officials_below: 1640, trend: +0.03 },
  { code: "FUN-SAMP-01",  name: "Sampling Design & Estimation",    family: "functional",         avg: 0.71, required: 0.80, officials_below: 980,  trend: +0.01 },
  { code: "BEH-COM-01",   name: "Communication",                   family: "behavioural",        avg: 0.74, required: 0.70, officials_below: 420,  trend: +0.02 },
];

/** Competency health by family — where the workforce stands overall. */
export const DEMO_FAMILY_HEALTH = [
  { family: "Statistical",        key: "functional",         avg: 0.78, officials: 4821 },
  { family: "Domain",             key: "domain",             avg: 0.72, officials: 4821 },
  { family: "Behavioural",        key: "behavioural",        avg: 0.76, officials: 4821 },
  { family: "Technical",          key: "technical",          avg: 0.41, officials: 4821 },
  { family: "Digital Governance", key: "digital_governance", avg: 0.46, officials: 4821 },
];

/** Which training the gap analysis implies the Directorate should commission. */
export const DEMO_TRAINING_DEMAND = [
  { programme: "Python for Statistical Analysis",   provider: "NSSTA (TPAC)", officials_needing: 3120, priority: "critical" },
  { programme: "DPDP Act Compliance for Statistics",provider: "MoSPI",        officials_needing: 3402, priority: "critical" },
  { programme: "GIS for Statistical Applications",  provider: "NSSTA (TPAC)", officials_needing: 2890, priority: "high" },
  { programme: "SQL for Data Management",           provider: "iGOT",         officials_needing: 2650, priority: "high" },
  { programme: "ML in Official Statistics",         provider: "NSSTA (TPAC)", officials_needing: 2410, priority: "medium" },
  { programme: "Cybersecurity Essentials",          provider: "iGOT",         officials_needing: 1980, priority: "medium" },
];

/** Per-office rollup, so a nodal officer can see who needs attention. */
export const DEMO_OFFICE_BREAKDOWN = [
  { office: "Pune Divisional Office",     officials: 842, avg: 0.74, critical: 1, completion: 0.79 },
  { office: "Mumbai HQ",                  officials: 1260, avg: 0.71, critical: 2, completion: 0.71 },
  { office: "Nagpur Divisional Office",   officials: 690, avg: 0.66, critical: 3, completion: 0.58 },
  { office: "Aurangabad Divisional Office",officials: 585, avg: 0.61, critical: 4, completion: 0.49 },
  { office: "Nashik Divisional Office",   officials: 724, avg: 0.63, critical: 3, completion: 0.55 },
  { office: "Field Units (aggregate)",    officials: 720, avg: 0.58, critical: 5, completion: 0.41 },
];

/** 8-quarter workforce competency trend. */
export const DEMO_ORG_TREND = [0.54, 0.56, 0.58, 0.59, 0.62, 0.63, 0.65, 0.67];


// ═══════════════════════════════════════════════════════════════════════════
//  OFFICER ROSTER — shape matches v_admin_officer_overview exactly, so the
//  admin screens are identical in demo and live mode.
// ═══════════════════════════════════════════════════════════════════════════
function mins(n: number) { return new Date(Date.now() - n * 60000).toISOString(); }

export const DEMO_OFFICERS = [
  { user_id: "d1", full_name: "Ananya Deshmukh", email: "ananya.deshmukh@des.mh.gov.in",
    employee_code: "MH-JSO-4471", designation: "Junior Statistical Officer",
    role_code: "JSO", role_name: "Junior Statistical Officer", years_of_service: 4,
    xp: 4820, streak_current: 12, last_login_at: mins(3), is_active: true, onboarded_at: mins(9000),
    presence: "online", last_seen_at: mins(0.5), current_activity: "reviewing",
    current_entity: "Design Weights — Active Recall",
    competencies_mapped: 17, competencies_met: 7, critical_gaps: 4,
    avg_score: 1.82, avg_confidence: 0.63,
    top_gap_name: "Python for Data Analysis", top_gap_code: "TEC-PY-01",
    next_step: "Two-Stage Sampling Weights, Worked Example",
    minutes_last_7d: 214, quizzes_completed: 11, cards_due: 4 },

  { user_id: "d2", full_name: "Rahul Verma", email: "rahul.verma@des.mh.gov.in",
    employee_code: "MH-SSO-2210", designation: "Senior Statistical Officer",
    role_code: "SSO", role_name: "Senior Statistical Officer", years_of_service: 11,
    xp: 9140, streak_current: 27, last_login_at: mins(12), is_active: true, onboarded_at: mins(26000),
    presence: "online", last_seen_at: mins(1), current_activity: "quiz",
    current_entity: "SQL Joins & NULL Semantics",
    competencies_mapped: 19, competencies_met: 13, critical_gaps: 2,
    avg_score: 2.61, avg_confidence: 0.78,
    top_gap_name: "Machine Learning for Official Statistics", top_gap_code: "TEC-ML-01",
    next_step: "ML in Official Statistics (TPAC)",
    minutes_last_7d: 341, quizzes_completed: 24, cards_due: 0 },

  { user_id: "d3", full_name: "Priya Nair", email: "priya.nair@des.mh.gov.in",
    employee_code: "MH-ASD-0912", designation: "Assistant Director (Statistics)",
    role_code: "ASD", role_name: "Assistant Director (Statistics)", years_of_service: 15,
    xp: 12300, streak_current: 5, last_login_at: mins(46), is_active: true, onboarded_at: mins(40000),
    presence: "away", last_seen_at: mins(6), current_activity: "tutor",
    current_entity: "Asking about imputation variance",
    competencies_mapped: 22, competencies_met: 16, critical_gaps: 3,
    avg_score: 2.88, avg_confidence: 0.81,
    top_gap_name: "Data Privacy and the DPDP Act", top_gap_code: "DIG-PRIV-01",
    next_step: "DPDP Act Compliance for Statistical Work",
    minutes_last_7d: 168, quizzes_completed: 31, cards_due: 12 },

  { user_id: "d4", full_name: "Suresh Patil", email: "suresh.patil@des.mh.gov.in",
    employee_code: "MH-FI-8830", designation: "Field Investigator",
    role_code: "FI", role_name: "Field Investigator", years_of_service: 7,
    xp: 1240, streak_current: 0, last_login_at: mins(2880), is_active: true, onboarded_at: mins(12000),
    presence: "offline", last_seen_at: mins(2880), current_activity: null, current_entity: null,
    competencies_mapped: 9, competencies_met: 3, critical_gaps: 4,
    avg_score: 1.14, avg_confidence: 0.38,
    top_gap_name: "Data Privacy and the DPDP Act", top_gap_code: "DIG-PRIV-01",
    next_step: "Cybersecurity Essentials",
    minutes_last_7d: 0, quizzes_completed: 2, cards_due: 31 },

  { user_id: "d5", full_name: "Meera Iyer", email: "meera.iyer@des.mh.gov.in",
    employee_code: "MH-JSO-5514", designation: "Junior Statistical Officer",
    role_code: "JSO", role_name: "Junior Statistical Officer", years_of_service: 2,
    xp: 2960, streak_current: 8, last_login_at: mins(7), is_active: true, onboarded_at: mins(5200),
    presence: "online", last_seen_at: mins(0.2), current_activity: "video",
    current_entity: "Stratified Sampling — Clearly Explained",
    competencies_mapped: 16, competencies_met: 5, critical_gaps: 5,
    avg_score: 1.46, avg_confidence: 0.52,
    top_gap_name: "SQL and Database Querying", top_gap_code: "TEC-SQL-01",
    next_step: "SQL for Data Management in Government",
    minutes_last_7d: 189, quizzes_completed: 7, cards_due: 6 },

  { user_id: "d6", full_name: "Arjun Kulkarni", email: "arjun.kulkarni@des.mh.gov.in",
    employee_code: "MH-DD-0044", designation: "Deputy Director (NSO)",
    role_code: "DD", role_name: "Deputy Director (NSO)", years_of_service: 19,
    xp: 15680, streak_current: 41, last_login_at: mins(95), is_active: true, onboarded_at: mins(52000),
    presence: "away", last_seen_at: mins(8), current_activity: "reading",
    current_entity: "SQAF Guidelines 2024",
    competencies_mapped: 24, competencies_met: 19, critical_gaps: 1,
    avg_score: 3.12, avg_confidence: 0.86,
    top_gap_name: "Big Data Processing", top_gap_code: "TEC-BIGD-01",
    next_step: "Big Data and Administrative Data for Official Statistics",
    minutes_last_7d: 276, quizzes_completed: 44, cards_due: 2 },

  { user_id: "d7", full_name: "Kavita Joshi", email: "kavita.joshi@des.mh.gov.in",
    employee_code: "MH-SSO-3307", designation: "Senior Statistical Officer",
    role_code: "SSO", role_name: "Senior Statistical Officer", years_of_service: 9,
    xp: 6410, streak_current: 3, last_login_at: mins(420), is_active: true, onboarded_at: mins(18000),
    presence: "offline", last_seen_at: mins(420), current_activity: null, current_entity: null,
    competencies_mapped: 19, competencies_met: 10, critical_gaps: 3,
    avg_score: 2.21, avg_confidence: 0.69,
    top_gap_name: "Geospatial Analysis and GIS", top_gap_code: "TEC-GIS-01",
    next_step: "GIS for Statistical Applications (TPAC)",
    minutes_last_7d: 94, quizzes_completed: 18, cards_due: 9 },

  { user_id: "d8", full_name: "Vikram Shinde", email: "vikram.shinde@des.mh.gov.in",
    employee_code: "MH-FI-9102", designation: "Field Investigator",
    role_code: "FI", role_name: "Field Investigator", years_of_service: 3,
    xp: 380, streak_current: 0, last_login_at: mins(11520), is_active: false, onboarded_at: null,
    presence: "offline", last_seen_at: null, current_activity: null, current_entity: null,
    competencies_mapped: 0, competencies_met: 0, critical_gaps: 0,
    avg_score: null, avg_confidence: null,
    top_gap_name: null, top_gap_code: null, next_step: null,
    minutes_last_7d: 0, quizzes_completed: 0, cards_due: 0 },
];

/** Live activity feed for the admin dashboard. */
export const DEMO_ACTIVITY_FEED = [
  { id: 1, who: "Rahul Verma",     what: "answered a question on SQL joins",              detail: "correct · difficulty 2.8", ago: "just now" },
  { id: 2, who: "Meera Iyer",      what: "started watching Stratified Sampling",          detail: "FUN-SAMP-01",              ago: "1m ago" },
  { id: 3, who: "Ananya Deshmukh", what: "reviewed 4 flashcards",                         detail: "3 recalled · 1 lapse",     ago: "2m ago" },
  { id: 4, who: "Priya Nair",      what: "asked the tutor about imputation variance",     detail: "grounded in uploaded PDF", ago: "6m ago" },
  { id: 5, who: "Arjun Kulkarni",  what: "completed SQAF Guidelines 2024",                detail: "32 pages · 14 chunks",     ago: "8m ago" },
  { id: 6, who: "Rahul Verma",     what: "closed a competency gap",                       detail: "FUN-QUAL-01 → proficient", ago: "22m ago" },
  { id: 7, who: "Meera Iyer",      what: "scored 71% on Sampling Design",                 detail: "calibration error 0.19",   ago: "34m ago" },
];


// ═══════════════════════════════════════════════════════════════════════════
//  ADAPTIVE ITEM POOL
//  Spread across the difficulty range so the selector always has something
//  informative to pick, whatever ability the officer turns out to have.
// ═══════════════════════════════════════════════════════════════════════════
export interface AdaptiveDemoItem {
  id: string;
  stem: string;
  options: { id: string; text: string }[];
  correct: string;
  difficulty: number;
  competency_code: string;
  bloom: string;
  explanation: string;
}

export const DEMO_ADAPTIVE_POOL: AdaptiveDemoItem[] = [
  { id: "a1", difficulty: 0.5, competency_code: "FUN-SAMP-01", bloom: "remember",
    stem: "In a simple random sample, every unit in the population has:",
    options: [{id:"a",text:"An equal probability of selection"},{id:"b",text:"A probability proportional to its size"},{id:"c",text:"A probability decided by the enumerator"},{id:"d",text:"Zero probability unless it is in a stratum"}],
    correct: "a",
    explanation: "Equal probability of selection is the defining property of SRS." },

  { id: "a2", difficulty: 0.8, competency_code: "TEC-SQL-01", bloom: "remember",
    stem: "Which SQL clause filters rows BEFORE any aggregation is applied?",
    options: [{id:"a",text:"HAVING"},{id:"b",text:"WHERE"},{id:"c",text:"GROUP BY"},{id:"d",text:"ORDER BY"}],
    correct: "b",
    explanation: "WHERE filters rows before grouping; HAVING filters groups after aggregation." },

  { id: "a3", difficulty: 1.0, competency_code: "DIG-PRIV-01", bloom: "understand",
    stem: "Under the DPDP Act 2023, 'purpose limitation' means personal data may be:",
    options: [{id:"a",text:"Retained indefinitely if it was lawfully collected"},{id:"b",text:"Used only for the purpose it was collected for"},{id:"c",text:"Shared freely between government departments"},{id:"d",text:"Collected without notice for statistical use"}],
    correct: "b",
    explanation: "Purpose limitation restricts use to the stated purpose of collection." },

  { id: "a4", difficulty: 1.2, competency_code: "FUN-CLEAN-01", bloom: "understand",
    stem: "An 'edit rule' in statistical data processing is used to:",
    options: [{id:"a",text:"Impute values that are missing"},{id:"b",text:"Detect records that are internally inconsistent"},{id:"c",text:"Weight records to the population"},{id:"d",text:"Suppress disclosive cells"}],
    correct: "b",
    explanation: "Edit rules detect inconsistency; imputation is the separate step that treats it." },

  { id: "a5", difficulty: 1.5, competency_code: "FUN-SAMP-01", bloom: "understand",
    stem: "Stratification reduces sampling variance primarily by:",
    options: [{id:"a",text:"Increasing the sample size"},{id:"b",text:"Removing between-stratum variation from the sampling error"},{id:"c",text:"Eliminating non-response"},{id:"d",text:"Making selection probabilities equal"}],
    correct: "b",
    explanation: "Fixing the allocation across strata removes the between-stratum component." },

  { id: "a6", difficulty: 1.7, competency_code: "TEC-SQL-01", bloom: "apply",
    stem: "A LEFT JOIN returns no matching row on the right. What do the right-hand columns contain?",
    options: [{id:"a",text:"Zero"},{id:"b",text:"Empty string"},{id:"c",text:"NULL"},{id:"d",text:"The row is dropped entirely"}],
    correct: "c",
    explanation: "Unmatched right-hand columns are NULL — which is why COUNT(col) and COUNT(*) then differ." },

  { id: "a7", difficulty: 1.9, competency_code: "FUN-QUAL-01", bloom: "understand",
    stem: "Under SQAF, a release that is perfectly accurate but two months late fails on:",
    options: [{id:"a",text:"Accuracy and reliability"},{id:"b",text:"Timeliness and punctuality"},{id:"c",text:"Coherence and comparability"},{id:"d",text:"It does not fail — accuracy is what matters"}],
    correct: "b",
    explanation: "SQAF treats timeliness as a distinct quality dimension, assessed independently of accuracy." },

  { id: "a8", difficulty: 2.1, competency_code: "TEC-PY-01", bloom: "apply",
    stem: "In pandas, df.groupby('district')['income'].mean() by default:",
    options: [{id:"a",text:"Includes NaN values as zero"},{id:"b",text:"Excludes NaN values from the mean"},{id:"c",text:"Raises an error if NaN is present"},{id:"d",text:"Returns NaN for any group containing NaN"}],
    correct: "b",
    explanation: "pandas skips NaN by default (skipna=True) — which silently changes the denominator." },

  { id: "a9", difficulty: 2.3, competency_code: "FUN-CLEAN-01", bloom: "analyze",
    stem: "Mean-imputing a right-skewed income variable principally causes:",
    options: [{id:"a",text:"An upward-biased mean"},{id:"b",text:"An understated variance, so intervals are too narrow"},{id:"c",text:"No effect below 10% missingness"},{id:"d",text:"The median to become undefined"}],
    correct: "b",
    explanation: "Imputed records carry no deviation, shrinking variance while the mean survives — which is why this error passes review." },

  { id: "a10", difficulty: 2.5, competency_code: "FUN-SAMP-01", bloom: "apply",
    stem: "A two-stage design selects villages by PPS, then 8 households by SRS within each. The design weight is:",
    options: [{id:"a",text:"The inverse of the village selection probability only"},{id:"b",text:"The product of the inverses of both stage probabilities"},{id:"c",text:"Population divided by total households sampled"},{id:"d",text:"The inverse of the within-village probability only"}],
    correct: "b",
    explanation: "Overall selection probability is the product of the stages, so the weight is the product of their inverses." },

  { id: "a11", difficulty: 2.7, competency_code: "TEC-ML-01", bloom: "evaluate",
    stem: "Why might a high-accuracy black-box classifier be unacceptable for an official release?",
    options: [{id:"a",text:"It is too slow to run"},{id:"b",text:"Its decisions cannot be explained or audited"},{id:"c",text:"Accuracy is not a valid metric"},{id:"d",text:"It cannot handle categorical variables"}],
    correct: "b",
    explanation: "Official statistics must be defensible. A figure you cannot explain is one you cannot publish." },

  { id: "a12", difficulty: 2.9, competency_code: "FUN-CONF-01", bloom: "evaluate",
    stem: "One establishment dominates 90% of a published cell. Primary suppression alone is insufficient because:",
    options: [{id:"a",text:"Establishment data is not confidential"},{id:"b",text:"The value can be recovered by subtracting from published totals"},{id:"c",text:"Rounding already protects it"},{id:"d",text:"Suppression only applies to household data"}],
    correct: "b",
    explanation: "Residual disclosure through differencing is why secondary suppression is required." },

  { id: "a13", difficulty: 3.1, competency_code: "FUN-ANAL-01", bloom: "analyze",
    stem: "Ignoring the complex survey design when computing standard errors typically:",
    options: [{id:"a",text:"Overstates the standard error"},{id:"b",text:"Understates it, because clustering is ignored"},{id:"c",text:"Has no effect if weights are applied"},{id:"d",text:"Only affects the point estimate"}],
    correct: "b",
    explanation: "Clustering induces positive intra-cluster correlation; ignoring it understates variance." },

  { id: "a14", difficulty: 3.3, competency_code: "DOM-NAS-01", bloom: "analyze",
    stem: "In a base-year revision of national accounts, a change in the deflator primarily affects:",
    options: [{id:"a",text:"Nominal GVA only"},{id:"b",text:"Real growth rates across the series"},{id:"c",text:"Employment estimates"},{id:"d",text:"Nothing, if weights are unchanged"}],
    correct: "b",
    explanation: "Deflators convert nominal to real; changing them re-bases the entire real series." },

  { id: "a15", difficulty: 3.6, competency_code: "FUN-SAMP-01", bloom: "create",
    stem: "For a rotational panel where 25% of the sample is replaced each round, variance of the change estimate is reduced because:",
    options: [{id:"a",text:"The sample size is larger"},{id:"b",text:"Overlapping units are positively correlated over time"},{id:"c",text:"Non-response is eliminated"},{id:"d",text:"Weights become equal"}],
    correct: "b",
    explanation: "Positive correlation between overlapping units reduces the variance of a difference." },
];

/**
 * Where the officer is leaning on their agents.
 *
 * This is the competency loop closing: the platform measured a gap, the officer
 * kept handing that exact work to an agent, and the delegation history turns an
 * assessment score into an argument about their week. Ananya is measured
 * unskilled on Python against a post that requires beginner — and has delegated
 * 23 Python jobs this month, which is the part she can feel.
 */
export const DEMO_DEPENDENCY = [
  {
    competency_code: "TEC-PY-01",
    competency_name: "Python for Data Analysis",
    comp_type: "technical",
    agent_name: "Data Analyst",
    delegations_30d: 23,
    seconds_automated: 27600,
    gap_size: 2.0,
    is_critical: true,
    note: "Every dataset you have been given this month went to the agent. The work you get back is correct, but the analysis is not yours yet.",
  },
  {
    competency_code: "FUN-CLEAN-01",
    competency_name: "Data Cleaning, Editing and Imputation",
    comp_type: "functional",
    agent_name: "Data Quality",
    delegations_30d: 14,
    seconds_automated: 12900,
    gap_size: 1.0,
    is_critical: true,
    note: "You catch the missing values once the agent flags them. Reading the pattern yourself is the step still missing.",
  },
  {
    competency_code: "FUN-META-01",
    competency_name: "Metadata and Statistical Standards (NMDS 2.0)",
    comp_type: "functional",
    agent_name: "Report Assistant",
    delegations_30d: 6,
    seconds_automated: 5400,
    gap_size: 1.0,
    is_critical: false,
    note: "Six reports drafted against the template without you editing the metadata block.",
  },
] as const;
