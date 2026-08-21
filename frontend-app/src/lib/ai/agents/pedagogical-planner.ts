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

import { getGroqChat } from "@/lib/ai/model";
import { PEDAGOGICAL_PLANNER_PROMPT } from "@/lib/ai/prompts";
import { PedagogicalPlanSchema, type Diagnosis, type PedagogicalPlan } from "@/lib/ai/output-schemas";
import { toTextContent, parseAndValidateJsonObject } from "@/lib/ai/structuredOutputFallback";
import type { StudentLearningState } from "@/lib/adaptive/studentLearningState";
import type { RoadblockEvidence } from "@/lib/adaptive/roadblockEvidence";
import type { PlannerContext, PlannerTargetLo, PlannerTargetSubmission } from "@/lib/adaptive/plannerContext";
import { formatStateSummary, formatRoadblockSummary } from "@/lib/ai/agents/diagnostic-agent";

export interface PlannerResult {
  plan: PedagogicalPlan;
  /** Code-level corrections applied after the LLM responded (empty if none were needed). */
  groundingNotes: string[];
}

/* ── Format helpers ──────────────────────────────────────────────────── */

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
    },
    groundingNotes: [],
  };
}

/* ── Post-LLM grounding validation ──────────────────────────────────── */

function sanitizePlan(raw: PedagogicalPlan, context: PlannerContext): PlannerResult {
  const notes: string[] = [];
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

  return {
    plan: { ...raw, action, targetLoId, targetSubmissionId, targetDeliveryTypeId },
    groundingNotes: notes,
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

  // Bounded, highly-grounded structured task: use the smaller 20b model to
  // reduce TPM pressure while retaining more reasoning capacity than 8b.
  // maxTokens maps to Groq's max_completion_tokens, which covers this
  // reasoning model's hidden reasoning tokens as well as the final JSON —
  // 900 was getting exhausted by reasoning before the structured output
  // completed (json_validate_failed: max completion tokens reached).
  const model = getGroqChat({ model: "openai/gpt-oss-20b", temperature: 0.2, maxTokens: 2500 });

  const prompt = await PEDAGOGICAL_PLANNER_PROMPT.formatMessages({
    stateSummary: formatStateSummary(state),
    roadblockSummary: formatRoadblockSummary(evidence),
    diagnosisSummary: formatDiagnosisSummary(diagnosis),
    availableTargets: formatAvailableTargets(context),
  });

  // Same layered fallback as diagnostic-agent.ts / learning-router.ts:
  // gpt-oss-20b is unreliable with Groq's default native "jsonSchema" mode
  // for this schema. Try functionCalling (different decode path) first,
  // then plain invocation + manual JSON extraction + Zod safeParse, before
  // falling back to the existing deterministic CONTINUE result.
  let rawPlan: PedagogicalPlan | null = null;
  try {
    const structuredModel = model.withStructuredOutput(PedagogicalPlanSchema, { method: "functionCalling" });
    rawPlan = await structuredModel.invoke(prompt);
  } catch (functionCallingError) {
    console.warn(
      "[pedagogical-planner] functionCalling structured output failed, falling back to plain-text JSON parsing:",
      functionCallingError
    );
    try {
      const raw = await model.invoke(prompt);
      const text = toTextContent(raw.content);
      rawPlan = parseAndValidateJsonObject(text, PedagogicalPlanSchema);
    } catch (parseError) {
      console.error("[pedagogical-planner] Plain-text JSON fallback also failed:", parseError);
    }
  }

  if (rawPlan) {
    return sanitizePlan(rawPlan, context);
  }

  return {
    plan: {
      action: "CONTINUE",
      targetLoId: null,
      targetSubmissionId: null,
      targetDeliveryTypeId: null,
      reason: "The planning model was unavailable; defaulting to a safe, non-committal action.",
      confidence: 0.3,
      supportingSignals: [],
      alternativesConsidered: [],
    },
    groundingNotes: ["Planner LLM unavailable; this is a deterministic fallback (CONTINUE), not a reasoned plan."],
  };
}
