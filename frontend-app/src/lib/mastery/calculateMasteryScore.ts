/**
 * Canonical CURRENT-mastery engine (engineVersion "current-mastery-v2").
 *
 * `mastery_score` answers "how well does the student appear to understand
 * this submission NOW", not "what is the best they have ever demonstrated."
 * It must be able to rise AND fall as new evidence arrives. This is a
 * deliberate redesign from the previous "best historical quiz attempt"
 * engine — see ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md for the full audit that
 * motivated it.
 *
 * This is a pure function: no DB access. The single DB-touching orchestrator
 * that calls this and upserts `student_submission_mastery` is
 * `src/lib/mastery/recalculateMastery.ts` — that file is also the ONLY
 * place in the codebase that should ever write to that table.
 *
 * Evidence categories and how they combine:
 *
 * 1. Quiz and Feynman are "knowledge evidence" — each is reduced to a
 *    recency-weighted "current" score (`computeQuizCurrent`/
 *    `computeFeynmanCurrent`) over at most the 5 most recent attempts, with
 *    linear recency weights (most recent = 5, down to 1). An attempt outside
 *    the window has zero influence — this is what lets an old peak fade out
 *    once enough new evidence exists, and what makes a single recent bad
 *    attempt move the score without destroying it (it competes against up
 *    to 4 other recent, weighted data points).
 * 2. `knowledgeScore` combines the two available knowledge sources
 *    (`computeKnowledgeScore`). Quiz-only or Feynman-only evidence is used
 *    as-is — there is intentionally NO discount for missing the other
 *    source (a student who only ever takes quizzes should not be capped
 *    below their real quiz performance merely for never having done a
 *    Feynman explanation).
 * 3. If there is NO knowledge evidence at all (no quiz attempt, no Feynman
 *    attempt), this function returns `null`. Callers must NOT write a
 *    mastery row in that case — "no evidence yet" must stay unknown, never
 *    become a confident 0.
 * 4. Content/activity engagement is treated as weaker, exposure-only
 *    evidence. It can only ever produce a small, bounded, NON-POSITIVE
 *    modifier (`computeEngagementModifier`, capped at -5) applied on top of
 *    `knowledgeScore` — it can never independently create a
 *    Proficient/Mastered score, and time-on-page alone can never raise
 *    mastery.
 */

export type MasteryLevel = "Beginner" | "Developing" | "Proficient" | "Mastered";

type ContentBlock = {
  id: string;
  recommendedTimeSeconds: number | null;
};

type ContentBlockTime = {
  contentId: string;
  activeSeconds: number;
  idleSeconds: number;
};

type QuizAttempt = {
  scorePercentage: number | null;
  /** Resolved by the caller (e.g. `submitted_at ?? created_at`). */
  timestamp: string | null;
  randomizationMode: number | null;
};

type FeynmanAttempt = {
  score: number | null;
  timestamp: string | null;
};

export type MasteryResult = {
  score: number;
  level: MasteryLevel;
  metadata: {
    engineVersion: "current-mastery-v2";
    quizCurrentScore: number | null;
    quizAttemptCountUsed: number;
    feynmanCurrentScore: number | null;
    feynmanAttemptCountUsed: number;
    knowledgeScore: number;
    engagementModifier: number;
    finalScore: number;
  };
};

/* ── Recency-weighted "current" score (shared by quiz and Feynman) ──────
 * Rank-1 (most recent attempt) is ALWAYS weight 5, regardless of how many
 * total attempts exist — with 5 attempts present, weights are [5,4,3,2,1]
 * (sum 15) so the latest attempt contributes exactly 5/15 = 33.3%. With
 * fewer attempts, only the top-N weights are used and normalised by their
 * own sum (e.g. 3 attempts -> weights [5,4,3], sum 12) — the latest
 * attempt's relative share grows as evidence shrinks, which is intentional:
 * there is genuinely less competing evidence to weigh it against.
 */
const RECENCY_WEIGHTS = [5, 4, 3, 2, 1];
const MAX_RECENT_ATTEMPTS = RECENCY_WEIGHTS.length;

function recencyWeightedScore(
  entries: Array<{ score: number; timestampMs: number }>
): { score: number; attemptCountUsed: number } | null {
  if (entries.length === 0) return null;

  const recent = [...entries].sort((a, b) => b.timestampMs - a.timestampMs).slice(0, MAX_RECENT_ATTEMPTS);
  const weights = RECENCY_WEIGHTS.slice(0, recent.length);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const weightedSum = recent.reduce((sum, entry, i) => sum + entry.score * weights[i], 0);

  return {
    score: Math.round((weightedSum / totalWeight) * 10) / 10,
    attemptCountUsed: recent.length,
  };
}

/* ── Quiz current score ──────────────────────────────────────────────── */

function quizModeMultiplier(mode: number | null): number {
  return mode === 2 ? 1.1 : mode === 1 ? 1.05 : 1.0;
}

function computeQuizCurrent(attempts: QuizAttempt[]): { score: number; attemptCountUsed: number } | null {
  const entries = attempts
    .filter(
      (a): a is QuizAttempt & { scorePercentage: number; timestamp: string } =>
        a.scorePercentage !== null && Number.isFinite(a.scorePercentage) && a.timestamp !== null
    )
    .map((a) => ({
      score: Math.min(100, a.scorePercentage * quizModeMultiplier(a.randomizationMode)),
      timestampMs: new Date(a.timestamp).getTime(),
    }))
    .filter((e) => Number.isFinite(e.timestampMs));

  return recencyWeightedScore(entries);
}

/* ── Feynman current score ───────────────────────────────────────────── */

function computeFeynmanCurrent(attempts: FeynmanAttempt[]): { score: number; attemptCountUsed: number } | null {
  const entries = attempts
    .filter(
      (a): a is FeynmanAttempt & { score: number; timestamp: string } =>
        a.score !== null && Number.isFinite(a.score) && a.timestamp !== null
    )
    .map((a) => ({ score: a.score, timestampMs: new Date(a.timestamp).getTime() }))
    .filter((e) => Number.isFinite(e.timestampMs));

  return recencyWeightedScore(entries);
}

/* ── Knowledge score (quiz + Feynman combination) ────────────────────────
 * 0.60/0.40 is an explicit, named PILOT heuristic — not an empirically
 * validated weighting. It exists so the two knowledge sources combine
 * predictably when both are present; it should be revisited once real
 * classroom data is available to calibrate it. Missing one source is never
 * treated as a penalty: quiz-only or Feynman-only evidence is used as-is.
 */
export const QUIZ_KNOWLEDGE_WEIGHT = 0.6;
export const FEYNMAN_KNOWLEDGE_WEIGHT = 0.4;

function computeKnowledgeScore(
  quiz: { score: number; attemptCountUsed: number } | null,
  feynman: { score: number; attemptCountUsed: number } | null
): number | null {
  if (quiz && feynman) {
    return Math.round((QUIZ_KNOWLEDGE_WEIGHT * quiz.score + FEYNMAN_KNOWLEDGE_WEIGHT * feynman.score) * 10) / 10;
  }
  if (quiz) return quiz.score;
  if (feynman) return feynman.score;
  return null;
}

/* ── Engagement modifier (content/activity — weak, exposure-only evidence) ──
 * Always <= 0: engagement can only ever pull mastery down slightly for
 * clearly insufficient exposure or high idle time, never add points for
 * merely spending time. This is what guarantees time-on-page alone can
 * never manufacture a Proficient/Mastered score (it also can't do so
 * structurally, since this modifier only ever applies on top of an
 * already-required `knowledgeScore` — see the no-knowledge-evidence guard
 * in `calculateMasteryScore`).
 *
 * Two independently-bounded components, reusing the same 0.7 on-target
 * breakpoint as the exposure-ratio curve this replaces:
 * - under-exposure: active time well below the recommended time for timed
 *   content blocks, capped at -2.
 * - idle: idle time relative to active time across all content blocks,
 *   capped at -3.
 * Combined, capped at the overall -5 bound.
 */
const ENGAGEMENT_MODIFIER_MAX = 5;
const UNDER_EXPOSURE_RATIO_TARGET = 0.7;
const UNDER_EXPOSURE_MAX_PENALTY = 2;
const IDLE_MAX_PENALTY = 3;

function computeEngagementModifier(blocks: ContentBlock[], blockTimes: ContentBlockTime[]): number {
  const timeMap = new Map(blockTimes.map((bt) => [bt.contentId, bt.activeSeconds]));
  const timedBlocks = blocks.filter(
    (b): b is ContentBlock & { recommendedTimeSeconds: number } =>
      b.recommendedTimeSeconds != null && b.recommendedTimeSeconds > 0
  );

  let underExposurePenalty = 0;
  if (timedBlocks.length > 0) {
    const totalActive = timedBlocks.reduce((s, b) => s + (timeMap.get(b.id) ?? 0), 0);
    const totalRecommended = timedBlocks.reduce((s, b) => s + b.recommendedTimeSeconds, 0);
    if (totalRecommended > 0) {
      const ratio = totalActive / totalRecommended;
      if (ratio < UNDER_EXPOSURE_RATIO_TARGET) {
        underExposurePenalty = Math.min(
          UNDER_EXPOSURE_MAX_PENALTY,
          ((UNDER_EXPOSURE_RATIO_TARGET - ratio) / UNDER_EXPOSURE_RATIO_TARGET) * UNDER_EXPOSURE_MAX_PENALTY
        );
      }
    }
  }

  const totalActiveAll = blockTimes.reduce((s, bt) => s + bt.activeSeconds, 0);
  const totalIdleAll = blockTimes.reduce((s, bt) => s + bt.idleSeconds, 0);
  const idlePenalty = totalActiveAll > 0 ? Math.min(IDLE_MAX_PENALTY, (totalIdleAll / totalActiveAll) * IDLE_MAX_PENALTY) : 0;

  const penalty = Math.min(ENGAGEMENT_MODIFIER_MAX, underExposurePenalty + idlePenalty);
  return -(Math.round(penalty * 10) / 10);
}

function toLevel(score: number): MasteryLevel {
  if (score >= 85) return "Mastered";
  if (score >= 70) return "Proficient";
  if (score >= 40) return "Developing";
  return "Beginner";
}

/**
 * Returns `null` when there is no knowledge evidence at all (no quiz
 * attempt, no Feynman attempt) — callers must not write a mastery row in
 * that case; "no evidence yet" must stay unknown, never become 0.
 */
export function calculateMasteryScore(params: {
  contentBlocks: ContentBlock[];
  contentBlockTimes: ContentBlockTime[];
  quizAttempts: QuizAttempt[];
  feynmanAttempts: FeynmanAttempt[];
}): MasteryResult | null {
  const { contentBlocks, contentBlockTimes, quizAttempts, feynmanAttempts } = params;

  const quiz = computeQuizCurrent(quizAttempts);
  const feynman = computeFeynmanCurrent(feynmanAttempts);
  const knowledgeScore = computeKnowledgeScore(quiz, feynman);

  if (knowledgeScore === null) {
    return null;
  }

  const engagementModifier = computeEngagementModifier(contentBlocks, contentBlockTimes);
  const finalScore = Math.round(Math.max(0, Math.min(100, knowledgeScore + engagementModifier)) * 10) / 10;

  return {
    score: finalScore,
    level: toLevel(finalScore),
    metadata: {
      engineVersion: "current-mastery-v2",
      quizCurrentScore: quiz?.score ?? null,
      quizAttemptCountUsed: quiz?.attemptCountUsed ?? 0,
      feynmanCurrentScore: feynman?.score ?? null,
      feynmanAttemptCountUsed: feynman?.attemptCountUsed ?? 0,
      knowledgeScore,
      engagementModifier,
      finalScore,
    },
  };
}
