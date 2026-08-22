/**
 * Smallest-safe browser/session-level cache for the /recommendations Focus
 * card, so revisiting the page within the same browser session doesn't
 * re-run the Diagnostic Agent + Pedagogical Planner unless the student's
 * evidence has actually changed. No database table — a short-lived,
 * httpOnly cookie only.
 *
 * Why a cookie and not a simpler in-memory/client cache: the page is a
 * Server Component that computes the Focus card during SSR, and a plain
 * RSC cannot set cookies mid-render (Next.js only allows `cookies().set()`
 * inside a Route Handler or Server Action). So the flow is:
 *   1. The page reads any existing cache cookie (cheap, synchronous).
 *   2. If its submissionId + fingerprint match the freshly (cheaply,
 *      deterministically) computed ones, render straight from the cache —
 *      zero LLM calls.
 *   3. On a miss, compute fresh as before, render normally, and mount a
 *      tiny inert client component that POSTs the result to
 *      /api/recommendations/focus-cache on mount so the NEXT page load can
 *      hit the cache.
 *
 * Only the fields the Focus card actually renders are cached (not the full
 * Diagnosis/PedagogicalPlan objects), keeping the cookie well under the
 * ~4KB per-cookie limit.
 */

import { createHash } from "crypto";
import type { RankedCandidate } from "@/lib/adaptive/candidateSubmissions";
import type { Diagnosis } from "@/lib/ai/output-schemas";

export const FOCUS_CACHE_COOKIE = "pf_focus_cache";
// Short-lived prototype cache, not a persistent record — intentionally
// expires well within a normal single session so stale evidence can't
// linger silently across days.
export const FOCUS_CACHE_MAX_AGE_SECONDS = 30 * 60;

// Bumped whenever CachedFocusView's shape changes. A cookie written by an
// older version of this schema is treated as a cache miss (never trusted as
// partially valid) rather than reaching a component with fields silently
// `undefined` — this is what broke when evidenceDetails/suppressedLoIds/
// learningObjectId were added but an existing 30-minute-old cookie from
// before that change still validated against the old, looser type guard.
//
// v3: added focusTargetSubmissionId/focusTargetLoId (generic cross-section
// target-suppression fields, see docs §27.11) and switched primaryDiagnosis/
// planReason to already-translated ("you/your") text — the field names are
// unchanged but a v2 cookie's values would be the untranslated originals, so
// the version bump also guards against silently mixing old raw copy with
// new translated copy.
//
// v4: reverted primaryDiagnosis/planReason back to RAW (untranslated) LLM
// text. Caching the already-translated string meant that whenever
// toStudentPerspective() itself improved (e.g. adding "they/their/them"
// handling), any cookie written before that improvement kept serving its
// stale pre-fix translated text for up to FOCUS_CACHE_MAX_AGE_SECONDS — this
// is exactly what caused "You are struggling because they lack mastery..."
// to still appear after the fix. Translation now happens once, at render
// time in page.tsx, from whatever raw text is on `focusView` (fresh or
// cached) — every render always reflects the current translation logic, so
// this class of bug can't recur on future wording changes either. See docs §27.13.
//
// v5: retired the primaryDiagnosis/planReason fields entirely (and with them
// the render-time toStudentPerspective() transform). The Diagnostic Agent
// and Pedagogical Planner now produce dedicated, schema-native student-facing
// fields (Diagnosis.studentSummary, PedagogicalPlan.studentReason) directly,
// written by the LLM in second person. Those raw structured fields are cached
// and rendered as-is — there is no longer any transform step to go stale, so
// this version bump is a one-time migration off the old field names, not a
// new instance of the v3/v4 staleness bug. See docs §27.14.
export const FOCUS_CACHE_SCHEMA_VERSION = 5;

/**
 * Deterministic fingerprint of exactly the evidence that could change the
 * Focus card's conclusion. Any real change to mastery, the latest quiz
 * attempt, or the detected RoadblockEvidence signals changes this value,
 * which invalidates the cache. Bounded/derived facts only — never invents
 * or samples partial data.
 */
export function computeFocusFingerprint(candidate: RankedCandidate): string {
  const { state, evidence } = candidate;
  const payload = {
    submissionId: candidate.submissionId,
    masteryScore: state.mastery?.score ?? null,
    masteryLastCalculatedAt: state.mastery?.lastCalculatedAt ?? null,
    quizAttemptCount: state.quiz.attemptCount,
    quizLatestAttemptAt: state.quiz.latestAttemptAt,
    quizLatestScore: state.quiz.latestScorePercentage,
    signals: evidence.signals.map((s) => `${s.type}:${s.severity}`).sort(),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 20);
}

export interface CachedFocusView {
  schemaVersion: number;
  submissionId: string;
  fingerprint: string;
  submissionTitle: string;
  learningObjectId: string | null;
  learningObjectTitle: string;
  courseTitle: string;
  masteryScore: number | null;
  masteryLevel: string | null;
  hasRoadblock: boolean;
  evidenceBullets: string[];
  evidenceDetails: string[];
  diagnosisType: Diagnosis["diagnosisType"];
  /** Raw `Diagnosis.studentSummary` — already written in second person by the agent; rendered as-is, no transform. */
  studentSummary: string;
  actionLabel: string;
  actionDetail: string | null;
  actionHref: string | null;
  opensRemediation: boolean;
  /** Raw `PedagogicalPlan.studentReason` — already written in second person by the agent; rendered as-is, no transform. */
  studentReason: string;
  /** See translateForStudent.ts's computeSuppressedLoIds(). */
  suppressedLoIds: string[];
  /** See FocusResult's doc comment in buildFocusResult.ts / docs §27.11. */
  focusTargetSubmissionId: string | null;
  focusTargetLoId: string | null;
}

function isCachedFocusView(value: unknown): value is CachedFocusView {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === FOCUS_CACHE_SCHEMA_VERSION &&
    typeof v.submissionId === "string" &&
    typeof v.fingerprint === "string" &&
    Array.isArray(v.evidenceBullets) &&
    Array.isArray(v.evidenceDetails) &&
    Array.isArray(v.suppressedLoIds)
  );
}

/** Parses and shape-validates the cache cookie's value. Never trusts it blindly. */
export function parseCachedFocusView(raw: string | undefined): CachedFocusView | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isCachedFocusView(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
