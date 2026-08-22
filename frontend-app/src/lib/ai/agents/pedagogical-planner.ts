/**
 * Pedagogical Planner.
 *
 * Fourth layer of the adaptive pipeline:
 *
 *   StudentLearningState -> RoadblockEvidence -> Diagnosis -> Pedagogical Planner
 *
 * The planner does NOT diagnose again. It decides the single best next
 * pedagogical action from a bounded action set, using the Student Learning
 * State and RoadblockEvidence as the source of factual truth and the
 * Diagnosis as an interpretive hint only (its free-text fields are never
 * treated as new facts).
 *
 * It sits above existing specialist agents as an orchestration/decision
 * layer and does not replace or invoke them (REMEDIATE -> remediation-agent.ts,
 * FEYNMAN_CHECK -> feynman-coach.ts, ACTIVE_RECALL -> spaced-repetition flow,
 * etc. remain separate, unmodified, and are not wired up by this task).
 *
 * Grounding is enforced in two layers:
 * 1. The planner is never given raw database access — buildPlannerContext()
 *    (src/lib/adaptive/plannerContext.ts) deterministically prepares bounded
 *    candidate target lists first.
 * 2. After the LLM responds, its target ids are validated against those same
 *    candidate lists; any id that isn't present is stripped and the action
 *    is safely downgraded, with the correction recorded in `groundingNotes`.
 *
 * Does not write to the database. Does not change recommendations, mastery,
 * or tracking.
 */

import { getGeminiChat } from "@/lib/ai/model";
import { PEDAGOGICAL_PLANNER_PROMPT } from "@/lib/ai/prompts";
import { PedagogicalPlanSchema, type Diagnosis, type PedagogicalPlan } from "@/lib/ai/output-schemas";
import { isRateLimitError } from "@/lib/ai/structuredOutputFallback";
import type { StudentLearningState } from "@/lib/adaptive/studentLearningState";
import type { RoadblockEvidence, RoadblockSignal } from "@/lib/adaptive/roadblockEvidence";
import type { PlannerContext, PlannerTargetLo, PlannerTargetSubmission } from "@/lib/adaptive/plannerContext";
import { formatRoadblockSummary } from "@/lib/ai/agents/diagnostic-agent";

export interface PlannerResult {
  plan: PedagogicalPlan;
  /** Code-level corrections applied after the LLM responded (empty if none were needed). */
  groundingNotes: string[];
}

/* ── Format helpers ──────────────────────────────────────────────────── */

/**
 * Deliberately minimal — the planner does NOT need the full
 * StudentLearningState repeated. RoadblockEvidence (the actual decision
 * evidence) and the Diagnosis (interpretation) are already passed in full;
 * this is just enough to let the planner name the topic naturally in its
 * `reason` text. Re-sending the entire state summary here was found to be
 * the single largest source of duplicated tokens between the Diagnostic
 * Agent and Planner prompts (see ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md).
 */
function formatMinimalContext(state: StudentLearningState): string {
  return [
    `Topic: ${state.learningObject?.title ?? "unknown"} (${state.course?.title ?? "unknown course"})`,
    `Current submission mastery: ${state.mastery?.score ?? "no evidence"} (${state.mastery?.level ?? "n/a"})`,
  ].join("\n");
}

function formatTargetLoList(targets: PlannerTargetLo[]): string {
  if (targets.length === 0) return "  (none available)";
  return targets
    .map((t) => {
      const subs =
        t.submissions.length === 0
          ? "no approved submission with mastery evidence"
          : t.submissions
              .map(
                (s) =>
                  `submissionId=${s.submissionId} ("${s.submissionTitle ?? "untitled"}", teacher=${s.teacherName ?? "unknown"}, mastery=${
                    s.score ?? "no evidence"
                  })`
              )
              .join("; ");
      return `  - loId=${t.loId} ("${t.title ?? "untitled"}"): ${subs}`;
    })
    .join("\n");
}

function formatSubmissionList(subs: PlannerTargetSubmission[]): string {
  if (subs.length === 0) return "  (none available)";
  return subs
    .map(
      (s) =>
        `  - submissionId=${s.submissionId} ("${s.submissionTitle ?? "untitled"}", teacher=${s.teacherName ?? "unknown"}, mastery=${
          s.score ?? "no evidence"
        })`
    )
    .join("\n");
}

function formatDiagnosisSummary(diagnosis: Diagnosis): string {
  return [
    `hasRoadblock: ${diagnosis.hasRoadblock}`,
    `diagnosisType: ${diagnosis.diagnosisType}`,
    `confidence: ${diagnosis.confidence}`,
    `primaryDiagnosis: ${diagnosis.primaryDiagnosis}`,
    diagnosis.evidenceLimitations.length > 0
      ? `evidenceLimitations: ${diagnosis.evidenceLimitations.join("; ")}`
      : "evidenceLimitations: none reported",
  ].join("\n");
}

function formatAvailableTargets(context: PlannerContext): string {
  return [
    "Alternative approved submissions of the CURRENT LO (for TRY_DIFFERENT_METHOD targetSubmissionId):",
    formatSubmissionList(context.currentSubmissionAlternatives),
    "",
    "Delivery types offered by the CURRENT submission (for TRY_DIFFERENT_METHOD targetDeliveryTypeId):",
    context.currentSubmissionDeliveryOptions.length === 0
      ? "  (none available)"
      : context.currentSubmissionDeliveryOptions
          .map((d) => `  - deliveryTypeId=${d.deliveryTypeId} ("${d.deliveryTypeName ?? "unnamed"}")`)
          .join("\n"),
    "",
    "Prerequisite LOs of the current submission (for REVISIT_PREREQUISITE targetLoId/targetSubmissionId):",
    formatTargetLoList(context.prerequisiteTargets),
    "",
    "Postrequisite LOs of the current submission (for ADVANCE targetLoId/targetSubmissionId):",
    formatTargetLoList(context.postrequisiteTargets),
  ].join("\n");
}

/* ── Deterministic short-circuit (no roadblock) ─────────────────────────
 * Mirrors the pre-filter pattern in struggle-detector.ts / diagnostic-agent.ts:
 * gated on the freshly-computed evidence.hasPotentialRoadblock, NOT on the
 * (potentially client-influenced) diagnosis, so this safe path can't be
 * spoofed by a forged diagnosis payload.
 */
function deterministicHealthyPlan(context: PlannerContext): PlannerResult {
  const firstTarget = context.postrequisiteTargets.find((t) => t.submissions.length > 0);

  if (firstTarget) {
    return {
      plan: {
        action: "ADVANCE",
        targetLoId: firstTarget.loId,
        targetSubmissionId: firstTarget.submissions[0].submissionId,
        targetDeliveryTypeId: null,
        reason: `No deterministic roadblock was detected, and an approved postrequisite ("${firstTarget.title ?? firstTarget.loId}") is available, so advancing is the default next step.`,
        confidence: 1,
        supportingSignals: [],
        alternativesConsidered: [],
        studentReason: "You're in good shape here — it looks like a good time to move on to the next topic.",
      },
      groundingNotes: [],
    };
  }

  return {
    plan: {
      action: "NO_ACTION",
      targetLoId: null,
      targetSubmissionId: null,
      targetDeliveryTypeId: null,
      reason: "No deterministic roadblock was detected and no approved postrequisite is currently available to advance to.",
      confidence: 1,
      supportingSignals: [],
      alternativesConsidered: [],
      studentReason: "You're doing fine here — keep going with your current plan.",
    },
    groundingNotes: [],
  };
}

/* ── Post-LLM grounding validation ──────────────────────────────────── */

/**
 * Safe, generic studentReason text to substitute when grounding validation
 * downgrades the LLM's chosen action below. studentReason is shown verbatim
 * to students (unlike `reason`, which stays internal-only), so it must never
 * be left referencing an action that is no longer the one being taken.
 */
const SAFE_STUDENT_REASON_ON_DOWNGRADE: Partial<Record<PedagogicalPlan["action"], string>> = {
  CONTINUE: "Continuing to work through this a bit more is a good next step for now.",
  NO_ACTION: "You're doing fine here — keep going with your current plan.",
};

function sanitizePlan(raw: PedagogicalPlan, context: PlannerContext): PlannerResult {
  const notes: string[] = [];
  const originalAction = raw.action;
  let { action, targetLoId, targetSubmissionId, targetDeliveryTypeId } = raw;

  const prereqLoIds = new Set(context.prerequisiteTargets.map((t) => t.loId));
  const postreqLoIds = new Set(context.postrequisiteTargets.map((t) => t.loId));
  const altSubmissionIds = new Set(context.currentSubmissionAlternatives.map((s) => s.submissionId));
  const deliveryTypeIds = new Set(context.currentSubmissionDeliveryOptions.map((d) => d.deliveryTypeId));

  const validSubmissionForLo = (loId: string | null, submissionId: string | null, pool: PlannerTargetLo[]) => {
    if (!loId || !submissionId) return false;
    return pool.find((t) => t.loId === loId)?.submissions.some((s) => s.submissionId === submissionId) ?? false;
  };

  if (action === "REVISIT_PREREQUISITE") {
    if (!targetLoId || !prereqLoIds.has(targetLoId)) {
      notes.push(
        "Planner proposed REVISIT_PREREQUISITE without a valid prerequisite target from the available list; downgraded to CONTINUE."
      );
      action = "CONTINUE";
      targetLoId = null;
      targetSubmissionId = null;
    } else if (targetSubmissionId && !validSubmissionForLo(targetLoId, targetSubmissionId, context.prerequisiteTargets)) {
      notes.push("Proposed prerequisite submission id was not in the available list; cleared.");
      targetSubmissionId = null;
    }
  } else if (action === "ADVANCE") {
    if (targetLoId && !postreqLoIds.has(targetLoId)) {
      notes.push("Proposed ADVANCE target was not an available postrequisite; target cleared.");
      targetLoId = null;
      targetSubmissionId = null;
    } else if (targetLoId && targetSubmissionId && !validSubmissionForLo(targetLoId, targetSubmissionId, context.postrequisiteTargets)) {
      notes.push("Proposed postrequisite submission id was not in the available list; cleared.");
      targetSubmissionId = null;
    }
    if (!targetLoId) {
      if (postreqLoIds.size === 0) {
        notes.push("No postrequisite target is available; downgraded ADVANCE to NO_ACTION.");
        action = "NO_ACTION";
      } else {
        notes.push("ADVANCE was chosen without a valid targetLoId despite postrequisites being available; downgraded to CONTINUE.");
        action = "CONTINUE";
      }
    }
  } else if (action === "TRY_DIFFERENT_METHOD") {
    const validSubmission = !!targetSubmissionId && altSubmissionIds.has(targetSubmissionId);
    const validDelivery = !!targetDeliveryTypeId && deliveryTypeIds.has(targetDeliveryTypeId);
    if (targetSubmissionId && !validSubmission) {
      notes.push("Proposed alternative submission id was not in the available list; cleared.");
      targetSubmissionId = null;
    }
    if (targetDeliveryTypeId && !validDelivery) {
      notes.push("Proposed delivery type id was not in the available list; cleared.");
      targetDeliveryTypeId = null;
    }
    targetLoId = null;
    if (!targetSubmissionId && !targetDeliveryTypeId) {
      notes.push("No valid alternative submission or delivery type available; downgraded TRY_DIFFERENT_METHOD to CONTINUE.");
      action = "CONTINUE";
    }
  } else {
    // Actions without targets: defensively clear any hallucinated target ids.
    if (targetLoId || targetSubmissionId || targetDeliveryTypeId) {
      notes.push(`${action} does not take a target; hallucinated target id(s) cleared.`);
    }
    targetLoId = null;
    targetSubmissionId = null;
    targetDeliveryTypeId = null;
  }

  const studentReason =
    action !== originalAction ? SAFE_STUDENT_REASON_ON_DOWNGRADE[action] ?? raw.studentReason : raw.studentReason;

  return {
    plan: { ...raw, action, targetLoId, targetSubmissionId, targetDeliveryTypeId, studentReason },
    groundingNotes: notes,
  };
}

/* ── Deterministic grounded fallback (LLM unavailable) ───────────────────
 * Used only when both the functionCalling and plain-JSON LLM attempts fail
 * (including rate-limiting). Uses ONLY RoadblockEvidence signals + the
 * already-validated PlannerContext candidate lists — never re-derives or
 * guesses new evidence, and never picks a target that wasn't already a
 * validated candidate. Deliberately covers only a few obvious, safely
 * gradeable cases; it does not attempt to recreate the full LLM planner.
 *
 * Student-facing `reason` text is always grounded in the actual matched
 * signal's own evidence string — it must never say things like "the
 * planning model was unavailable"; that technical detail belongs in
 * console logs at the call site only.
 */
const RETENTION_SIGNAL_TYPES = new Set<RoadblockSignal["type"]>([
  "QUIZ_RECENT_FAILURE_AFTER_STRONG_PERFORMANCE",
  "RETENTION_RISK_ACTIVE_RECALL_DUE",
  "QUIZ_DECLINING_TREND",
  "QUIZ_LATEST_BELOW_BEST",
]);

const PRACTISE_SIGNAL_TYPES = new Set<RoadblockSignal["type"]>([
  "QUIZ_MULTIPLE_ATTEMPTS_NO_PROFICIENCY",
  "QUIZ_REPEATED_LOW_PERFORMANCE",
]);

function deterministicGroundedFallback(evidence: RoadblockEvidence, context: PlannerContext): PlannerResult {
  const groundingNotes = [
    "Planner LLM unavailable after structured-output and rate-limit-aware retries; used a conservative deterministic fallback grounded only in RoadblockEvidence + validated targets. See server logs for the technical cause.",
  ];

  const prereqSignal = evidence.signals.find((s) => s.type === "PREREQUISITE_LOW_MASTERY" && s.relatedLoId);
  if (prereqSignal?.relatedLoId) {
    const target = context.prerequisiteTargets.find(
      (t) => t.loId === prereqSignal.relatedLoId && t.submissions.length > 0
    );
    if (target) {
      return {
        plan: {
          action: "REVISIT_PREREQUISITE",
          targetLoId: target.loId,
          targetSubmissionId: target.submissions[0].submissionId,
          targetDeliveryTypeId: null,
          reason: `${prereqSignal.evidence} Reviewing this prerequisite is a safe next step.`,
          confidence: 0.55,
          supportingSignals: [prereqSignal.type],
          alternativesConsidered: [],
          studentReason: `Your mastery of ${target.title ?? "this prerequisite"} looks low, so reviewing it first should make this topic easier to build on.`,
        },
        groundingNotes,
      };
    }
  }

  const retentionSignal = evidence.signals.find((s) => RETENTION_SIGNAL_TYPES.has(s.type));
  if (retentionSignal) {
    return {
      plan: {
        action: "ACTIVE_RECALL",
        targetLoId: null,
        targetSubmissionId: null,
        targetDeliveryTypeId: null,
        reason: `${retentionSignal.evidence} A quick recall check on this material is a safe next step.`,
        confidence: 0.5,
        supportingSignals: [retentionSignal.type],
        alternativesConsidered: [],
        studentReason: "You've done well on this before — a quick recall check now should help make sure it's still solid.",
      },
      groundingNotes,
    };
  }

  const practiseSignal = evidence.signals.find((s) => PRACTISE_SIGNAL_TYPES.has(s.type));
  if (practiseSignal) {
    return {
      plan: {
        action: "PRACTISE",
        targetLoId: null,
        targetSubmissionId: null,
        targetDeliveryTypeId: null,
        reason: `${practiseSignal.evidence} Some extra practice on this material is a safe next step.`,
        confidence: 0.5,
        supportingSignals: [practiseSignal.type],
        alternativesConsidered: [],
        studentReason: "A bit more practice on this should help it stick before moving on.",
      },
      groundingNotes,
    };
  }

  const topSignal = [...evidence.signals].sort((a, b) => {
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity];
  })[0];

  return {
    plan: {
      action: "CONTINUE",
      targetLoId: null,
      targetSubmissionId: null,
      targetDeliveryTypeId: null,
      reason: topSignal
        ? `${topSignal.evidence} Continuing to work through this material is a safe next step.`
        : "Continuing to work through this material is a safe next step.",
      confidence: 0.4,
      supportingSignals: topSignal ? [topSignal.type] : [],
      alternativesConsidered: [],
      studentReason: "Continuing to work through this a bit more is a good next step while more evidence builds up.",
    },
    groundingNotes,
  };
}

/* ── Public API ──────────────────────────────────────────────────────── */

export async function planPedagogicalAction(
  state: StudentLearningState,
  evidence: RoadblockEvidence,
  diagnosis: Diagnosis,
  context: PlannerContext
): Promise<PlannerResult> {
  if (!evidence.hasPotentialRoadblock) {
    return deterministicHealthyPlan(context);
  }

  // --- TEMPORARY provider test (see docs) ---
  // The Diagnostic Agent stays on Groq openai/gpt-oss-20b, unchanged. Only
  // the Planner is switched to Gemini here, to verify it can reliably do
  // this same grounded structured-planning task without hitting Groq's
  // shared 8k TPM window immediately after diagnosis. This is a single-
  // provider test, NOT the Groq→Gemini→deterministic-fallback routing
  // planned as a future task. Temperature matches the prior Groq call (0.2)
  // as closely as Gemini's equivalent parameter allows.
  //
  // maxOutputTokens raised 2500 -> 4000: a maximal-but-valid PedagogicalPlan
  // (reason + 8 supportingSignals + up to 4 alternativesConsidered) was
  // occasionally getting truncated mid-string on verbose responses
  // (OutputParserException: "Unterminated string in JSON"). Combined with
  // tightening alternativesConsidered to 3 entries and a stronger brevity
  // instruction in the prompt (see PEDAGOGICAL_PLANNER_PROMPT), this keeps
  // the ceiling local to this one call — no other agent's token budget or
  // getGeminiChat()'s own default changed.
  //
  // maxRetries: 1 — ChatGoogleGenerativeAI's own built-in retry support
  // (not a hand-rolled loop) to ride out a single transient failure such as
  // "503 the model is currently experiencing high demand" before falling
  // through to the deterministic fallback below. Capped at 1, not repeated.
  const model = getGeminiChat({ model: "gemini-2.5-flash", temperature: 0.2, maxOutputTokens: 4000, maxRetries: 1 });

  const prompt = await PEDAGOGICAL_PLANNER_PROMPT.formatMessages({
    stateSummary: formatMinimalContext(state),
    roadblockSummary: formatRoadblockSummary(evidence),
    diagnosisSummary: formatDiagnosisSummary(diagnosis),
    availableTargets: formatAvailableTargets(context),
  });

  // Single structured-output attempt only (per the test's explicit scope —
  // no dual functionCalling/plain-JSON retry chain like the Groq path).
  // `withStructuredOutput` still runs the plan through the same Zod
  // `PedagogicalPlanSchema` validation as every other agent in this
  // codebase — malformed Gemini output throws here and is caught below,
  // never returned unvalidated. Any failure (rate limit or otherwise) goes
  // straight to the existing deterministic, evidence-grounded fallback.
  let rawPlan: PedagogicalPlan | null = null;
  try {
    const structuredModel = model.withStructuredOutput(PedagogicalPlanSchema);
    rawPlan = await structuredModel.invoke(prompt);
  } catch (error) {
    if (isRateLimitError(error)) {
      console.error("[pedagogical-planner] Rate limited by Gemini; using the deterministic fallback.", error);
    } else {
      console.error("[pedagogical-planner] Gemini structured output failed; using the deterministic fallback:", error);
    }
  }

  if (rawPlan) {
    return sanitizePlan(rawPlan, context);
  }

  return deterministicGroundedFallback(evidence, context);
}
