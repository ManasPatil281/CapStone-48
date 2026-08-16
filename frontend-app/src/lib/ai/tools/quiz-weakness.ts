/**
 * Tool: Get student's quiz weaknesses.
 *
 * Queries `student_quiz_attempt` to find topics where the student
 * has low or declining scores.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export function createQuizWeaknessTool() {
  return new DynamicStructuredTool({
    name: "get_quiz_weakness",
    description:
      "Fetch the student's weakest quiz topics based on recent quiz attempts. " +
      "Returns submissions where the student scored poorly. " +
      "Use this when a student asks what they need to improve, when they're struggling, or when you want to suggest focused review areas.",
    schema: z.object({
      studentId: z.string().describe("The student's user ID"),
    }),
    func: async ({ studentId }) => {
      try {
        const supabase = createSupabaseServerClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any;

        const { data: attempts, error } = await supabaseAny
          .from("student_quiz_attempt")
          .select(
            "submission_id, score_percentage, submitted_at, created_at"
          )
          .eq("student_id", studentId)
          .order("submitted_at", { ascending: false, nullsFirst: false })
          .limit(50);

        if (error) {
          return `Error fetching quiz attempts: ${error.message}`;
        }

        if (!attempts || attempts.length === 0) {
          return "No quiz attempts found for this student yet.";
        }

        // Group by submission, find lowest scores
        const scoresBySubmission = new Map<
          string,
          { scores: number[]; latest: string }
        >();

        for (const attempt of attempts as Array<{
          submission_id: string;
          score_percentage: number | null;
          submitted_at: string | null;
          created_at: string | null;
        }>) {
          if (
            !attempt.submission_id ||
            attempt.score_percentage === null
          ) {
            continue;
          }

          const existing = scoresBySubmission.get(attempt.submission_id);
          if (existing) {
            existing.scores.push(attempt.score_percentage);
          } else {
            scoresBySubmission.set(attempt.submission_id, {
              scores: [attempt.score_percentage],
              latest: attempt.submitted_at || attempt.created_at || "",
            });
          }
        }

        // Find weakest topics (average score < 70%)
        const weakTopics: Array<{
          submissionId: string;
          avgScore: number;
          attempts: number;
          trend: string;
        }> = [];

        for (const [submissionId, data] of scoresBySubmission) {
          const avg =
            data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length;

          if (avg < 70) {
            // Calculate trend
            let trend = "stable";
            if (data.scores.length >= 2) {
              const first = data.scores[data.scores.length - 1];
              const last = data.scores[0];
              if (last > first + 5) trend = "improving";
              else if (last < first - 5) trend = "declining";
            }

            weakTopics.push({
              submissionId,
              avgScore: Math.round(avg),
              attempts: data.scores.length,
              trend,
            });
          }
        }

        if (weakTopics.length === 0) {
          return "The student has no weak quiz topics (all average scores are 70% or above). They're doing well!";
        }

        // Sort by worst first
        weakTopics.sort((a, b) => a.avgScore - b.avgScore);

        const formatted = weakTopics
          .slice(0, 5)
          .map(
            (t) =>
              `- Submission ${t.submissionId.slice(0, 8)}…: avg score ${t.avgScore}%, ${t.attempts} attempt(s), trend: ${t.trend}`
          )
          .join("\n");

        return `Student's weakest quiz topics:\n${formatted}`;
      } catch (error) {
        console.error("[get_quiz_weakness] Error:", error);
        return "Failed to retrieve quiz weakness data due to an internal error.";
      }
    },
  });
}
