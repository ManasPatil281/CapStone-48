/**
 * Tool: Retrieve a specific content block's full content.
 *
 * Queries `teacher_lo_submission_content` to get detailed content
 * for a specific teaching block.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export function createContentBlockTool() {
  return new DynamicStructuredTool({
    name: "get_content_block",
    description:
      "Retrieve the full content of a specific teaching block from the submission. " +
      "Use this when you need more detail about a particular concept, example, or exercise " +
      "that was only partially included in the context excerpts.",
    schema: z.object({
      submissionId: z
        .string()
        .describe("The submission ID containing the content"),
      blockTitle: z
        .string()
        .optional()
        .describe("Optional title of the specific block to retrieve"),
    }),
    func: async ({ submissionId, blockTitle }) => {
      try {
        const supabase = createSupabaseServerClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any;

        let query = supabaseAny
          .from("teacher_lo_submission_content")
          .select(
            "id, title, content_json, delivery_type_id, sort_order, delivery_type:delivery_type_id(name, code)"
          )
          .eq("submission_id", submissionId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        if (blockTitle) {
          query = query.ilike("title", `%${blockTitle}%`);
        }

        const { data: blocks, error } = await query.limit(3);

        if (error) {
          return `Error fetching content blocks: ${error.message}`;
        }

        if (!blocks || blocks.length === 0) {
          return blockTitle
            ? `No content block matching "${blockTitle}" found in this submission.`
            : "No active content blocks found in this submission.";
        }

        const formatted = blocks
          .map(
            (block: {
              title: string;
              delivery_type?: { name?: string; code?: string };
              content_json: unknown;
            }) => {
              const typeName =
                block.delivery_type?.name ||
                block.delivery_type?.code ||
                "Unknown";
              const contentStr = extractTextFromContent(block.content_json);
              return `[${typeName}] ${block.title}:\n${contentStr}`;
            }
          )
          .join("\n\n---\n\n");

        return `Content blocks retrieved:\n\n${formatted}`;
      } catch (error) {
        console.error("[get_content_block] Error:", error);
        return "Failed to retrieve content block due to an internal error.";
      }
    },
  });
}

/**
 * Extract readable text from a content_json blob.
 * Handles various content types (markdown, text, problem/solution, etc.)
 */
function extractTextFromContent(value: unknown, maxLength = 800): string {
  if (value === null || value === undefined) return "(empty content)";
  if (typeof value === "string") return value.slice(0, maxLength);

  if (typeof value !== "object") return String(value).slice(0, maxLength);

  const obj = value as Record<string, unknown>;
  const parts: string[] = [];

  // Priority fields
  const priorityKeys = [
    "markdown",
    "summary",
    "text",
    "problem",
    "solution",
    "explanation",
    "caption",
    "description",
    "front",
    "back",
    "hint",
    "expected_output",
  ];

  for (const key of priorityKeys) {
    if (typeof obj[key] === "string" && obj[key]) {
      parts.push(`${key}: ${(obj[key] as string).slice(0, 300)}`);
    }
  }

  // Handle arrays (like questions, cards)
  if (Array.isArray(obj["questions"])) {
    const qs = obj["questions"] as string[];
    parts.push(
      `questions: ${qs.slice(0, 5).map((q, i) => `${i + 1}. ${typeof q === "string" ? q.slice(0, 100) : JSON.stringify(q).slice(0, 100)}`).join("; ")}`
    );
  }

  if (Array.isArray(obj["cards"])) {
    const cards = obj["cards"] as Array<{
      front?: string;
      back?: string;
    }>;
    parts.push(
      `flashcards: ${cards.slice(0, 3).map((c) => `Q: ${c.front?.slice(0, 80) ?? "?"} → A: ${c.back?.slice(0, 80) ?? "?"}`).join("; ")}`
    );
  }

  const result = parts.join("\n");
  return result ? result.slice(0, maxLength) : "(content format not recognized)";
}
