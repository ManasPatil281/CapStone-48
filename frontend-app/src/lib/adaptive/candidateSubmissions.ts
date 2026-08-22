/**
 * Deterministic candidate-submission ranking for the /recommendations page.
 *
 * This is the "which submission should the page focus on" step. It is pure
 * deterministic data assembly + a documented scoring formula — no LLM call
 * happens here. It exists so that the expensive Diagnostic Agent / Pedagogical
 * Planner calls only ever run once (on the single highest-priority candidate),
 * instead of once per submission.
 *
 * Ranking formula (explicit, no hidden weighting):
 *
 *   severityScore = 100 * (# of "high" severity RoadblockEvidence signals)
 *                 +  10 * (# of "medium" severity signals)
 *                 +   1 * (# of "low" severity signals)
 *
 * Candidates are sorted by severityScore descending, tie-broken by most
 * recent activity (max of last mastery calculation and last visit timestamp)
 * descending. A candidate with severityScore = 0 has no RoadblockEvidence
 * signals at all — the highest-ranked such candidate is simply the student's
 * most recently active submission, which is what naturally becomes the
 * "focus" candidate for an otherwise healthy student.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildStudentLearningState, type StudentLearningState } from "./studentLearningState";
import { extractRoadblockEvidence, type RoadblockEvidence } from "./roadblockEvidence";

// Bounded so this stays cheap: only the student's most recently relevant
// submissions are considered, not their entire history.
const MAX_CANDIDATE_SUBMISSIONS = 8;

const SEVERITY_WEIGHT = { high: 100, medium: 10, low: 1 } as const;

export interface RankedCandidate {
  submissionId: string;
  state: StudentLearningState;
  evidence: RoadblockEvidence;
  severityScore: number;
  mostRecentActivityAt: string | null;
}

export interface RecentVisitRow {
  submission_id: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface GatherRankedCandidatesResult {
  candidates: RankedCandidate[];
  /**
   * The student's recent student_submission_visit rows (same query used
   * internally to rank candidates — submission_id/started_at/ended_at,
   * newest first, capped at 40) exposed so callers needing this same data
   * (e.g. the "Continue learning" section on /recommendations) can reuse it
   * instead of re-querying. Re-issuing the exact same PostgREST request
   * within one server-render request triggers Next.js's fetch request
   * memoization to serve a `.clone()` of the first response, which
   * previously crashed with "Response.clone: Body has already been
   * consumed" — the real fix is not re-fetching identical data twice.
   */
  recentVisitRows: RecentVisitRow[];
}

function computeSeverityScore(evidence: RoadblockEvidence): number {
  return evidence.signals.reduce((sum, s) => sum + SEVERITY_WEIGHT[s.severity], 0);
}

function toMillis(value: string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Gathers the student's recently relevant submissions (from mastery + visit
 * rows), builds a StudentLearningState + RoadblockEvidence for each, and
 * returns them ranked by the deterministic formula above. No LLM is called.
 */
export async function gatherRankedCandidates(studentId: string): Promise<GatherRankedCandidatesResult> {
  const supabase = createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const [{ data: masteryRows }, { data: visitRows }] = await Promise.all([
    supabaseAny
      .from("student_submission_mastery")
      .select("submission_id, last_calculated_at")
      .eq("student_id", studentId),
    supabaseAny
      .from("student_submission_visit")
      .select("submission_id, started_at, ended_at")
      .eq("student_id", studentId)
      .order("started_at", { ascending: false })
      .limit(40),
  ]);

  const lastActivityBySubmission = new Map<string, string | null>();

  ((masteryRows ?? []) as Array<{ submission_id: string | null; last_calculated_at: string | null }>).forEach(
    (row) => {
      if (!row.submission_id) return;
      lastActivityBySubmission.set(row.submission_id, row.last_calculated_at ?? null);
    }
  );

  ((visitRows ?? []) as Array<{ submission_id: string | null; started_at: string | null; ended_at: string | null }>).forEach(
    (row) => {
      if (!row.submission_id) return;
      const candidateTs = row.ended_at ?? row.started_at;
      const existing = lastActivityBySubmission.get(row.submission_id) ?? null;
      if (!existing || toMillis(candidateTs) > toMillis(existing)) {
        lastActivityBySubmission.set(row.submission_id, candidateTs);
      }
    }
  );

  const submissionIds = Array.from(lastActivityBySubmission.keys())
    .sort((a, b) => toMillis(lastActivityBySubmission.get(b) ?? null) - toMillis(lastActivityBySubmission.get(a) ?? null))
    .slice(0, MAX_CANDIDATE_SUBMISSIONS);

  const candidates = (
    await Promise.all(
      submissionIds.map(async (submissionId): Promise<RankedCandidate | null> => {
        const state = await buildStudentLearningState(studentId, submissionId);
        if (!state) return null;
        const evidence = extractRoadblockEvidence(state);
        return {
          submissionId,
          state,
          evidence,
          severityScore: computeSeverityScore(evidence),
          mostRecentActivityAt: lastActivityBySubmission.get(submissionId) ?? null,
        };
      })
    )
  ).filter((c): c is RankedCandidate => c !== null);

  candidates.sort((a, b) => {
    if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
    return toMillis(b.mostRecentActivityAt) - toMillis(a.mostRecentActivityAt);
  });

  return { candidates, recentVisitRows: (visitRows ?? []) as RecentVisitRow[] };
}
