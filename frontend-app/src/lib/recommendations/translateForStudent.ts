/**
 * Student-facing translation layer for the Pedagogical Planner's output.
 *
 * This module turns internal technical concepts (diagnosisType enums,
 * planner action names) into short, plain-language student copy, and
 * resolves a PedagogicalPlan's target ids into a real, navigable link.
 *
 * It does NOT decide anything — the action and target ids it renders were
 * already chosen and validated (grounding-checked against real, approved,
 * non-soft-deleted submissions) by the Pedagogical Planner. This layer only
 * ever does one additional lookup: resolving a target submission's course
 * slug so a real route can be built, or picking a resolved-but-unspecified
 * target when the plan left targetSubmissionId null (e.g. the planner named
 * a valid prerequisite LO but didn't pick between two approved submissions
 * for it — this layer deterministically falls back to the first one already
 * present in the planner's own validated candidate list, never inventing one).
 */

import type { Route } from "next";
import type { Diagnosis, PedagogicalPlan } from "@/lib/ai/output-schemas";
import type { PlannerContext } from "@/lib/adaptive/plannerContext";
import type { StudentLearningState } from "@/lib/adaptive/studentLearningState";
import type { RoadblockSignal } from "@/lib/adaptive/roadblockEvidence";

const ACTION_LABELS: Record<PedagogicalPlan["action"], string> = {
  ADVANCE: "Move on to the next topic",
  CONTINUE: "Keep working on this",
  REMEDIATE: "Get a quick concept fix",
  REVISIT_PREREQUISITE: "Review the prerequisite first",
  TRY_DIFFERENT_METHOD: "Try a different explanation",
  ACTIVE_RECALL: "Do a quick recall check",
  FEYNMAN_CHECK: "Explain it in your own words",
  PRACTISE: "Get some practice",
  NO_ACTION: "Keep going as planned",
};

// Deliberately does NOT claim a scientifically-timed interval — the
// underlying activeRecallEligible signal currently uses a same-day
// (ACTIVE_RECALL_DAYS = 0) demo threshold, not real spaced-repetition timing.
// See src/lib/adaptive/studentLearningState.ts.
const ACTION_DESCRIPTIONS: Partial<Record<PedagogicalPlan["action"], string>> = {
  ACTIVE_RECALL: "You scored well on this before — a quick recall check helps make sure it's still solid.",
};

const DIAGNOSIS_LABELS: Record<Diagnosis["diagnosisType"], string> = {
  CONCEPTUAL_DIFFICULTY: "a possible gap in understanding this concept",
  PREREQUISITE_GAP: "a possible gap in an earlier topic this one builds on",
  RETENTION_DIFFICULTY: "signs you may be forgetting something you knew before",
  ENGAGEMENT_DIFFICULTY: "not enough focused practice yet to build a strong signal",
  ASSESSMENT_DIFFICULTY: "inconsistent quiz results that don't clearly point one way",
  SUBMISSION_SPECIFIC_DIFFICULTY: "this particular version of the material, not necessarily the topic itself",
  INSUFFICIENT_EVIDENCE: "not enough evidence yet to say for sure",
  NO_ROADBLOCK_DETECTED: "no roadblock — you're doing fine here",
};

export function describeAction(action: PedagogicalPlan["action"]): string {
  return ACTION_LABELS[action];
}

export function describeActionDetail(action: PedagogicalPlan["action"]): string | null {
  return ACTION_DESCRIPTIONS[action] ?? null;
}

export function describeDiagnosisType(diagnosisType: Diagnosis["diagnosisType"]): string {
  return DIAGNOSIS_LABELS[diagnosisType];
}

/**
 * Deterministic, bounded perspective normalizer for the Diagnostic Agent's
 * and Pedagogical Planner's free-text prose (`Diagnosis.primaryDiagnosis`,
 * `PedagogicalPlan.reason`). Neither agent's prompt/output was changed for
 * this — this only rewrites the already-generated text before it's shown to
 * a student, turning common third-person analytics phrasing ("The student
 * has...", "the student's...", "the learner...") into direct second-person
 * address ("You have...", "your..."), plus subject-verb agreement for the
 * swapped pronoun, and drops one internal jargon token ("LO" -> "topic").
 *
 * Also replaces the singular-"they" pronoun ("they"/"their"/"them"/
 * "themselves") with "you"/"your"/"you"/"yourself". This text is always
 * about exactly one student's own evidence (per both prompts' grounding
 * rules), so a bare "they" here reliably co-refers to "the student"/"the
 * learner" earlier in the same sentence, not to some other plural noun —
 * this is what fixed the reported "You are struggling because they lack
 * mastery..." (the subject "The student" had been swapped to "You", but the
 * later pronoun "they" referring back to it was previously left untouched).
 *
 * This is intentionally NOT a general rewrite/paraphrase — it recognizes a
 * bounded set of literal patterns and leaves anything it doesn't recognize
 * untouched (safe degradation) rather than risking a mangled sentence. No
 * LLM call. The original, unmodified text remains available wherever the
 * raw Diagnosis/PedagogicalPlan objects are still used (e.g. `/debug/learning-state`).
 *
 * RETIRED from /recommendations (see docs §27.14): regex-rewriting arbitrary
 * LLM prose kept surfacing new edge cases it didn't recognize (e.g. "You's
 * difficulty..." from a possessive it wasn't taught). The Diagnostic Agent
 * and Pedagogical Planner now produce dedicated `studentSummary`/
 * `studentReason` fields directly, written in second person by the LLM
 * itself, so there is no longer any third-person prose to rewrite on that
 * page. This function is left defined/exported (unused) rather than deleted,
 * in case a future caller still needs it for other free-text agent output.
 */
const PERSPECTIVE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bThe student's\b/g, "Your"],
  [/\bthe student's\b/g, "your"],
  [/\bStudent's\b/g, "Your"],
  [/\bstudent's\b/g, "your"],
  [/\bThe student\b/g, "You"],
  [/\bthe student\b/g, "you"],
  [/\bThe learner's\b/g, "Your"],
  [/\bthe learner's\b/g, "your"],
  [/\bThe learner\b/g, "You"],
  [/\bthe learner\b/g, "you"],
  // Singular "they" referring back to the student — see doc comment above.
  [/\bThemselves\b/g, "Yourself"],
  [/\bthemselves\b/g, "yourself"],
  [/\bTheir\b/g, "Your"],
  [/\btheir\b/g, "your"],
  [/\bThey\b/g, "You"],
  [/\bthey\b/g, "you"],
  [/\bThem\b/g, "You"],
  [/\bthem\b/g, "you"],
];

// Verb forms that need to flip from third-person singular to second-person
// after a "The student" -> "You" swap (e.g. "The student has" -> "You has"
// would be ungrammatical without this second pass).
const VERB_AGREEMENT: Record<string, string> = {
  has: "have",
  is: "are",
  was: "were",
  does: "do",
  shows: "show",
  appears: "appear",
  seems: "seem",
  struggles: "struggle",
  scores: "score",
  needs: "need",
  lacks: "lack",
  demonstrates: "demonstrate",
  indicates: "indicate",
};

export function toStudentPerspective(text: string): string {
  if (!text) return text;

  let result = text;
  for (const [pattern, replacement] of PERSPECTIVE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = result.replace(
    /\b(You|you) (has|is|was|does|shows|appears|seems|struggles|scores|needs|lacks|demonstrates|indicates)\b/g,
    (_match, pronoun: string, verb: string) => `${pronoun} ${VERB_AGREEMENT[verb.toLowerCase()] ?? verb}`
  );

  // "the prerequisite LO X" / "the current LO" etc. — drop the internal term.
  result = result.replace(/\bLO\b/g, "topic");

  return result;
}

/**
 * Deterministic, signal-type-keyed translation of one RoadblockEvidence
 * signal into plain student language, using the same real numbers already
 * present on the signal/state (never invented, never string-parsed from
 * `signal.evidence`). This does NOT change `roadblockEvidence.ts` or its
 * `evidence` strings — those remain the source of truth for `/debug/learning-state`
 * and any other research/debug view. This is presentation-layer only,
 * used by buildFocusResult.ts to produce the Focus card's "What we
 * noticed" bullets. Falls back to the raw grounded string for any signal
 * type not explicitly covered below (safe default, still factual).
 */
export function describeSignalForStudent(signal: RoadblockSignal, state: StudentLearningState): string {
  const loTitle = state.learningObject?.title ?? "this topic";

  switch (signal.type) {
    case "MASTERY_LOW_SUBMISSION":
      return `Your mastery of this ${loTitle} lesson is still at ${state.mastery?.level ?? "an early"} level.`;

    case "MASTERY_LOW_LO_AGGREGATE": {
      const count = state.loMastery?.evidenceSubmissionCount ?? 0;
      const countPhrase = count === 2 ? "both" : count > 2 ? `all ${count}` : null;
      return countPhrase
        ? `Your ${loTitle} mastery is low across ${countPhrase} ${loTitle} lessons you've worked on.`
        : `Your ${loTitle} mastery is still low overall.`;
    }

    case "MASTERY_SUBMISSION_BELOW_LO_AGGREGATE":
      return `You're doing better with other versions of ${loTitle} than with this particular one.`;

    case "QUIZ_LATEST_LOW_SCORE":
      return `Your most recent quiz attempt on ${loTitle} scored quite low.`;

    case "QUIZ_REPEATED_LOW_PERFORMANCE":
      return `Most of your quiz attempts on ${loTitle} have been below a passing level.`;

    case "QUIZ_LATEST_BELOW_BEST":
      return `You've scored much better on ${loTitle} before — your latest attempt was a step down.`;

    case "QUIZ_DECLINING_TREND":
      return `Your quiz scores on ${loTitle} have been trending downward.`;

    case "QUIZ_MULTIPLE_ATTEMPTS_NO_PROFICIENCY":
      return `You've tried the ${loTitle} quiz a few times but haven't yet reached a strong score.`;

    case "QUIZ_RECENT_FAILURE_AFTER_STRONG_PERFORMANCE":
      return `You previously scored well on ${loTitle}, but your latest attempt dropped sharply.`;

    case "RETENTION_RISK_ACTIVE_RECALL_DUE":
      return `You did well on ${loTitle} a while back — worth a quick recall check to make sure it's still solid.`;

    case "ENGAGEMENT_HIGH_IDLE_RATIO":
      return `You've spent time on ${loTitle}, but a good portion of it looks idle rather than active.`;

    case "ENGAGEMENT_REPEATED_VISITS_LOW_MASTERY":
      return `You've revisited ${loTitle} several times, but mastery hasn't moved much yet.`;

    case "ENGAGEMENT_HIGH_TIME_NO_IMPROVEMENT":
      return `You've spent a lot of time on ${loTitle} without a clear sign it's paying off yet.`;

    case "PREREQUISITE_LOW_MASTERY": {
      const prereq = state.prerequisites.prerequisiteDetails.find((p) => p.loId === signal.relatedLoId);
      const title = prereq?.title ?? "a prerequisite topic";
      return `${title} looks like a weak foundation for ${loTitle}.`;
    }

    case "PREREQUISITE_CURRENT_WEAK_PREREQ_STRONG":
      return `You're struggling with ${loTitle} even though your prerequisite topics look solid — this may be specific to ${loTitle} itself.`;

    case "FEYNMAN_LOW_SCORE":
      return `Your explanation of ${loTitle} in your own words suggests some gaps.`;

    case "FEYNMAN_MISMATCH_WITH_PERFORMANCE":
      return `You're scoring well on quizzes for ${loTitle}, but explaining it in your own words was harder — that can be a sign of surface-level understanding.`;

    default:
      return signal.evidence;
  }
}

/**
 * Deterministic set of LO ids that lower-priority sections ("Ready to
 * explore next") should not present as ready-to-advance-to, given the
 * planner's chosen action for the focus submission:
 * - the focus LO itself is always suppressed (it's already the subject of
 *   the Focus card);
 * - if the action is anything other than ADVANCE, the student hasn't
 *   demonstrated readiness to move past this LO, so its postrequisites are
 *   suppressed too (implements "don't recommend the current LO or its
 *   postrequisites until appropriate" for REVISIT_PREREQUISITE, ACTIVE_RECALL,
 *   REMEDIATE, TRY_DIFFERENT_METHOD, PRACTISE, CONTINUE, FEYNMAN_CHECK);
 * - if the action IS ADVANCE, only the specific target LO already offered
 *   as the Focus card's own CTA is suppressed (avoids an exact duplicate
 *   card) — other legitimate postrequisites may still be shown, since
 *   "progression recommendations are appropriate" when actively advancing.
 */
export function computeSuppressedLoIds(params: {
  focusLoId: string | null;
  action: PedagogicalPlan["action"];
  targetLoId: string | null;
  context: PlannerContext;
}): string[] {
  const { focusLoId, action, targetLoId, context } = params;
  const suppressed = new Set<string>();

  if (focusLoId) suppressed.add(focusLoId);

  if (action === "ADVANCE") {
    if (targetLoId) suppressed.add(targetLoId);
  } else {
    context.postrequisiteTargets.forEach((t) => suppressed.add(t.loId));
  }

  return Array.from(suppressed);
}

export interface ResolvedAction {
  label: string;
  href: Route | null;
  /** True only for REMEDIATE — the caller should open the remediation flow instead of navigating. */
  opensRemediation: boolean;
  /**
   * The actual submission id this action points a student at, whatever the
   * action — the current submission for CONTINUE/ACTIVE_RECALL/PRACTISE/
   * FEYNMAN_CHECK, the resolved prerequisite/postrequisite/alternative
   * submission for REVISIT_PREREQUISITE/ADVANCE/TRY_DIFFERENT_METHOD, or
   * null for REMEDIATE/NO_ACTION (no navigable target). Used generically by
   * buildFocusResult.ts to suppress this exact target from lower-priority
   * /recommendations sections, regardless of which action produced it —
   * see docs §27.11.
   */
  targetSubmissionId: string | null;
}

function buildSubmissionHref(courseSlug: string, submissionId: string): Route {
  return `/courses/${courseSlug}/submission/${submissionId}` as Route;
}

/**
 * Resolves a validated PedagogicalPlan into a real, navigable student action.
 * Every submission id used here either comes directly from the plan (already
 * grounding-validated by the planner) or from the planner's own
 * PlannerContext candidate lists — never invented.
 */
export async function resolvePlanAction(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAny: any;
  plan: PedagogicalPlan;
  context: PlannerContext;
  focusState: StudentLearningState;
}): Promise<ResolvedAction> {
  const { supabaseAny, plan, context, focusState } = params;
  const label = describeAction(plan.action);

  if (plan.action === "REMEDIATE") {
    return { label, href: null, opensRemediation: true, targetSubmissionId: null };
  }

  if (plan.action === "NO_ACTION") {
    return { label, href: null, opensRemediation: false, targetSubmissionId: null };
  }

  if (plan.action === "CONTINUE" || plan.action === "ACTIVE_RECALL" || plan.action === "PRACTISE") {
    if (!focusState.course) return { label, href: null, opensRemediation: false, targetSubmissionId: focusState.submissionId };
    return {
      label,
      href: buildSubmissionHref(focusState.course.slug, focusState.submissionId),
      opensRemediation: false,
      targetSubmissionId: focusState.submissionId,
    };
  }

  if (plan.action === "FEYNMAN_CHECK") {
    return {
      label,
      href: `/recommendations/feynman/${focusState.submissionId}` as Route,
      opensRemediation: false,
      targetSubmissionId: focusState.submissionId,
    };
  }

  let targetSubmissionId: string | null = null;

  if (plan.action === "ADVANCE") {
    const target = context.postrequisiteTargets.find((t) => t.loId === plan.targetLoId);
    targetSubmissionId = plan.targetSubmissionId ?? target?.submissions[0]?.submissionId ?? null;
  } else if (plan.action === "REVISIT_PREREQUISITE") {
    const target = context.prerequisiteTargets.find((t) => t.loId === plan.targetLoId);
    targetSubmissionId = plan.targetSubmissionId ?? target?.submissions[0]?.submissionId ?? null;
  } else if (plan.action === "TRY_DIFFERENT_METHOD") {
    targetSubmissionId = plan.targetSubmissionId ?? context.currentSubmissionAlternatives[0]?.submissionId ?? null;
    if (!targetSubmissionId) {
      // No alternative submission exists — the only concrete thing left to
      // offer is the current submission itself (a different delivery type
      // within it, described in copy only; no deep-link-to-block UI exists yet).
      if (!focusState.course) {
        return { label, href: null, opensRemediation: false, targetSubmissionId: focusState.submissionId };
      }
      return {
        label,
        href: buildSubmissionHref(focusState.course.slug, focusState.submissionId),
        opensRemediation: false,
        targetSubmissionId: focusState.submissionId,
      };
    }
  }

  if (!targetSubmissionId) {
    return { label, href: null, opensRemediation: false, targetSubmissionId: null };
  }

  const { data } = await supabaseAny
    .from("teacher_lo_submission")
    .select("id, course:course_id(slug)")
    .eq("id", targetSubmissionId)
    .maybeSingle();

  const slug = data?.course?.slug as string | undefined;
  if (!slug) return { label, href: null, opensRemediation: false, targetSubmissionId };

  return { label, href: buildSubmissionHref(slug, targetSubmissionId), opensRemediation: false, targetSubmissionId };
}
