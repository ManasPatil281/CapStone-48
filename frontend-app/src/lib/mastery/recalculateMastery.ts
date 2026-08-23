/**
 * The single DB-touching mastery write path.
 *
 * This is the ONLY function in the codebase that should ever write to
 * `student_submission_mastery`. It fetches the three evidence sources
 * (quiz attempts, Feynman attempts, content-block engagement), runs the
 * pure `calculateMasteryScore()` engine, and upserts the result — or writes
 * nothing at all when there is no knowledge evidence yet (see engine doc
 * comment: "no evidence yet" must stay unknown, never become a confident 0).
 *
 * Callers (all server-side, all pass a server-trusted studentId — never a
 * client-supplied one):
 * - `api/mastery/recalculate/route.ts` — invoked by the client right after a
 *   quiz attempt is submitted.
 * - `api/feynman/evaluate/route.ts` — invoked right after a Feynman attempt
 *   is persisted.
 * - `courses/[courseSlug]/submission/[submissionId]/page.tsx` — invoked on
 *   every student page visit as a fallback/idempotent consistency pass (for
 *   slowly-accumulated content-engagement drift and any missed-event edge
 *   cases), not as the primary trigger for quiz/Feynman evidence anymore.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateMasteryScore, type MasteryResult } from "@/lib/mastery/calculateMasteryScore";

export async function recalculateMastery(studentId: string, submissionId: string): Promise<MasteryResult | null> {
  const supabase = createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const [contentRes, contentTimeRes, quizRes, feynmanRes] = await Promise.all([
    supabaseAny
      .from("teacher_lo_submission_content")
      .select("id, recommended_time_seconds")
      .eq("submission_id", submissionId),
    supabaseAny
      .from("student_content_block_time")
      .select("content_id, active_seconds, idle_seconds")
      .eq("student_id", studentId)
      .eq("submission_id", submissionId),
    supabaseAny
      .from("student_quiz_attempt")
      .select("score_percentage, submitted_at, created_at, randomization_mode")
      .eq("student_id", studentId)
      .eq("submission_id", submissionId),
    supabaseAny
      .from("student_feynman_attempt")
      .select("score, submitted_at")
      .eq("student_id", studentId)
      .eq("submission_id", submissionId),
  ]);

  if (contentRes.error) console.error("[recalculateMastery] Failed to load content blocks:", contentRes.error);
  if (contentTimeRes.error) console.error("[recalculateMastery] Failed to load content block time:", contentTimeRes.error);
  if (quizRes.error) console.error("[recalculateMastery] Failed to load quiz attempts:", quizRes.error);
  if (feynmanRes.error) console.error("[recalculateMastery] Failed to load Feynman attempts:", feynmanRes.error);

  const contentBlocks = ((contentRes.data ?? []) as Array<{ id: string; recommended_time_seconds: number | null }>).map(
    (r) => ({ id: r.id, recommendedTimeSeconds: r.recommended_time_seconds })
  );

  const contentBlockTimes = (
    (contentTimeRes.data ?? []) as Array<{ content_id: string; active_seconds: number | null; idle_seconds: number | null }>
  ).map((r) => ({
    contentId: r.content_id,
    activeSeconds: Number(r.active_seconds ?? 0),
    idleSeconds: Number(r.idle_seconds ?? 0),
  }));

  const quizAttempts = (
    (quizRes.data ?? []) as Array<{
      score_percentage: number | null;
      submitted_at: string | null;
      created_at: string | null;
      randomization_mode: number | null;
    }>
  ).map((r) => ({
    scorePercentage: r.score_percentage,
    timestamp: r.submitted_at ?? r.created_at,
    randomizationMode: r.randomization_mode,
  }));

  const feynmanAttempts = ((feynmanRes.data ?? []) as Array<{ score: number | null; submitted_at: string | null }>).map(
    (r) => ({ score: r.score, timestamp: r.submitted_at })
  );

  const result = calculateMasteryScore({ contentBlocks, contentBlockTimes, quizAttempts, feynmanAttempts });

  if (result === null) {
    // No knowledge evidence yet — write nothing, leave mastery unknown.
    return null;
  }

  const { error: upsertErr } = await supabaseAny.from("student_submission_mastery").upsert(
    {
      student_id: studentId,
      submission_id: submissionId,
      mastery_score: result.score,
      mastery_level: result.level,
      last_calculated_at: new Date().toISOString(),
      metadata_json: result.metadata,
    },
    { onConflict: "student_id,submission_id" }
  );

  if (upsertErr) {
    console.error("[recalculateMastery] Failed to upsert mastery:", upsertErr);
  }

  return result;
}
