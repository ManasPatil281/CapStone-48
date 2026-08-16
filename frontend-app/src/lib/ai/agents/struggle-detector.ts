/**
 * Struggle Detection Agent.
 *
 * Monitors student engagement signals and autonomously decides
 * whether to intervene and what type of intervention to deliver.
 */

import { getGroqChat } from "@/lib/ai/model";
import { STRUGGLE_DETECTION_PROMPT } from "@/lib/ai/prompts";
import { InterventionSchema, type Intervention } from "@/lib/ai/output-schemas";

/* ── Input Types ─────────────────────────────────────────────────────── */

export interface EngagementSignals {
  /** Total active seconds in current session */
  sessionActiveSeconds: number;
  /** Total idle seconds in current session */
  sessionIdleSeconds: number;
  /** Number of visits to this submission */
  totalVisits: number;
  /** Current mastery score (0-100 or null) */
  currentMastery: number | null;
  /** Previous mastery score (to detect stagnation) */
  previousMastery: number | null;
  /** Recent quiz scores (most recent first) */
  recentQuizScores: number[];
  /** Time spent on current content block (seconds) */
  currentBlockTime: number;
  /** Whether the student has attempted a quiz this session */
  hasAttemptedQuiz: boolean;
  /** Idle-to-active ratio for recent sessions */
  recentIdleRatio: number;
}

export interface ContentContext {
  loTitle: string;
  currentBlockTitle: string;
  currentBlockType: string;
  currentBlockText: string;
  submissionTitle: string;
}

/* ── Format Helpers ──────────────────────────────────────────────────── */

function formatEngagementSignals(signals: EngagementSignals): string {
  const parts: string[] = [];

  const idleRatio =
    signals.sessionActiveSeconds > 0
      ? (signals.sessionIdleSeconds / signals.sessionActiveSeconds).toFixed(2)
      : "N/A";

  parts.push(
    `Session: ${signals.sessionActiveSeconds}s active, ${signals.sessionIdleSeconds}s idle (ratio: ${idleRatio})`
  );
  parts.push(`Total visits to this submission: ${signals.totalVisits}`);
  parts.push(
    `Mastery: current ${signals.currentMastery ?? "not calculated"}, previous ${signals.previousMastery ?? "N/A"}`
  );

  if (signals.recentQuizScores.length > 0) {
    parts.push(
      `Quiz scores (recent first): ${signals.recentQuizScores.join(", ")}%`
    );
    if (signals.recentQuizScores.length >= 2) {
      const trend =
        signals.recentQuizScores[0] > signals.recentQuizScores[1]
          ? "improving"
          : signals.recentQuizScores[0] < signals.recentQuizScores[1]
            ? "declining"
            : "stable";
      parts.push(`Quiz trend: ${trend}`);
    }
  } else {
    parts.push("No quiz attempts recorded");
  }

  parts.push(
    `Current block time: ${signals.currentBlockTime}s`
  );
  parts.push(
    `Has attempted quiz this session: ${signals.hasAttemptedQuiz}`
  );
  parts.push(
    `Recent idle ratio: ${signals.recentIdleRatio.toFixed(2)}`
  );

  return parts.join("\n");
}

function formatContentContext(ctx: ContentContext): string {
  return [
    `LO: ${ctx.loTitle}`,
    `Submission: ${ctx.submissionTitle}`,
    `Current block: [${ctx.currentBlockType}] ${ctx.currentBlockTitle}`,
    `Block content excerpt: ${ctx.currentBlockText.slice(0, 300)}`,
  ].join("\n");
}

/* ── Heuristic pre-filter ────────────────────────────────────────────── */

/**
 * Quick heuristic check before invoking the LLM.
 * Returns `true` if the student's signals suggest they might be struggling.
 * This avoids unnecessary LLM calls for clearly engaged students.
 */
function mightBeStruggling(signals: EngagementSignals): boolean {
  // High idle ratio
  if (signals.recentIdleRatio > 1.5) return true;

  // Declining quiz scores
  if (
    signals.recentQuizScores.length >= 2 &&
    signals.recentQuizScores[0] < signals.recentQuizScores[1] - 10
  ) {
    return true;
  }

  // Stagnant mastery
  if (
    signals.currentMastery !== null &&
    signals.previousMastery !== null &&
    signals.totalVisits >= 3 &&
    Math.abs(signals.currentMastery - signals.previousMastery) < 5
  ) {
    return true;
  }

  // Very long time on one block
  if (signals.currentBlockTime > 300 && !signals.hasAttemptedQuiz) {
    return true;
  }

  // Low mastery after multiple visits
  if (
    signals.currentMastery !== null &&
    signals.currentMastery < 40 &&
    signals.totalVisits >= 4
  ) {
    return true;
  }

  return false;
}

/* ── Public API ──────────────────────────────────────────────────────── */

export interface StruggleDetectionInput {
  engagementSignals: EngagementSignals;
  contentContext: ContentContext;
}

/**
 * Check if a student is struggling and generate an appropriate intervention.
 *
 * Uses a heuristic pre-filter to avoid unnecessary LLM calls,
 * then invokes the LLM for nuanced decision-making.
 */
export async function checkForStruggle(
  input: StruggleDetectionInput
): Promise<Intervention> {
  // Quick heuristic check
  if (!mightBeStruggling(input.engagementSignals)) {
    return {
      shouldIntervene: false,
      interventionType: "none",
      content: "",
      reason: "Student appears to be engaged normally.",
    };
  }

  // Use LLM for nuanced decision
  const model = getGroqChat({
    temperature: 0.3,
    maxTokens: 400,
  });

  const structuredModel = model.withStructuredOutput(InterventionSchema);

  const prompt = await STRUGGLE_DETECTION_PROMPT.formatMessages({
    engagementSignals: formatEngagementSignals(input.engagementSignals),
    contentContext: formatContentContext(input.contentContext),
  });

  try {
    const result = await structuredModel.invoke(prompt);
    return result;
  } catch (error) {
    console.error("[struggle-detector] LLM invocation failed:", error);
    // Fallback to heuristic intervention
    return {
      shouldIntervene: true,
      interventionType: "micro_hint",
      content: `It looks like you might be stuck on "${input.contentContext.currentBlockTitle}". Try breaking the concept down into smaller parts, or try the quiz to test your understanding.`,
      reason: "Heuristic fallback due to LLM error.",
    };
  }
}
