/**
 * Tool: Fetch prerequisite chain for a learning object.
 *
 * Queries `teacher_lo_submission_edge` and `learning_object_prerequisite`
 * to build the prerequisite chain. Accepts learningObjectId, submissionId, or loTitle.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export function createPrerequisiteTool() {
  return new DynamicStructuredTool({
    name: "fetch_prerequisites",
    description:
      "Fetch the prerequisite chain for a learning object. " +
      "Accepts learningObjectId, submissionId, or loTitle. " +
      "Returns a list of prerequisite LO titles and descriptions. " +
      "Use this whenever the student asks about prerequisites, foundational topics, or what to learn before this LO.",
    schema: z.object({
      learningObjectId: z
        .string()
        .optional()
        .describe("The learning object ID (UUID) if known"),
      submissionId: z
        .string()
        .optional()
        .describe("The submission ID if known"),
      loTitle: z
        .string()
        .optional()
        .describe("The title of the learning object (e.g. 'Stack', 'Array')"),
    }),
    func: async ({ learningObjectId, submissionId, loTitle }) => {
      try {
        const supabase = createSupabaseServerClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any;

        let targetLoId = learningObjectId?.trim();

        // 1. Resolve via submissionId if provided
        if (!targetLoId && submissionId?.trim()) {
          const { data: sub } = await supabaseAny
            .from("teacher_lo_submission")
            .select("learning_object_id")
            .eq("id", submissionId.trim())
            .maybeSingle();

          if (sub?.learning_object_id) {
            targetLoId = sub.learning_object_id;
          }
        }

        // 2. Resolve via loTitle if targetLoId is still missing
        if (!targetLoId && loTitle?.trim()) {
          const { data: lo } = await supabaseAny
            .from("learning_object")
            .select("id")
            .ilike("title", `%${loTitle.trim()}%`)
            .maybeSingle();

          if (lo?.id) {
            targetLoId = lo.id;
          }
        }

        // 3. Fallback: search learning_object table by matching any query string
        if (!targetLoId) {
          const queryStr = (learningObjectId || submissionId || loTitle || "").trim();
          if (queryStr) {
            const { data: lo } = await supabaseAny
              .from("learning_object")
              .select("id")
              .ilike("title", `%${queryStr}%`)
              .maybeSingle();

            if (lo?.id) {
              targetLoId = lo.id;
            }
          }
        }

        if (!targetLoId) {
          return "Could not identify the learning object ID to look up prerequisites.";
        }

        // Query direct prerequisites via teacher_lo_submission_edge
        const { data: edges, error: edgeErr } = await supabaseAny
          .from("teacher_lo_submission_edge")
          .select("source_lo_id, target_lo_id")
          .eq("target_lo_id", targetLoId);

        let prereqLoIds: string[] = [];

        if (!edgeErr && edges && edges.length > 0) {
          prereqLoIds = edges.map((e: { source_lo_id: string }) => e.source_lo_id);
        } else {
          // Fallback: query learning_object_prerequisite table
          const { data: prereqRows } = await supabaseAny
            .from("learning_object_prerequisite")
            .select("prerequisite_lo_id")
            .eq("learning_object_id", targetLoId);

          if (prereqRows && prereqRows.length > 0) {
            prereqLoIds = prereqRows.map(
              (p: { prerequisite_lo_id: string }) => p.prerequisite_lo_id
            );
          }
        }

        if (prereqLoIds.length === 0) {
          return "No formal prerequisites registered in the curriculum graph for this topic. It is considered a foundational or entry-level topic.";
        }

        // Fetch details of prerequisite LOs
        const { data: los, error: loErr } = await supabaseAny
          .from("learning_object")
          .select("id, title, difficulty_level, description")
          .in("id", prereqLoIds);

        if (loErr || !los || los.length === 0) {
          return `Prerequisite IDs found (${prereqLoIds.join(", ")}), but failed to retrieve details.`;
        }

        const formatted = los
          .map(
            (lo: {
              title: string;
              difficulty_level: number;
              description?: string;
            }) =>
              `- ${lo.title} (difficulty level ${lo.difficulty_level}): ${lo.description ? lo.description.slice(0, 120) : "No description"}`
          )
          .join("\n");

        return `Prerequisites for this learning object:\n${formatted}`;
      } catch (error) {
        console.error("[fetch_prerequisites] Error:", error);
        return "Failed to retrieve prerequisites due to an internal error.";
      }
    },
  });
}
