/**
 * Shared fallback helpers for structured LLM output.
 *
 * Groq's native "jsonSchema" structured-output mode (auto-selected by
 * @langchain/groq for any "openai/gpt-oss*" model when no method is given)
 * enforces the schema server-side and can reject a smaller model's output
 * with a provider-level `json_validate_failed` error before it ever reaches
 * our code. This module implements the same fallback technique already used
 * successfully in src/lib/ai/agents/learning-router.ts: extract the raw text
 * of a plain (non-structured) model response and validate it against the
 * existing Zod schema ourselves, rather than trusting the provider's
 * server-side enforcement alone.
 *
 * `parseAndValidateJsonObject` never returns unvalidated data — it throws if
 * no JSON object is found or if it fails the Zod schema, so callers must
 * catch and fall back (matching the project's existing deterministic-fallback
 * convention).
 */

import type { z } from "zod";

export function toTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : (part as { text?: string }).text ?? ""))
      .join("\n");
  }
  return "";
}

/**
 * Extracts the first top-level `{...}` JSON object from raw model text and
 * validates it against the given Zod schema. Throws (never silently
 * returns malformed/unvalidated data) if:
 * - no object-shaped substring is found,
 * - the substring isn't valid JSON, or
 * - the parsed JSON doesn't match the schema (e.g. an array instead of an
 *   object, or missing/invalid required fields).
 */
export function parseAndValidateJsonObject<T>(raw: string, schema: z.ZodType<T>): T {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Model response did not contain a JSON object.");
  }

  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Model JSON failed schema validation: ${result.error.message}`);
  }

  return result.data;
}
