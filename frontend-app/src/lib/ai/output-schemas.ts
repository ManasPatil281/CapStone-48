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

/* ── Roadblock diagnosis ──────────────────────────────────────────────── */

/**
 * Bounded diagnosis categories for the diagnostic agent
 * (src/lib/ai/agents/diagnostic-agent.ts).
 *
 * NO_ROADBLOCK_DETECTED is never chosen by the LLM itself — it is only
 * returned by the deterministic short-circuit when RoadblockEvidence found
 * no signals at all, to distinguish "checked, looks healthy" from
 * INSUFFICIENT_EVIDENCE ("data exists but is too sparse/conflicting to
 * conclude either way").
 */
export const DiagnosisTypeEnum = z.enum([
  "CONCEPTUAL_DIFFICULTY",
  "PREREQUISITE_GAP",
  "RETENTION_DIFFICULTY",
  "ENGAGEMENT_DIFFICULTY",
  "ASSESSMENT_DIFFICULTY",
  "SUBMISSION_SPECIFIC_DIFFICULTY",
  "INSUFFICIENT_EVIDENCE",
  "NO_ROADBLOCK_DETECTED",
]);

export const DiagnosisSchema = z.object({
  hasRoadblock: z.boolean().describe("Whether the evidence supports a likely learning roadblock"),
  diagnosisType: DiagnosisTypeEnum.describe("The single best-fitting bounded diagnosis category"),
  primaryDiagnosis: z
    .string()
    .max(300)
    .describe("One-sentence plain-language summary of the most likely reason for struggle"),
  explanation: z
    .string()
    .max(800)
    .describe("A short explanation grounded only in the supplied evidence, distinguishing observation from inference"),
  evidence: z
    .array(z.string().max(200))
    .max(8)
    .describe("Concrete facts drawn directly from the supplied evidence, not invented"),
  possibleWeakConcepts: z
    .array(z.string().max(100))
    .max(5)
    .describe("Optional, clearly inferential list of concepts that may be weak; empty if not supported by evidence"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence 0-1; must be lowered by missing, conflicting, or thin evidence"),
  evidenceLimitations: z
    .array(z.string().max(200))
    .max(8)
    .describe("Which evidence categories were unavailable or insufficient for this diagnosis"),
  studentSummary: z
    .string()
    .max(300)
    .describe(
      "1-2 sentences written DIRECTLY to the student, addressing them only as 'you'/'your'. Never say 'the student', 'the learner', 'they', or 'their'. No internal enum names, signal types, or developer/debug language. Must stay grounded in the same evidence as primaryDiagnosis/explanation — do not introduce new claims."
    ),
});

export type Diagnosis = z.infer<typeof DiagnosisSchema>;

/* ── Pedagogical planner ──────────────────────────────────────────────── */

/**
 * Bounded next-action set for the pedagogical planner
 * (src/lib/ai/agents/pedagogical-planner.ts). Sits above specialist agents
 * as the orchestration/decision layer; it does not execute the action.
 */
export const PlannerActionEnum = z.enum([
  "ADVANCE",
  "CONTINUE",
  "REMEDIATE",
  "REVISIT_PREREQUISITE",
  "TRY_DIFFERENT_METHOD",
  "ACTIVE_RECALL",
  "FEYNMAN_CHECK",
  "PRACTISE",
  "NO_ACTION",
]);

export const PedagogicalPlanSchema = z.object({
  action: PlannerActionEnum.describe("The single best next pedagogical action"),
  targetLoId: z
    .string()
    .nullable()
    .describe(
      "Required for ADVANCE (a postrequisite LO) or REVISIT_PREREQUISITE (a prerequisite LO); must be one of the ids explicitly listed in the available targets, otherwise null"
    ),
  targetSubmissionId: z
    .string()
    .nullable()
    .describe(
      "Optional specific submission within targetLoId, or an alternative submission of the current LO for TRY_DIFFERENT_METHOD; must be one of the ids explicitly listed, otherwise null"
    ),
  targetDeliveryTypeId: z
    .string()
    .nullable()
    .describe(
      "Optional delivery type to try, only meaningful for TRY_DIFFERENT_METHOD; must be one of the ids explicitly listed, otherwise null"
    ),
  reason: z.string().max(400).describe("Plain-language reason grounded in the supplied evidence/diagnosis"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence 0-1; must be lowered by missing, conflicting, or thin evidence"),
  supportingSignals: z
    .array(z.string().max(80))
    .max(8)
    .describe("RoadblockEvidence signal types or diagnosis fields that support this action"),
  alternativesConsidered: z
    .array(
      z.object({
        action: PlannerActionEnum,
        // Bumped from 200 -> 350: Gemini's otherwise semantically valid
        // plans were being rejected purely because this natural-language
        // field ran slightly over 200 chars. 350 is a safer hard ceiling;
        // PEDAGOGICAL_PLANNER_PROMPT separately asks for a ~180 char soft
        // brevity target so output stays concise in the common case.
        reasonNotChosen: z.string().max(350),
      })
    )
    // Reduced from 4 -> 3: fewer, more useful alternatives, and a smaller
    // hard ceiling on total output size (this array was a meaningful part
    // of the truncated-output failures on verbose Gemini responses). Still
    // validated the same way — this tightens the bound, it does not weaken
    // validation.
    .max(3)
    .describe("The 2-3 most useful other actions considered and why they were not chosen"),
  studentReason: z
    .string()
    .max(300)
    .describe(
      "1-2 sentences written DIRECTLY to the student explaining why this action was chosen, addressing them only as 'you'/'your'. Never say 'the student', 'the learner', 'they', or 'their'. No internal signal names, RoadblockEvidence types, or developer/debug language. Must stay grounded in the same evidence/targets already used for 'reason' — do not introduce new claims or targets."
    ),
});

export type PedagogicalPlan = z.infer<typeof PedagogicalPlanSchema>;
