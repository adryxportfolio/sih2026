/**
 * FSRS-6 — Free Spaced Repetition Scheduler.
 *
 * Ported from the reference implementation (open-spaced-repetition/py-fsrs),
 * formula for formula. This is not an approximation of FSRS; it is FSRS.
 *
 * WHY THIS ALGORITHM
 * ──────────────────────────────────────────────────────────────────────────
 * The spacing effect — that review spread over time beats the same time
 * massed together — is one of the most replicated findings in cognitive
 * psychology. Turning it into a schedule needs a memory model.
 *
 * FSRS uses the three-component DSR model:
 *   S  Stability      days for recall probability to fall from 100% to 90%
 *   D  Difficulty     1..10, how resistant this item is to gaining stability
 *   R  Retrievability current recall probability, a function of S and elapsed
 *
 * After each review we update S and D from the learner's rating, then schedule
 * the next review for the moment R decays to the learner's target retention.
 * Reviewing earlier wastes effort; later loses the memory. FSRS aims at the
 * point of maximum efficiency, which is why it consistently needs ~20-30%
 * fewer reviews than SM-2 for the same retention.
 *
 * Ratings: 1 Again · 2 Hard · 3 Good · 4 Easy
 */

export type Rating = 1 | 2 | 3 | 4;
export type CardState = "new" | "learning" | "review" | "relearning";

export const RATING = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;

/** Weights fitted across tens of millions of reviews. Index 20 is the decay term. */
export const DEFAULT_PARAMETERS: number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
  1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
  1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

const STABILITY_MIN = 0.001;
const MIN_DIFFICULTY = 1.0;
const MAX_DIFFICULTY = 10.0;

export interface FsrsCard {
  state: CardState;
  stability: number;   // 0 when never reviewed
  difficulty: number;  // 0 when never reviewed
  due: Date;
  lastReview: Date | null;
  reps: number;
  lapses: number;
  step: number;
}

export interface ReviewOutcome {
  card: FsrsCard;
  log: {
    rating: Rating;
    stateBefore: CardState;
    stabilityBefore: number;
    difficultyBefore: number;
    stabilityAfter: number;
    difficultyAfter: number;
    elapsedDays: number;
    scheduledDays: number;
    retrievability: number;
    reviewedAt: Date;
  };
}

export interface FsrsConfig {
  parameters?: number[];
  /** Target recall probability. 0.90 is the sane default; higher = more reviews. */
  desiredRetention?: number;
  /** Minutes for each learning step before a card graduates to review. */
  learningStepsMinutes?: number[];
  relearningStepsMinutes?: number[];
  maximumIntervalDays?: number;
  /** Spread due dates to avoid review pile-ups on one day. */
  enableFuzz?: boolean;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

export class FSRS {
  private w: number[];
  private decay: number;
  private factor: number;
  readonly desiredRetention: number;
  private learningSteps: number[];
  private relearningSteps: number[];
  private maximumInterval: number;
  private enableFuzz: boolean;

  constructor(config: FsrsConfig = {}) {
    this.w = config.parameters ?? DEFAULT_PARAMETERS;
    this.desiredRetention = config.desiredRetention ?? 0.9;
    this.learningSteps = config.learningStepsMinutes ?? [1, 10];
    this.relearningSteps = config.relearningStepsMinutes ?? [10];
    this.maximumInterval = config.maximumIntervalDays ?? 36500;
    this.enableFuzz = config.enableFuzz ?? true;

    this.decay = -this.w[20];
    this.factor = Math.pow(0.9, 1 / this.decay) - 1;
  }

  // ── Core formulas ─────────────────────────────────────────────────────────

  /** R(t,S) = (1 + FACTOR · t/S)^DECAY — the forgetting curve. */
  retrievability(elapsedDays: number, stability: number): number {
    if (stability <= 0) return 0;
    return Math.pow(1 + this.factor * (Math.max(0, elapsedDays) / stability), this.decay);
  }

  private clampD(d: number) { return Math.min(Math.max(d, MIN_DIFFICULTY), MAX_DIFFICULTY); }
  private clampS(s: number) { return Math.max(s, STABILITY_MIN); }

  private initialStability(rating: Rating): number {
    return this.clampS(this.w[rating - 1]);
  }

  private initialDifficulty(rating: Rating, clamp = true): number {
    const d = this.w[4] - Math.exp(this.w[5] * (rating - 1)) + 1;
    return clamp ? this.clampD(d) : d;
  }

  /** Days until R decays to desiredRetention. */
  private nextIntervalDays(stability: number): number {
    const raw = (stability / this.factor) *
      (Math.pow(this.desiredRetention, 1 / this.decay) - 1);
    return Math.min(Math.max(Math.round(raw), 1), this.maximumInterval);
  }

  /** Same-day re-review: stability nudges rather than jumps. */
  private shortTermStability(stability: number, rating: Rating): number {
    let inc = Math.exp(this.w[17] * (rating - 3 + this.w[18])) *
      Math.pow(stability, -this.w[19]);
    if (rating >= 2) inc = Math.max(inc, 1.0);
    return this.clampS(stability * inc);
  }

  /**
   * Difficulty update with linear damping + mean reversion toward the
   * difficulty an "Easy" first answer implies — stops D drifting to an
   * extreme and sticking there.
   */
  private nextDifficulty(difficulty: number, rating: Rating): number {
    const deltaD = -(this.w[6] * (rating - 3));
    const damped = (10.0 - difficulty) * deltaD / 9.0;
    const arg2 = difficulty + damped;
    const arg1 = this.initialDifficulty(4, false);
    return this.clampD(this.w[7] * arg1 + (1 - this.w[7]) * arg2);
  }

  private nextRecallStability(d: number, s: number, r: number, rating: Rating): number {
    const hardPenalty = rating === 2 ? this.w[15] : 1;
    const easyBonus = rating === 4 ? this.w[16] : 1;
    return s * (
      1 + Math.exp(this.w[8]) *
      (11 - d) *
      Math.pow(s, -this.w[9]) *
      (Math.exp((1 - r) * this.w[10]) - 1) *
      hardPenalty * easyBonus
    );
  }

  private nextForgetStability(d: number, s: number, r: number): number {
    const longTerm = this.w[11] *
      Math.pow(d, -this.w[12]) *
      (Math.pow(s + 1, this.w[13]) - 1) *
      Math.exp((1 - r) * this.w[14]);
    const shortTerm = s / Math.exp(this.w[17] * this.w[18]);
    return Math.min(longTerm, shortTerm);
  }

  private nextStability(d: number, s: number, r: number, rating: Rating): number {
    const next = rating === 1
      ? this.nextForgetStability(d, s, r)
      : this.nextRecallStability(d, s, r, rating);
    return this.clampS(next);
  }

  /**
   * Anki-style fuzz: jitter long intervals slightly so a big review day
   * doesn't recur forever. Never applied under 2.5 days.
   */
  private fuzz(intervalDays: number): number {
    if (!this.enableFuzz || intervalDays < 2.5) return intervalDays;
    const ranges = [
      { start: 2.5, end: 7.0, factor: 0.15 },
      { start: 7.0, end: 20.0, factor: 0.1 },
      { start: 20.0, end: Infinity, factor: 0.05 },
    ];
    let delta = 1.0;
    for (const r of ranges) {
      delta += r.factor * Math.max(0, Math.min(intervalDays, r.end) - r.start);
    }
    const min = Math.max(2, Math.round(intervalDays - delta));
    const max = Math.min(Math.round(intervalDays + delta), this.maximumInterval);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ── Scheduler ─────────────────────────────────────────────────────────────

  /** Preview the interval for every rating — powers the button labels. */
  preview(card: FsrsCard, now = new Date()): Record<Rating, { due: Date; label: string }> {
    const out = {} as Record<Rating, { due: Date; label: string }>;
    for (const r of [1, 2, 3, 4] as Rating[]) {
      const { card: next } = this.review({ ...card }, r, now);
      out[r] = { due: next.due, label: formatInterval(next.due.getTime() - now.getTime()) };
    }
    return out;
  }

  review(card: FsrsCard, rating: Rating, now = new Date()): ReviewOutcome {
    const stateBefore = card.state;
    const stabilityBefore = card.stability;
    const difficultyBefore = card.difficulty;

    const elapsedMs = card.lastReview ? now.getTime() - card.lastReview.getTime() : 0;
    const elapsedDays = card.lastReview ? elapsedMs / DAY : 0;
    const isSameDay = card.lastReview != null && elapsedDays < 1;

    const r = card.stability > 0 ? this.retrievability(elapsedDays, card.stability) : 0;

    const next: FsrsCard = {
      ...card,
      reps: card.reps + 1,
      lastReview: now,
      lapses: card.lapses + (rating === 1 && card.state === "review" ? 1 : 0),
    };

    // ── Memory state ────────────────────────────────────────────────────────
    if (card.state === "new" || card.stability <= 0) {
      next.stability = this.initialStability(rating);
      next.difficulty = this.initialDifficulty(rating);
    } else if (isSameDay) {
      next.stability = this.shortTermStability(card.stability, rating);
      next.difficulty = this.nextDifficulty(card.difficulty, rating);
    } else {
      next.stability = this.nextStability(card.difficulty, card.stability, r, rating);
      next.difficulty = this.nextDifficulty(card.difficulty, rating);
    }

    // ── Scheduling state machine ────────────────────────────────────────────
    let intervalMs: number;

    const graduate = () => {
      next.state = "review";
      next.step = 0;
      intervalMs = this.fuzz(this.nextIntervalDays(next.stability)) * DAY;
    };

    if (card.state === "new" || card.state === "learning" || card.state === "relearning") {
      const steps = card.state === "relearning" ? this.relearningSteps : this.learningSteps;
      const phase: CardState = card.state === "relearning" ? "relearning" : "learning";
      next.state = phase;

      if (steps.length === 0) {
        graduate();
      } else if (rating === 1) {
        next.step = 0;
        intervalMs = steps[0] * MINUTE;
      } else if (rating === 2) {
        // Hard holds position; on the first step it sits between step 0 and 1.
        const step = Math.min(card.step, steps.length - 1);
        next.step = step;
        if (step === 0) {
          intervalMs = steps.length === 1
            ? steps[0] * 1.5 * MINUTE
            : ((steps[0] + steps[1]) / 2) * MINUTE;
        } else {
          intervalMs = steps[step] * MINUTE;
        }
      } else if (rating === 3) {
        const nextStep = card.step + 1;
        if (nextStep >= steps.length) {
          graduate();
        } else {
          next.step = nextStep;
          intervalMs = steps[nextStep] * MINUTE;
        }
      } else {
        graduate();
      }
    } else {
      // Review state
      if (rating === 1) {
        if (this.relearningSteps.length === 0) {
          intervalMs = this.fuzz(this.nextIntervalDays(next.stability)) * DAY;
          next.state = "review";
          next.step = 0;
        } else {
          next.state = "relearning";
          next.step = 0;
          intervalMs = this.relearningSteps[0] * MINUTE;
        }
      } else {
        next.state = "review";
        next.step = 0;
        intervalMs = this.fuzz(this.nextIntervalDays(next.stability)) * DAY;
      }
    }

    next.due = new Date(now.getTime() + intervalMs!);

    return {
      card: next,
      log: {
        rating,
        stateBefore,
        stabilityBefore,
        difficultyBefore,
        stabilityAfter: next.stability,
        difficultyAfter: next.difficulty,
        elapsedDays,
        scheduledDays: intervalMs! / DAY,
        retrievability: r,
        reviewedAt: now,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function formatInterval(ms: number): string {
  const mins = ms / MINUTE;
  if (mins < 1) return "<1m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30.44;
  if (months < 12) return `${months < 2 ? months.toFixed(1) : Math.round(months)}mo`;
  const years = days / 365.25;
  return `${years < 2 ? years.toFixed(1) : Math.round(years)}y`;
}

/** DB row → scheduler card. */
// deno-lint-ignore no-explicit-any
export function cardFromRow(row: any): FsrsCard {
  return {
    state: (row.state ?? "new") as CardState,
    stability: Number(row.stability ?? 0),
    difficulty: Number(row.difficulty ?? 0),
    due: row.due ? new Date(row.due) : new Date(),
    lastReview: row.last_review ? new Date(row.last_review) : null,
    reps: Number(row.reps ?? 0),
    lapses: Number(row.lapses ?? 0),
    step: Number(row.step ?? 0),
  };
}

/** Scheduler card → DB update payload. */
export function cardToRow(card: FsrsCard) {
  return {
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.toISOString(),
    last_review: card.lastReview?.toISOString() ?? null,
    reps: card.reps,
    lapses: card.lapses,
    step: card.step,
  };
}

export const fsrs = new FSRS();
