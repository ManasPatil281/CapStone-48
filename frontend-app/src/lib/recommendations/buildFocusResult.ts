/**
 * Shared "run the full pipeline for one submission and translate it for a
 * student" helper.
 *
 * Used by BOTH:
 * - src/app/recommendations/page.tsx (server-side, for the single
 *   auto-analyzed top candidate on page load), and
 * - src/app/api/ai/recommend-action/route.ts (for the on-demand
 *   "Analyze this" action on secondary roadblock candidates),
 *
 * so the translation logic only exists once. This function does NOT decide
 * which submission to analyze — the caller picks the submissionId.
 *
 * Pipeline (unchanged, reused as-is):
 *   StudentLearningState -> RoadblockEvidence -> Diagnosis -> PlannerContext -> PedagogicalPlan -> resolvePlanAction
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildStudentLearningState, type StudentLearningState } from "@/lib/adaptive/studentLearningState";
import { extractRoadblockEvidence, type RoadblockEvidence } from "@/lib/adaptive/roadblockEvidence";
import { diagnoseRoadblock } from "@/lib/ai/agents/diagnostic-agent";
import { buildPlannerContext } from "@/lib/adaptive/plannerContext";
import { planPedagogicalAction } from "@/lib/ai/agents/pedagogical-planner";
import {
  resolvePlanAction,
  describeActionDetail,
  describeSignalForStudent,
  computeSuppressedLoIds,
} from "./translateForStudent";
import type { Diagnosis, PedagogicalPlan } from "@/lib/ai/output-schemas";

const MAX_EVIDENCE_BULLETS = 3;

export interface FocusResult {
  submissionId: string;
  submissionTitle: string;
  learningObjectId: string | null;
  learningObjectTitle: string;
  courseTitle: string;
  masteryScore: number | null;
  masteryLevel: string | null;
  hasRoadblock: boolean;
  /** Plain-language translation of the top RoadblockEvidence signals — presentation layer only, never LLM-generated. */
  evidenceBullets: string[];
  /** The same signals' raw, precise RoadblockEvidence text (exact numbers), for an optional "Details" disclosure. */
  evidenceDetails: string[];
  /**
   * Raw agent output, kept exactly as the Diagnostic Agent / Pedagogical
   * Planner produced it. `diagnosis.studentSummary` and `plan.studentReason`
   * are already written in second person directly by the agents (schema-
   * native fields) and are safe to render to a student as-is — no
   * translation/transform step. The other fields (`primaryDiagnosis`,
   * `explanation`, `reason`, `evidence`, `confidence`, etc.) remain
   * internal/debug-only and should not be shown to students. See docs §27.14.
   */
  diagnosis: Diagnosis;
  plan: PedagogicalPlan;
  actionLabel: string;
  actionDetail: string | null;
  actionHref: string | null;
  opensRemediation: boolean;
  /**
   * LO ids that lower-priority sections on /recommendations should not
   * present as "ready to explore next" — see translateForStudent.ts's
   * computeSuppressedLoIds() for the exact rule.
   */
  suppressedLoIds: string[];
  /**
   * The actual submission/LO this action points the student at (whatever
   * the action — prerequisite, alternative, postrequisite, or the current
   * submission itself), so lower-priority sections can generically avoid
   * showing the exact same target again. null when the action has no
   * navigable target (REMEDIATE, NO_ACTION). See docs §27.11.
   */
  focusTargetSubmissionId: string | null;
  focusTargetLoId: string | null;
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Same as buildFocusResult(), but for a caller that already built the
 * StudentLearningState + RoadblockEvidence (e.g. src/lib/adaptive/candidateSubmissions.ts's
 * ranking pass) — avoids re-running buildStudentLearningState a second time
 * for the same submission.
 */
export async function buildFocusResultFromState(
  state: StudentLearningState,
  evidence: RoadblockEvidence
): Promise<FocusResult> {
  const submissionId = state.submissionId;
  const diagnosis = await diagnoseRoadblock(state, evidence);
  const context = await buildPlannerContext(state);
  const plannerResult = await planPedagogicalAction(state, evidence, diagnosis, context);

  const supabase = createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const [{ data: submissionRow }, resolvedAction] = await Promise.all([
    supabaseAny.from("teacher_lo_submission").select("title").eq("id", submissionId).maybeSingle(),
    resolvePlanAction({ supabaseAny, plan: plannerResult.plan, context, focusState: state }),
  ]);

  const topSignals = [...evidence.signals]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, MAX_EVIDENCE_BULLETS);

  const evidenceBullets = topSignals.map((s) => describeSignalForStudent(s, state));
  const evidenceDetails = topSignals.map((s) => s.evidence);

  const suppressedLoIds = computeSuppressedLoIds({
    focusLoId: state.learningObject?.id ?? null,
    action: plannerResult.plan.action,
    targetLoId: plannerResult.plan.targetLoId,
    context,
  });

  return {
    submissionId,
    submissionTitle: (submissionRow?.title as string | null)?.trim() || "Untitled submission",
    learningObjectId: state.learningObject?.id ?? null,
    learningObjectTitle: state.learningObject?.title ?? "Untitled topic",
    courseTitle: state.course?.title ?? "",
    masteryScore: state.mastery?.score ?? null,
    masteryLevel: state.mastery?.level ?? null,
    hasRoadblock: evidence.hasPotentialRoadblock,
    evidenceBullets,
    evidenceDetails,
    diagnosis,
    plan: plannerResult.plan,
    actionLabel: resolvedAction.label,
    actionDetail: describeActionDetail(plannerResult.plan.action),
    actionHref: resolvedAction.href,
    opensRemediation: resolvedAction.opensRemediation,
    suppressedLoIds,
    // Generic cross-section suppression target — see FocusResult's doc
    // comment and docs §27.11. targetLoId is only ever non-null on the plan
    // for ADVANCE/REVISIT_PREREQUISITE (sanitizePlan nulls it for every
    // other action), so this naturally stays empty when not meaningful.
    focusTargetSubmissionId: resolvedAction.targetSubmissionId,
    focusTargetLoId: plannerResult.plan.targetLoId,
  };
}

export async function buildFocusResult(studentId: string, submissionId: string): Promise<FocusResult | null> {
  const state = await buildStudentLearningState(studentId, submissionId);
  if (!state) return null;
  const evidence = extractRoadblockEvidence(state);
  return buildFocusResultFromState(state, evidence);
}
