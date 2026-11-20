import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  FeynmanEvaluationSchema,
  RecommendationOutputSchema,
  DiagnosisSchema,
  PedagogicalPlanSchema,
  InterventionSchema,
} from "@/lib/ai/output-schemas";
import { parseAndValidateJsonObject, toTextContent, isRateLimitError } from "@/lib/ai/structuredOutputFallback";

const validPlan = {
  action: "CONTINUE", targetLoId: null, targetSubmissionId: null, targetDeliveryTypeId: null,
  reason: "r", confidence: 0.5, supportingSignals: [], alternativesConsidered: [], studentReason: "You can keep going.",
};
const validDiag = {
  hasRoadblock: true, diagnosisType: "PREREQUISITE_GAP", primaryDiagnosis: "p", explanation: "e",
  evidence: [], possibleWeakConcepts: [], confidence: 0.6, evidenceLimitations: [], studentSummary: "s",
};

describe("LLM output schema validation (Zod)", () => {
  it("SC-01 Feynman: valid score/feedback accepted", () => {
    expect(FeynmanEvaluationSchema.safeParse({ score: 80, feedback: "Good explanation overall." }).success).toBe(true);
  });
  it("SC-02 Feynman: score out of range / non-integer / short feedback rejected", () => {
    for (const bad of [
      { score: 101, feedback: "Good explanation overall." },
      { score: -1, feedback: "Good explanation overall." },
      { score: 55.5, feedback: "Good explanation overall." },
      { score: 50, feedback: "short" },
      { score: "80", feedback: "Good explanation overall." },
      { feedback: "Good explanation overall." },
    ]) expect(FeynmanEvaluationSchema.safeParse(bad).success).toBe(false);
  });
  it("SC-03 Diagnosis: unknown diagnosisType rejected; confidence must be within 0-1", () => {
    expect(DiagnosisSchema.safeParse(validDiag).success).toBe(true);
    expect(DiagnosisSchema.safeParse({ ...validDiag, diagnosisType: "MADE_UP" }).success).toBe(false);
    expect(DiagnosisSchema.safeParse({ ...validDiag, confidence: 1.5 }).success).toBe(false);
  });
  it("SC-04 Planner: action restricted to the bounded 9-action enum", () => {
    expect(PedagogicalPlanSchema.safeParse(validPlan).success).toBe(true);
    expect(PedagogicalPlanSchema.safeParse({ ...validPlan, action: "DELETE_STUDENT_DATA" }).success).toBe(false);
  });
  it("SC-05 Planner: too many alternatives (>3) or over-long studentReason rejected", () => {
    const alt = { action: "CONTINUE", reasonNotChosen: "x" };
    expect(PedagogicalPlanSchema.safeParse({ ...validPlan, alternativesConsidered: [alt, alt, alt, alt] }).success).toBe(false);
    expect(PedagogicalPlanSchema.safeParse({ ...validPlan, studentReason: "x".repeat(301) }).success).toBe(false);
  });
  it("SC-06 Recommendation: priority 1-5 integer, confidence 0-1, bounded section types", () => {
    const ok = { sections: [{ sectionType: "next", items: [{ submissionId: "a", reason: "r", confidence: 0.9, priority: 1 }] }], reasoning: "ok" };
    expect(RecommendationOutputSchema.safeParse(ok).success).toBe(true);
    const badPriority = { ...ok, sections: [{ sectionType: "next", items: [{ submissionId: "a", reason: "r", confidence: 0.9, priority: 9 }] }] };
    const badSection = { ...ok, sections: [{ sectionType: "hack", items: [] }] };
    expect(RecommendationOutputSchema.safeParse(badPriority).success).toBe(false);
    expect(RecommendationOutputSchema.safeParse(badSection).success).toBe(false);
  });
  it("SC-07 Intervention: unknown interventionType rejected", () => {
    expect(InterventionSchema.safeParse({ shouldIntervene: true, interventionType: "nuke", content: "c", reason: "r" }).success).toBe(false);
  });
});

describe("Structured-output fallback helpers", () => {
  const schema = z.object({ a: z.number() });
  it("FB-01 extracts JSON embedded in prose / markdown fences", () => {
    expect(parseAndValidateJsonObject('Sure! ```json\n{"a": 3}\n``` hope it helps', schema)).toEqual({ a: 3 });
  });
  it("FB-02 throws when there is no JSON object", () => {
    expect(() => parseAndValidateJsonObject("no json here", schema)).toThrow(/JSON object/);
  });
  it("FB-03 throws on malformed JSON", () => {
    expect(() => parseAndValidateJsonObject("{a: 3,}", schema)).toThrow();
  });
  it("FB-04 throws (never returns) schema-invalid data", () => {
    expect(() => parseAndValidateJsonObject('{"a":"three"}', schema)).toThrow(/schema validation/);
  });
  it("FB-05 a bare array is rejected", () => {
    expect(() => parseAndValidateJsonObject("[1,2,3]", schema)).toThrow();
  });
  it("FB-06 toTextContent handles string, content-part array and unknown", () => {
    expect(toTextContent("hi")).toBe("hi");
    expect(toTextContent([{ text: "a" }, "b"])).toBe("a\nb");
    expect(toTextContent(42)).toBe("");
  });
  it("FB-07 isRateLimitError recognises HTTP 429, name, message and nested body shapes", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ name: "RateLimitError" })).toBe(true);
    expect(isRateLimitError(new Error("Too many requests"))).toBe(true);
    expect(isRateLimitError({ error: { type: "rate_limit_exceeded" } })).toBe(true);
    expect(isRateLimitError({ error: { status: "RESOURCE_EXHAUSTED" } })).toBe(true);
  });
  it("FB-08 isRateLimitError is false for unrelated errors / non-objects", () => {
    expect(isRateLimitError(new Error("boom"))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError("429")).toBe(false);
    expect(isRateLimitError({ status: 500 })).toBe(false);
  });
});
