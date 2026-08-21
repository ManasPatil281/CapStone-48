/**
 * Roadblock Evidence extractor.
 *
 * Deterministic, read-only transformation:
 *
 *   StudentLearningState -> extractRoadblockEvidence() -> RoadblockEvidence
 *
 * This is the FIRST layer of struggle detection only: it reports factual
 * warning signals derived from data that already exists on the Student
 * Learning State. It does NOT diagnose root cause, does NOT call an LLM, and
 * does NOT decide a pedagogical action (REMEDIATE, REVISIT_PREREQUISITE, ...).
 * That belongs to a later planner layer.
 *
 * Core rule: absence of a signal is never treated as a negative finding.
 * Every check below is gated behind an explicit "evidence exists" condition;
 * where evidence is missing, the relevant `evidenceAvailability` flag is
 * false and no signal is emitted for that data point.
 *
 * Reused (not reinvented) thresholds:
 * - idle ratio > 1.5 and "mastery < 40 after >= 4 visits" mirror the
 *   documented heuristic pre-filter in src/lib/ai/agents/struggle-detector.ts
 *   (see ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md §9).
 * - RETENTION_RISK_ACTIVE_RECALL_DUE reuses `state.revision.activeRecallEligible`
 *   as-is (the exact rule already used in recommendations/page.tsx) rather
 *   than implementing a new spaced-repetition/forgetting-curve calculation.
 *
 * All other numeric thresholds below are new v1 defaults, chosen
 * conservatively, and documented inline where defined.
 */

import type { StudentLearningState } from "./studentLearningState";

export type Severity = "low" | "medium" | "high";

export type EvidenceSource = "mastery" | "quiz" | "engagement" | "prerequisites" | "feynman";

export type RoadblockSignalType =
  | "MASTERY_LOW_SUBMISSION"
  | "MASTERY_LOW_LO_AGGREGATE"
  | "MASTERY_SUBMISSION_BELOW_LO_AGGREGATE"
  | "QUIZ_LATEST_LOW_SCORE"
  | "QUIZ_REPEATED_LOW_PERFORMANCE"
  | "QUIZ_LATEST_BELOW_BEST"
  | "QUIZ_DECLINING_TREND"
  | "QUIZ_MULTIPLE_ATTEMPTS_NO_PROFICIENCY"
  | "QUIZ_RECENT_FAILURE_AFTER_STRONG_PERFORMANCE"
  | "RETENTION_RISK_ACTIVE_RECALL_DUE"
  | "ENGAGEMENT_HIGH_IDLE_RATIO"
  | "ENGAGEMENT_REPEATED_VISITS_LOW_MASTERY"
  | "ENGAGEMENT_HIGH_TIME_NO_IMPROVEMENT"
  | "PREREQUISITE_LOW_MASTERY"
  | "PREREQUISITE_CURRENT_WEAK_PREREQ_STRONG"
  | "FEYNMAN_LOW_SCORE"
  | "FEYNMAN_MISMATCH_WITH_PERFORMANCE";

export interface RoadblockSignal {
  type: RoadblockSignalType;
  severity: Severity;
  source: EvidenceSource;
  evidence: string;
  /** Set only for prerequisite-related signals. */
  relatedLoId?: string;
}

export type PrerequisiteEvidenceStatus = "concerning" | "healthy" | "unavailable";

export interface RoadblockEvidence {
  generatedAt: string;
  studentId: string;
  submissionId: string;
  hasPotentialRoadblock: boolean;
  signals: RoadblockSignal[];
  evidenceAvailability: {
    mastery: boolean;
    quiz: boolean;
    engagement: boolean;
    prerequisites: boolean;
    feynman: boolean;
  };
  /**
   * Per-prerequisite evidence status, exposed separately from `signals` so
   * "unavailable" is visible rather than silently absent. Only
   * "concerning" entries also produce a PREREQUISITE_LOW_MASTERY signal.
   */
  prerequisiteEvidence: Array<{
    loId: string;
    title: string | null;
    evidenceStatus: PrerequisiteEvidenceStatus;
    bestKnownScore: number | null;
  }>;
}

// --- Explicit thresholds (v1 defaults; see file header for provenance) ---
const PROFICIENT_THRESHOLD = 70; // matches existing mastery level scale (70-84 Proficient)
const BEGINNER_THRESHOLD = 40; // matches existing mastery level scale (<40 Beginner)

const MASTERY_SUBMISSION_VS_LO_GAP = 20;

const QUIZ_LATEST_LOW_SCORE_MAX = 40;
const QUIZ_REPEATED_LOW_MIN_ATTEMPTS = 2;
const QUIZ_REPEATED_LOW_MAJORITY_RATIO = 0.5;
const QUIZ_LATEST_BELOW_BEST_GAP = 15;
const QUIZ_LATEST_BELOW_BEST_SEVERE_GAP = 30;
const QUIZ_MULTIPLE_ATTEMPTS_MIN = 3;
const QUIZ_RECENT_FAILURE_PRIOR_BEST_MIN = 70;
const QUIZ_RECENT_FAILURE_LATEST_MAX = 50;

// Reused verbatim from struggle-detector.ts's documented heuristic pre-filter.
const ENGAGEMENT_IDLE_RATIO_THRESHOLD = 1.5;
const ENGAGEMENT_REPEATED_VISITS_MIN = 4;
const ENGAGEMENT_REPEATED_VISITS_MASTERY_MAX = 40;

const ENGAGEMENT_TIME_NO_IMPROVEMENT_RATIO = 2.0;

const FEYNMAN_MISMATCH_GAP = 20;

function severityFromScore(score: number, highBelow: number = BEGINNER_THRESHOLD): Severity {
  return score < highBelow ? "high" : "medium";
}

/**
 * Deterministic extraction of roadblock evidence from an already-built
 * Student Learning State. Pure function: no DB access, no LLM.
 */
export function extractRoadblockEvidence(state: StudentLearningState): RoadblockEvidence {
  const signals: RoadblockSignal[] = [];

  // --- Mastery ---
  const { mastery, loMastery } = state;

  if (mastery && typeof mastery.score === "number" && mastery.score < PROFICIENT_THRESHOLD) {
    signals.push({
      type: "MASTERY_LOW_SUBMISSION",
      severity: severityFromScore(mastery.score),
      source: "mastery",
      evidence: `Submission mastery is ${mastery.score} (${mastery.level ?? "unknown level"}), below the Proficient threshold (${PROFICIENT_THRESHOLD}).`,
    });
  }

  if (loMastery && typeof loMastery.score === "number" && loMastery.score < PROFICIENT_THRESHOLD) {
    signals.push({
      type: "MASTERY_LOW_LO_AGGREGATE",
      severity: severityFromScore(loMastery.score),
      source: "mastery",
      evidence: `Aggregate LO mastery is ${loMastery.score} (${loMastery.level ?? "unknown level"}), based on ${loMastery.evidenceSubmissionCount}/${loMastery.totalApprovedSubmissions} approved submission(s) with evidence.`,
    });
  }

  if (
    mastery &&
    typeof mastery.score === "number" &&
    loMastery &&
    typeof loMastery.score === "number" &&
    loMastery.score - mastery.score >= MASTERY_SUBMISSION_VS_LO_GAP
  ) {
    signals.push({
      type: "MASTERY_SUBMISSION_BELOW_LO_AGGREGATE",
      severity: "medium",
      source: "mastery",
      evidence: `This submission's mastery (${mastery.score}) is ${(loMastery.score - mastery.score).toFixed(1)} points below the LO's aggregate mastery (${loMastery.score}), suggesting this particular submission may be a weaker fit than other approved material for the same LO.`,
    });
  }

  // --- Quiz / performance (only when quiz evidence exists) ---
  const { quiz } = state;
  if (quiz.attemptCount > 0) {
    if (typeof quiz.latestScorePercentage === "number" && quiz.latestScorePercentage < QUIZ_LATEST_LOW_SCORE_MAX) {
      signals.push({
        type: "QUIZ_LATEST_LOW_SCORE",
        severity: "high",
        source: "quiz",
        evidence: `Latest quiz attempt scored ${quiz.latestScorePercentage}%, below ${QUIZ_LATEST_LOW_SCORE_MAX}%.`,
      });
    }

    const scoredHistory = quiz.history.filter(
      (h): h is typeof h & { scorePercentage: number } => typeof h.scorePercentage === "number"
    );
    if (scoredHistory.length >= QUIZ_REPEATED_LOW_MIN_ATTEMPTS) {
      const lowAttempts = scoredHistory.filter((h) => h.scorePercentage < PROFICIENT_THRESHOLD);
      if (lowAttempts.length / scoredHistory.length >= QUIZ_REPEATED_LOW_MAJORITY_RATIO) {
        const avgLow = lowAttempts.reduce((s, h) => s + h.scorePercentage, 0) / lowAttempts.length;
        signals.push({
          type: "QUIZ_REPEATED_LOW_PERFORMANCE",
          severity: severityFromScore(avgLow),
          source: "quiz",
          evidence: `${lowAttempts.length} of ${scoredHistory.length} scored quiz attempts are below ${PROFICIENT_THRESHOLD}% (average of low attempts: ${avgLow.toFixed(1)}%).`,
        });
      }
    }

    if (
      typeof quiz.bestScorePercentage === "number" &&
      typeof quiz.latestScorePercentage === "number" &&
      quiz.bestScorePercentage - quiz.latestScorePercentage >= QUIZ_LATEST_BELOW_BEST_GAP
    ) {
      const gap = quiz.bestScorePercentage - quiz.latestScorePercentage;
      signals.push({
        type: "QUIZ_LATEST_BELOW_BEST",
        severity: gap >= QUIZ_LATEST_BELOW_BEST_SEVERE_GAP ? "high" : "medium",
        source: "quiz",
        evidence: `Latest score (${quiz.latestScorePercentage}%) is ${gap.toFixed(1)} points below the best recorded score (${quiz.bestScorePercentage}%).`,
      });
    }

    if (quiz.trend === "declining") {
      signals.push({
        type: "QUIZ_DECLINING_TREND",
        severity: "medium",
        source: "quiz",
        evidence: `Quiz score trend (first vs latest scored attempt) is declining.`,
      });
    }

    if (
      quiz.attemptCount >= QUIZ_MULTIPLE_ATTEMPTS_MIN &&
      typeof quiz.bestScorePercentage === "number" &&
      quiz.bestScorePercentage < PROFICIENT_THRESHOLD
    ) {
      signals.push({
        type: "QUIZ_MULTIPLE_ATTEMPTS_NO_PROFICIENCY",
        severity: severityFromScore(quiz.bestScorePercentage),
        source: "quiz",
        evidence: `${quiz.attemptCount} quiz attempts recorded, but the best score (${quiz.bestScorePercentage}%) never reached the Proficient threshold (${PROFICIENT_THRESHOLD}%).`,
      });
    }

    if (
      typeof quiz.bestScorePercentage === "number" &&
      quiz.bestScorePercentage >= QUIZ_RECENT_FAILURE_PRIOR_BEST_MIN &&
      typeof quiz.latestScorePercentage === "number" &&
      quiz.latestScorePercentage < QUIZ_RECENT_FAILURE_LATEST_MAX
    ) {
      signals.push({
        type: "QUIZ_RECENT_FAILURE_AFTER_STRONG_PERFORMANCE",
        severity: "high",
        source: "quiz",
        evidence: `Previously scored as high as ${quiz.bestScorePercentage}%, but the latest attempt dropped to ${quiz.latestScorePercentage}%.`,
      });
    }
  }

  // --- Retention (reuses existing active-recall rule, no new algorithm) ---
  if (quiz.attemptCount > 0 && state.revision.activeRecallEligible) {
    signals.push({
      type: "RETENTION_RISK_ACTIVE_RECALL_DUE",
      severity: "low",
      source: "quiz",
      evidence: `A previously qualifying quiz attempt (>=70%, on ${state.revision.latestQualifyingAttemptAt ?? "unknown date"}) is now due for active recall per the existing revision-reminder rule.`,
    });
  }

  // --- Engagement (time/visits are exposure signals only) ---
  const { visits, contentEngagement } = state;
  const hasEngagementEvidence = visits.totalVisits > 0 || contentEngagement.blocks.length > 0;

  if (contentEngagement.totalActiveSeconds > 0) {
    const idleRatio = contentEngagement.totalIdleSeconds / contentEngagement.totalActiveSeconds;
    if (idleRatio > ENGAGEMENT_IDLE_RATIO_THRESHOLD) {
      signals.push({
        type: "ENGAGEMENT_HIGH_IDLE_RATIO",
        severity: "medium",
        source: "engagement",
        evidence: `Content-block idle time is ${(idleRatio * 100).toFixed(0)}% of active time, above the ${ENGAGEMENT_IDLE_RATIO_THRESHOLD}x threshold. This indicates reduced attention, not necessarily poor understanding.`,
      });
    }
  }

  if (
    visits.totalVisits >= ENGAGEMENT_REPEATED_VISITS_MIN &&
    mastery &&
    typeof mastery.score === "number" &&
    mastery.score < ENGAGEMENT_REPEATED_VISITS_MASTERY_MAX
  ) {
    signals.push({
      type: "ENGAGEMENT_REPEATED_VISITS_LOW_MASTERY",
      severity: "medium",
      source: "engagement",
      evidence: `${visits.totalVisits} visits recorded, but mastery remains at ${mastery.score} (below ${ENGAGEMENT_REPEATED_VISITS_MASTERY_MAX}). Repeated exposure has not translated into measured progress.`,
    });
  }

  const timedBlocks = contentEngagement.blocks.filter(
    (b): b is typeof b & { recommendedTimeSeconds: number } =>
      typeof b.recommendedTimeSeconds === "number" && b.recommendedTimeSeconds > 0
  );
  if (timedBlocks.length > 0) {
    const sumActive = timedBlocks.reduce((s, b) => s + b.activeSeconds, 0);
    const sumRecommended = timedBlocks.reduce((s, b) => s + b.recommendedTimeSeconds, 0);
    if (sumRecommended > 0) {
      const ratio = sumActive / sumRecommended;
      const noImprovement = quiz.attemptCount === 0 || quiz.trend !== "improving";
      if (ratio > ENGAGEMENT_TIME_NO_IMPROVEMENT_RATIO && noImprovement) {
        signals.push({
          type: "ENGAGEMENT_HIGH_TIME_NO_IMPROVEMENT",
          severity: "low",
          source: "engagement",
          evidence: `Active time on timed content blocks is ${ratio.toFixed(1)}x the combined recommended time, with ${quiz.attemptCount === 0 ? "no quiz evidence" : `a "${quiz.trend}" quiz trend`} to indicate the extra time is paying off. Time is an exposure signal, not proof of understanding.`,
        });
      }
    }
  }

  // --- Prerequisites ---
  const prerequisiteEvidence: RoadblockEvidence["prerequisiteEvidence"] = state.prerequisites.prerequisiteDetails.map(
    (prereq) => {
      const scores = prereq.masteryBySubmission
        .map((m) => m.score)
        .filter((s): s is number => typeof s === "number");
      if (scores.length === 0) {
        return { loId: prereq.loId, title: prereq.title, evidenceStatus: "unavailable", bestKnownScore: null };
      }
      const bestKnownScore = Math.max(...scores);
      return {
        loId: prereq.loId,
        title: prereq.title,
        evidenceStatus: bestKnownScore < PROFICIENT_THRESHOLD ? "concerning" : "healthy",
        bestKnownScore,
      };
    }
  );

  for (const prereq of prerequisiteEvidence) {
    if (prereq.evidenceStatus === "concerning" && typeof prereq.bestKnownScore === "number") {
      signals.push({
        type: "PREREQUISITE_LOW_MASTERY",
        severity: severityFromScore(prereq.bestKnownScore),
        source: "prerequisites",
        relatedLoId: prereq.loId,
        evidence: `Prerequisite "${prereq.title ?? prereq.loId}" has a best known mastery of ${prereq.bestKnownScore}, below the Proficient threshold (${PROFICIENT_THRESHOLD}).`,
      });
    }
  }

  const currentWeak =
    (mastery && typeof mastery.score === "number" && mastery.score < BEGINNER_THRESHOLD) ||
    (loMastery && typeof loMastery.score === "number" && loMastery.score < BEGINNER_THRESHOLD);
  const strongPrereqs = prerequisiteEvidence.filter(
    (p) => p.evidenceStatus === "healthy" && typeof p.bestKnownScore === "number" && p.bestKnownScore >= PROFICIENT_THRESHOLD
  );
  if (currentWeak && strongPrereqs.length > 0) {
    signals.push({
      type: "PREREQUISITE_CURRENT_WEAK_PREREQ_STRONG",
      severity: "medium",
      source: "prerequisites",
      evidence: `Current LO mastery is weak (below ${BEGINNER_THRESHOLD}) despite apparently strong mastery on prerequisite(s): ${strongPrereqs
        .map((p) => `${p.title ?? p.loId} (${p.bestKnownScore})`)
        .join(", ")}. This suggests the difficulty may be specific to this LO rather than a prerequisite gap.`,
    });
  }

  // --- Feynman (only if an actual Feynman attempt exists) ---
  const { feynman } = state;
  if (feynman && typeof feynman.score === "number") {
    if (feynman.score < PROFICIENT_THRESHOLD) {
      signals.push({
        type: "FEYNMAN_LOW_SCORE",
        severity: severityFromScore(feynman.score),
        source: "feynman",
        evidence: `Feynman explanation score is ${feynman.score}, below the Proficient threshold (${PROFICIENT_THRESHOLD}).`,
      });
    }

    const quizGap =
      typeof quiz.bestScorePercentage === "number" ? quiz.bestScorePercentage - feynman.score : null;
    const masteryGap = mastery && typeof mastery.score === "number" ? mastery.score - feynman.score : null;
    const maxGap = Math.max(quizGap ?? -Infinity, masteryGap ?? -Infinity);

    if (maxGap >= FEYNMAN_MISMATCH_GAP) {
      const source = (quizGap ?? -Infinity) >= (masteryGap ?? -Infinity) ? "quiz" : "mastery";
      signals.push({
        type: "FEYNMAN_MISMATCH_WITH_PERFORMANCE",
        severity: "medium",
        source: "feynman",
        evidence: `Feynman score (${feynman.score}) is ${maxGap.toFixed(1)} points below the student's ${source} score, which may indicate surface-level performance without deeper conceptual understanding.`,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    studentId: state.studentId,
    submissionId: state.submissionId,
    hasPotentialRoadblock: signals.length > 0,
    signals,
    evidenceAvailability: {
      mastery: mastery !== null,
      quiz: quiz.attemptCount > 0,
      engagement: hasEngagementEvidence,
      prerequisites: prerequisiteEvidence.some((p) => p.evidenceStatus !== "unavailable"),
      feynman: feynman !== null,
    },
    prerequisiteEvidence,
  };
}
