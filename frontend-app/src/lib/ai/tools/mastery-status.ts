/**
 * Tool: Check student's mastery status for a submission.
 *
 * Queries `student_submission_mastery` to return the student's
 * current mastery score and level.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export function createMasteryStatusTool() {
  return new DynamicStructuredTool({
    name: "get_mastery_status",
    description:
      "Check the student's mastery score and level for a specific submission. " +
      "Returns the mastery score (0-100), mastery level (Beginner/Developing/Proficient/Mastered), " +
      "and related metadata. Use this when the student asks about their progress, " +
      "when you need to gauge their understanding level, or when tailoring explanations.",
    schema: z.object({
      studentId: z.string().describe("The student's user ID"),
      submissionId: z.string().describe("The submission ID to check mastery for"),
    }),
    func: async ({ studentId, submissionId }) => {
      try {
        const supabase = createSupabaseServerClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any;

        const { data, error } = await supabaseAny
          .from("student_submission_mastery")
          .select("mastery_score, mastery_level, last_calculated_at, metadata_json")
          .eq("student_id", studentId)
          .eq("submission_id", submissionId)
          .maybeSingle();

        if (error) {
          return `Error fetching mastery status: ${error.message}`;
        }

        if (!data) {
          return "No mastery data found for this student on this submission. They haven't been assessed yet.";
        }

        const score =
          typeof data.mastery_score === "number"
            ? Math.round(data.mastery_score)
            : "unknown";
        const level = data.mastery_level || "unknown";
        const lastCalculated = data.last_calculated_at || "unknown";

        // Extract useful metadata
        const meta = data.metadata_json as Record<string, unknown> | null;
        const extras: string[] = [];

        if (meta) {
          if (typeof meta.contentScore === "number") {
            extras.push(`Content engagement: ${Math.round(meta.contentScore as number)}%`);
          }
          if (typeof meta.quizScore === "number") {
            extras.push(`Best quiz score: ${Math.round(meta.quizScore as number)}%`);
          }
          if (typeof meta.feynmanScore === "number") {
            extras.push(`Feynman score: ${Math.round(meta.feynmanScore as number)}%`);
          }
          if (typeof meta.idlePenalty === "number" && (meta.idlePenalty as number) > 0) {
            extras.push(`Idle penalty: -${meta.idlePenalty}pts`);
          }
          if (typeof meta.improvementBonus === "number" && (meta.improvementBonus as number) > 0) {
            extras.push(`Improvement bonus: +${meta.improvementBonus}pts`);
          }
        }

        let result = `Mastery Status:\n- Score: ${score}%\n- Level: ${level}\n- Last updated: ${lastCalculated}`;

        if (extras.length > 0) {
          result += `\n- Details: ${extras.join(", ")}`;
        }

        return result;
      } catch (error) {
        console.error("[get_mastery_status] Error:", error);
        return "Failed to retrieve mastery status due to an internal error.";
      }
    },
  });
}
