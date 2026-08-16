/**
 * Shared LangChain model factory for Groq.
 *
 * Provides a centralized ChatGroq instance with retry logic and optional
 * model fallback. All AI endpoints should use `getGroqChat()` instead of
 * constructing models directly.
 */

import { ChatGroq } from "@langchain/groq";

/* ── defaults ────────────────────────────────────────────────────────── */

const DEFAULT_MODEL = "llama-3.1-8b-instant";
const FALLBACK_MODEL = "llama-3.1-70b-versatile";

export interface GroqChatOptions {
  /** Model name override (default: llama-3.1-8b-instant). */
  model?: string;
  /** Sampling temperature (0-1, default: 0.35). */
  temperature?: number;
  /** Maximum tokens to generate (default: 600). */
  maxTokens?: number;
  /** Number of automatic retries on transient errors (default: 2). */
  maxRetries?: number;
}

/**
 * Create a `ChatGroq` instance pre-configured for this project.
 *
 * Reads `GROQ_API_KEY` from `process.env` automatically.
 */
export function getGroqChat(options: GroqChatOptions = {}): ChatGroq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY environment variable.");
  }

  return new ChatGroq({
    apiKey,
    model: options.model ?? DEFAULT_MODEL,
    temperature: options.temperature ?? 0.35,
    maxTokens: options.maxTokens ?? 600,
    maxRetries: options.maxRetries ?? 2,
  });
}

/**
 * Create a fallback-capable model: tries the primary model first,
 * falls back to a larger model on failure.
 */
export function getGroqChatWithFallback(
  options: GroqChatOptions = {}
): ReturnType<ChatGroq["withFallbacks"]> {
  const primary = getGroqChat(options);
  const fallback = getGroqChat({
    ...options,
    model: FALLBACK_MODEL,
  });

  return primary.withFallbacks({ fallbacks: [fallback] });
}

export { DEFAULT_MODEL, FALLBACK_MODEL };
