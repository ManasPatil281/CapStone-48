/**
 * Shared LangChain model factories for Groq and (temporarily, for the
 * Pedagogical Planner provider test) Gemini.
 *
 * Provides centralized ChatGroq/ChatGoogleGenerativeAI instances with retry
 * logic and optional model fallback. All AI endpoints should use
 * `getGroqChat()` / `getGeminiChat()` instead of constructing models
 * directly.
 */

import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

/* ── defaults ────────────────────────────────────────────────────────── */

const DEFAULT_MODEL = "openai/gpt-oss-120b";
const FALLBACK_MODEL = "openai/gpt-oss-20b";

export interface GroqChatOptions {
  /** Model name override (default: openai/gpt-oss-120b). */
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

/* ── Gemini (temporary planner-provider test) ───────────────────────────
 * Not part of a multi-provider fallback yet — see
 * src/lib/ai/agents/pedagogical-planner.ts for the current single-provider
 * test wiring. Groq→Gemini→deterministic fallback routing is a follow-up.
 */

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export interface GeminiChatOptions {
  /** Model name override (default: gemini-2.5-flash). */
  model?: string;
  /** Sampling temperature (0-1, default: 0.35). */
  temperature?: number;
  /** Maximum output tokens to generate. */
  maxOutputTokens?: number;
  /** Number of automatic retries on transient errors (default: 0 here — no silent internal retries burning quota before our own fallback logic runs). */
  maxRetries?: number;
}

/**
 * Create a `ChatGoogleGenerativeAI` instance pre-configured for this
 * project. Reads `GEMINI_API_KEY` from `process.env` — the SDK itself would
 * also fall back to `GOOGLE_API_KEY`, but this project's convention is
 * `GEMINI_API_KEY`, so it's read and validated explicitly here to match
 * `getGroqChat()`'s error-message style.
 */
export function getGeminiChat(options: GeminiChatOptions = {}): ChatGoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable.");
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: options.model ?? DEFAULT_GEMINI_MODEL,
    temperature: options.temperature ?? 0.35,
    maxOutputTokens: options.maxOutputTokens,
    maxRetries: options.maxRetries ?? 0,
  });
}
