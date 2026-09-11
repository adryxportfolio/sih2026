<div align="center">

# समीक्षा · Samiksha

**AI-enabled capacity building for India's Official Statistical System**

Smart India Hackathon 2026 · Problem Statement **SIH26101**

[![Build APK](https://github.com/adryxportfolio/sih2026/actions/workflows/build-apk.yml/badge.svg)](https://github.com/adryxportfolio/sih2026/actions/workflows/build-apk.yml)
[![Download APK](https://img.shields.io/badge/Download-APK-9333EA?logo=android&logoColor=white)](https://github.com/adryxportfolio/sih2026/releases/latest)

</div>

---

## The problem

> Develop an AI enabled learning platform that identifies competency gaps, recommends
> personalized training through integration with the iGOT Karmayogi ecosystem, and
> capable of generating Quizzes and Multiple choice questions (MCQs) from uploaded
> learning materials to strengthen capacity building in India's Official Statistical System.

The statement bundles **two AI engines** and **two audiences**, and it is easy to
build only half of it.

```
                        SIH26101
                            │
              ┌─────────────┴─────────────┐
              │                           │
     SKILL INTELLIGENCE            ASSESSMENT ENGINE
              │                           │
   profile → prior → diagnostic    upload PDF/PPTX/DOCX/scan
              │                           │
        competency gaps            grounded MCQ generation
              │                           │
     iGOT + NSSTA TPAC             page-cited, misconception-tagged
       recommendation                     │
              │                           │
              └─────────────┬─────────────┘
                            │
                    competency updated
                            │
              ┌─────────────┴─────────────┐
        LEARNER dashboard        ADMINISTRATOR dashboard
```

That loop is closed: assessment changes the competency profile, which changes
the recommendations, which changes what gets learned, which changes the next
assessment.

| Requirement | The shallow build | What Samiksha does |
|---|---|---|
| **Build a competency profile** from designation, role, experience, training | Ask the user and store it | Self-report is the least reliable evidence there is, so it sets a **low-confidence prior**, not an answer. Measured items raise confidence; the UI says so explicitly. |
| **Four competency families** — statistical, technical, digital governance, behavioural | Model "topics" | **39 competencies across all four**, incl. Python, R, SQL, GIS, ML, cloud, big data, DPDP Act, cybersecurity, e-Sign, DPI — because an officer can be an excellent sampling statistician and still be unable to query the database their data sits in. |
| **Identify competency gaps** | Ask an LLM "what are they weak at?" | Deterministic gap arithmetic in SQL against **FRAC**, weighted by role criticality and **damped by measurement confidence**. The AI interprets the numbers; it never invents them. |
| **Recommend training via iGOT** | Screenshot a course list | A real **Karmayogi `/api/composite/v4/search`** adapter with `secureSettings` eligibility gates, plus **NSSTA TPAC** programmes. Sequenced by a **prerequisite graph**, not by gap size. |
| **Generate MCQs from uploads** | Prompt → parse → hope | Grammar-constrained JSON schema, a **verbatim-quote grounding check**, and every accepted quote **resolved to a page or slide number**. |
| **Learner dashboard** | A progress bar | Competency radar across all four families, AI diagnosis, recurring misconceptions, prerequisite-aware next steps. |
| **Administrator dashboard** | Enrolment counts | **Workforce intelligence**: where the workforce is weak, how many officials it affects, which training to commission, and whether it is working. Aggregate-only by construction. |

---

## Why this is defensible

**Gap analysis is arithmetic, not vibes.** A capacity-building decision inside a government
ministry has to withstand "why was I assigned this training?" `recompute_competency_gaps()`
is a SQL function: required proficiency minus evidence-weighted measured proficiency, times
importance, times a criticality multiplier, damped by how much evidence exists. Two officers
with identical records get identical results, every time. The LLM's job is to *explain* that
output in language an officer will act on — not to produce it.

**"No data" is not the same as "weak."** Most competency systems conflate them. Ours tracks a
separate confidence score per competency, and when it's low the system says *assess this*
rather than *train this*. Prescribing a course for an unmeasured competency wastes an
officer's time and the department's budget.

**Every generated question is traceable.** The model must return a verbatim span from the
source that justifies the answer. We then verify that span actually occurs in the document
(normalised, with fuzzy fallback for re-wrapped whitespace). Questions that fail are flagged
and the grounding rate is reported. This is a mechanical check, not a prompt asking the model
to behave.

**Which wrong answer, not just that it was wrong.** Our generator labels every
distractor with the specific misconception it encodes, so choosing option (a)
tells us precisely which false model the learner holds. Those are persisted and
aggregated: a belief demonstrated once is noise, three times is the thing worth
teaching against. No score can tell you *"you are treating the final sampling
stage as if it were the whole design"* — but the pattern of distractors can.

**The biggest gap is not always the right next step.** Competencies form a
prerequisite DAG. `get_zpd_competencies()` returns the *learnable frontier* —
gaps whose prerequisites the officer already holds — ranked by priority scaled
by readiness. Scheduling variance estimation for someone who cannot yet compute
a design weight wastes their time and dents their confidence, so the planner is
forbidden from doing it.

**The spaced-repetition engine is the real one.** `src/lib/fsrs.ts` is a faithful port of
FSRS-6, verified against the reference `py-fsrs` implementation — identical intervals,
stability and difficulty across every test sequence:

| Sequence | py-fsrs reference | Samiksha |
|---|---|---|
| all Good | 10m→2d→11d→46d→163d→498d→1348d→3299d | ✅ identical |
| all Easy | 8d→66d→397d→1875d→7265d | ✅ identical |
| Good×3→Again→Good | 10m→2d→11d→10m→2d→5d | ✅ identical |

---

## The learning science

Requirement 3 asked for "proven scientific ways to learn a topic in a short period."
These are the interventions with the strongest replication records, and where each one lives:

| Method | What the evidence says | Where it lives |
|---|---|---|
| **Spaced repetition** | Distributed practice beats massed practice for long-term retention | `src/lib/fsrs.ts` — FSRS-6 schedules each card for when recall is predicted to decay to your target |
| **Retrieval practice** | Recalling strengthens memory far more than re-reading | Every input step in a path is followed by a retrieval step, enforced in the planner prompt |
| **Interleaving** | Mixing topics beats blocking them — harder in the moment, better transfer | `get_due_cards()` rotates competencies round-robin rather than draining one at a time |
| **Elaborative interrogation** | Asking "why is this true" at encoding improves recall | Every flashcard carries an `elaboration` field; the generator is instructed to explain mechanism, not restate |
| **Metacognitive calibration** | Knowing what you don't know predicts self-directed learning success | Confidence is captured **before** the answer is revealed; quizzes report calibration error and name overconfidence explicitly |
| **Desirable difficulties** | Conditions that slow acquisition improve retention | Interleaving and expanding intervals are applied deliberately, and the UI explains why it feels harder |
| **Bloom's taxonomy spread** | Recall-only assessment can't distinguish competence levels | MCQ generation targets a deliberate Apply/Analyse/Evaluate distribution, shown to the learner after each quiz |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  ANDROID APP  ·  React Native 0.86 · Expo 57 · TypeScript    │
│  Ships ONLY the Supabase anon key. RLS is the real boundary. │
└───────────────────────────┬──────────────────────────────────┘
                            │ JWT
┌───────────────────────────▼──────────────────────────────────┐
│  SUPABASE EDGE FUNCTIONS (Deno)  ·  all secrets live here    │
│  generate-quiz · process-material · diagnose-competency      │
│  generate-path · curate-videos · tutor · generate-flashcards │
└──────┬──────────────────────┬──────────────────┬─────────────┘
       │                      │                  │
┌──────▼────────┐   ┌─────────▼────────┐  ┌──────▼───────────┐
│  PostgreSQL   │   │   OpenRouter     │  │  iGOT Karmayogi  │
│  35 tables    │   │  DeepSeek v4     │  │  Sunbird ED      │
│  57 policies  │   │  Kimi k2.5/k2.6  │  │  adapter         │
│  pgvector RAG │   └──────────────────┘  └──────────────────┘
└───────────────┘
```

### One model, deliberately

Everything runs on **`deepseek/deepseek-v4-flash`** via OpenRouter. A single pinned model
is a design decision, not a shortcut:

| Property | Value | Why it matters here |
|---|---|---|
| Context | **1M tokens** | An entire 150-page training handbook fits in one call. No chunk-stitching, so questions cannot contradict each other across chunk boundaries. |
| Cost | **~$0.09 / M input** | A 20-question quiz from a full PDF costs well under a cent. That is what makes per-learner, on-demand generation viable for a workforce of thousands rather than a demo for five. |
| Output | **Strict JSON schema** | Decoding is grammar-constrained, so response shape is guaranteed rather than parsed and prayed over. |

The tradeoff is stated rather than hidden: the model is **text-only**. A scanned PDF with no
text layer is rejected with an actionable message instead of being silently indexed as an
empty document and then generating confident nonsense from it. `modelSupportsVision()` gates
the OCR path, so it lights up automatically if a vision model is ever configured.

Every call is retried with jittered backoff and cost-audited into `ai_generations`.

> We evaluated NVIDIA Build as a dev-phase provider first. Their catalogue lists
> `moonshotai/kimi-k2.6` but the account is not entitled for it (`404 Not found for account`),
> `kimi-k2.5` is absent entirely, and the endpoint timed out under load. We dropped it before
> writing any integration code rather than discovering this during judging.

---

## Security

The APK ships with the Supabase **anon key** and nothing else. An APK is trivially
decompilable, so anything compiled into it is public by definition.

- `scripts/sync-env.mjs` **refuses to run** if a server secret ever carries an `EXPO_PUBLIC_` prefix
- Service role key, OpenRouter key and YouTube key exist only as Supabase Edge Function secrets
- All 35 tables are deny-by-default with explicit RLS grants
- `auth.uid()` is wrapped in `(select …)` throughout so Postgres evaluates it once per statement, not once per row
- Nodal-officer dashboards read an aggregate view that cannot expose individual learners

---

## Running it

### Install the app

Download the latest APK from **[Releases](https://github.com/adryxportfolio/sih2026/releases/latest)**,
allow "install unknown apps" for your browser, and open it. Tap **Explore the demo** — the full
journey runs offline with no account.

### Run from source

```bash
git clone https://github.com/adryxportfolio/sih2026.git
cd sih2026
cp .env.example .env        # fill in your keys
npm run env:sync            # propagates CLIENT-SAFE vars only
cd mobile && npm install && npm start
```

### Set up the backend

1. **Database** — open the Supabase SQL Editor and run `supabase/schema.sql` (all migrations, in order)
2. **Storage** — create a bucket named `materials` (private)
3. **Secrets** — `supabase secrets set --env-file .env`
4. **Functions** — `supabase functions deploy`

The app runs in demo mode without any of this.

---

## Repository layout

```
mobile/                    Expo / React Native app
  app/                     expo-router screens
  src/theme/               design tokens (white · black · greys)
  src/components/motion.tsx  animation kit (Reanimated worklets)
  src/components/          UI kit + SVG data visualisation
  src/lib/fsrs.ts          FSRS-6, verified against py-fsrs
  src/lib/demo.ts          offline demo dataset
supabase/
  migrations/              8 ordered migrations
  schema.sql               all migrations bundled, paste-ready
  functions/               7 Edge Functions + shared modules
.github/workflows/         zero-cost APK build → GitHub Release
docs/                      architecture and demo notes
```

---

## Honest limitations

We would rather state these than have a judge find them.

- **iGOT integration runs against a simulator, but against the real contract.** Karmayogi
  Bharat publishes its platform under the `KB-iGOT` GitHub organisation, and
  `deterministic-chatbot` documents the production endpoints — so the adapter targets the
  actual `/api/composite/v4/search` shape, including the `secureSettings` moderated-course
  gates and the documented trap that filtering on `primaryCategory` silently drops live
  courses. What we cannot do is authenticate: credentials require an institutional
  arrangement. One environment variable switches `IGOT_MODE` from `mock` to `live`.
- **FRAC competency mappings are our reconstruction.** Grounded in published MoSPI Capacity
  Development material, NSSTA curricula, SQAF and NMDS 2.0 — but the authoritative FRAC
  dictionary is internal to DoPT.
- **The diagnostic is not yet item-adaptive.** Questions carry calibrated difficulty and the
  schema supports adaptive selection, but the current flow serves a fixed set. Adaptive item
  selection is the next thing we would build.
- **FSRS weights are the population defaults.** Per-learner optimisation needs several hundred
  reviews; `review_logs` captures everything required to run it once that data exists.
- **YouTube playback is embed-only, by design.** Downloading or re-hosting streams would breach
  YouTube's Terms of Service.

---

<div align="center">
<sub>Built for Smart India Hackathon 2026 · Problem Statement SIH26101</sub>
</div>
