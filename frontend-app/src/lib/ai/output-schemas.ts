/**
 * Zod schemas for structured LLM output.
 *
 * Used with LangChain's `.withStructuredOutput()` to replace brittle
 * regex+JSON.parse patterns with type-safe, validated output.
 */

import { z } from "zod";

/* ── Feynman evaluation (one-shot grade) ─────────────────────────────── */

export const FeynmanEvaluationSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Integer 0-100 representing the quality of the explanation"),
  feedback: z
    .string()
    .min(10)
    .max(500)
    .describe("2-3 sentences of constructive feedback for the student"),
});

export type FeynmanEvaluation = z.infer<typeof FeynmanEvaluationSchema>;

/* ── Feynman misconception detection (Socratic coaching) ─────────────── */

export const MisconceptionAnalysisSchema = z.object({
  hasMisconception: z
    .boolean()
    .describe("Whether the student's explanation contains a misconception"),
  misconceptions: z
    .array(z.string())
    .max(3)
    .describe("List of specific misconceptions detected (empty if none)"),
  followUpQuestion: z
    .string()
    .describe("A Socratic follow-up question to help the student self-correct"),
  adjustedScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Updated score after analyzing the follow-up response"),
  feedback: z
    .string()
    .min(10)
    .max(500)
    .describe("Updated constructive feedback"),
});

export type MisconceptionAnalysis = z.infer<typeof MisconceptionAnalysisSchema>;

/* ── Learning router recommendation ──────────────────────────────────── */

export const RecommendationItemSchema = z.object({
  submissionId: z.string().describe("The submission ID to recommend"),
  reason: z.string().max(200).describe("Why this is recommended"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence in this recommendation (0-1)"),
  priority: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Priority rank (1 = highest)"),
});

export const RecommendationSectionSchema = z.object({
  sectionType: z
    .enum(["continue", "next", "style", "recall", "feynman"])
    .describe("Which recommendation section this belongs to"),
  items: z.array(RecommendationItemSchema).max(5),
});

export const RecommendationOutputSchema = z.object({
  sections: z.array(RecommendationSectionSchema),
  reasoning: z
    .string()
    .max(500)
    .describe("Brief chain-of-thought explaining the recommendation logic"),
});

export type RecommendationOutput = z.infer<typeof RecommendationOutputSchema>;

/* ── Struggle intervention ───────────────────────────────────────────── */

export const InterventionSchema = z.object({
  shouldIntervene: z
    .boolean()
    .describe("Whether the student needs an intervention right now"),
  interventionType: z
    .enum(["micro_hint", "concept_recap", "worked_example", "checkpoint_quiz", "none"])
    .describe("The type of intervention to deliver"),
  content: z
    .string()
    .max(800)
    .describe("The intervention content to show the student"),
  reason: z
    .string()
    .max(200)
    .describe("Why this intervention was triggered"),
});

export type Intervention = z.infer<typeof InterventionSchema>;
