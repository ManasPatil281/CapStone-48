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

/**
 * Detects a rate-limit error (HTTP 429, groq-sdk's `RateLimitError`,
 * Google's `GoogleGenerativeAIFetchError` with `status: 429` / a
 * `RESOURCE_EXHAUSTED` body, or an equivalent message/code) across the
 * various shapes an error can arrive in after passing through a provider
 * SDK and LangChain's retry wrapper. Shared across providers (Groq, and
 * temporarily Gemini for the Pedagogical Planner provider test) since both
 * surface a numeric HTTP `status` the same way. Used to short-circuit
 * straight to a deterministic fallback instead of firing a second LLM
 * request that would just be rejected again within the same rate-limit
 * window — retrying only makes sense for malformed/invalid-output failures,
 * not for quota exhaustion.
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;

  if (err.status === 429) return true;

  if (typeof err.name === "string" && /rate.?limit/i.test(err.name)) return true;
  if (typeof err.code === "string" && /rate.?limit/i.test(err.code)) return true;

  const message = typeof err.message === "string" ? err.message : "";
  if (/rate.?limit|too many requests|quota exceeded|resource_exhausted|\b429\b/i.test(message)) return true;

  // groq-sdk's APIError carries a nested `error` body, e.g. { type: "rate_limit_exceeded", ... }.
  // Google's fetch error may carry `errorDetails` entries with a similar `reason`/`status` field.
  const nested = err.error;
  if (nested && typeof nested === "object") {
    const nestedErr = nested as Record<string, unknown>;
    if (typeof nestedErr.type === "string" && /rate.?limit/i.test(nestedErr.type)) return true;
    if (typeof nestedErr.code === "string" && /rate.?limit/i.test(nestedErr.code)) return true;
    if (typeof nestedErr.status === "string" && /resource_exhausted/i.test(nestedErr.status)) return true;
  }

  return false;
}
