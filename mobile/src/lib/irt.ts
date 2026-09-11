/**
 * Item Response Theory — 2PL model.
 *
 * WHY ADAPTIVE TESTING
 * ─────────────────────────────────────────────────────────────────────────
 * A fixed 20-question test spends most of its items telling you what you
 * already knew after question six. If an officer answers three hard sampling
 * questions correctly, asking them four easy ones adds almost no information
 * — the answer was already predictable.
 *
 * Adaptive testing picks each next item to maximise information about where
 * the learner actually sits. In practice that reaches the same measurement
 * confidence in roughly half the questions, which for a workforce of
 * thousands is the difference between a diagnostic people finish and one they
 * abandon.
 *
 * This mirrors the SQL implementation exactly (item_information /
 * submit_adaptive_response) so demo mode and live mode produce identical
 * numbers — and so the maths is reviewable in one place rather than trusted.
 *
 * Ability (theta) is on the same 0..4 proficiency scale as the rest of the
 * system, so a result drops into user_competency_scores with no translation.
 */

/** Discrimination. Held constant: we do not have enough response data per
 *  item to estimate it per-question without overfitting. */
export const DISCRIMINATION = 1.2;

/** Probability of a correct response under the 2PL model. */
export function probabilityCorrect(theta: number, difficulty: number, a = DISCRIMINATION): number {
  return 1 / (1 + Math.exp(-a * (theta - difficulty)));
}

/**
 * Fisher information an item carries at a given ability.
 * Peaks when difficulty matches ability — which is exactly why the next
 * question should be one the learner has roughly a coin-flip chance on.
 */
export function itemInformation(theta: number, difficulty: number, a = DISCRIMINATION): number {
  const p = probabilityCorrect(theta, difficulty, a);
  return a * a * p * (1 - p);
}

export interface AbilityState {
  theta: number;
  standardError: number;
  items: number;
}

export const INITIAL_ABILITY: AbilityState = {
  theta: 2.0,          // mid-scale prior
  standardError: 1.6,  // deliberately wide — we know nothing yet
  items: 0,
};

/**
 * One Newton-Raphson step on the 2PL likelihood.
 * SE shrinks as sqrt(1 / accumulated information), so it falls fastest when
 * items are well matched — the whole reason for choosing them that way.
 */
export function updateAbility(
  state: AbilityState, difficulty: number, isCorrect: boolean, a = DISCRIMINATION,
): AbilityState {
  const p = probabilityCorrect(state.theta, difficulty, a);
  const info = a * a * p * (1 - p);
  const totalInfo = 1 / (state.standardError * state.standardError) + info;

  const theta = Math.max(0, Math.min(4,
    state.theta + (a * ((isCorrect ? 1 : 0) - p)) / totalInfo,
  ));

  return {
    theta,
    standardError: Math.sqrt(1 / totalInfo),
    items: state.items + 1,
  };
}

/** Pick the most informative unanswered item. */
export function selectNextItem<T extends { difficulty: number }>(
  pool: T[], theta: number, answered: Set<unknown>, keyOf: (item: T) => unknown,
): T | null {
  let best: T | null = null;
  let bestInfo = -1;
  for (const item of pool) {
    if (answered.has(keyOf(item))) continue;
    const info = itemInformation(theta, item.difficulty);
    if (info > bestInfo) { bestInfo = info; best = item; }
  }
  return best;
}

export interface StopRule { minItems: number; maxItems: number; targetSe: number; }
export const DEFAULT_STOP: StopRule = { minItems: 6, maxItems: 20, targetSe: 0.45 };

export function shouldStop(state: AbilityState, rule: StopRule = DEFAULT_STOP): boolean {
  if (state.items < rule.minItems) return false;
  return state.standardError <= rule.targetSe || state.items >= rule.maxItems;
}

/** 95% confidence interval on the proficiency scale. */
export function confidenceInterval(state: AbilityState): [number, number] {
  const half = 1.96 * state.standardError;
  return [Math.max(0, state.theta - half), Math.min(4, state.theta + half)];
}

/**
 * How many fixed-form items would be needed for this precision.
 * A fixed test gains roughly the average item information each time, so the
 * ratio is what quantifies the saving we claim.
 */
export function equivalentFixedItems(state: AbilityState, avgInfo = 0.22): number {
  const needed = (1 / (state.standardError * state.standardError)) / avgInfo;
  return Math.max(state.items, Math.round(needed));
}
