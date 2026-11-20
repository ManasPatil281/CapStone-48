import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeState, mastery, hist } from "./fixtures";
import { extractRoadblockEvidence } from "@/lib/adaptive/roadblockEvidence";

/* ── Controllable LLM mock ──────────────────────────────────────────── */
const llm = vi.hoisted(() => ({
  calls: 0,
  structured: null as null | (() => Promise<unknown>),
  plain: null as null | (() => Promise<unknown>),
}));

vi.mock("@/lib/ai/model", () => {
  const fake = () => ({
    withStructuredOutput: () => ({
      invoke: async () => {
        llm.calls++;
        return llm.structured!();
      },
    }),
    invoke: async () => {
      llm.calls++;
      return llm.plain!();
    },
  });
  return { getGroqChat: fake, getGeminiChat: fake, getGroqChatWithFallback: fake };
});

// Quiz deep-dive DB lookup must not hit a real database in unit tests.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    ["select", "eq", "in", "order", "limit", "maybeSingle", "single"].forEach((m) => (chain[m] = self));
    (chain as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: [], error: null });
    return { from: () => chain };
  },
}));

import { diagnoseRoadblock } from "@/lib/ai/agents/diagnostic-agent";
import { planPedagogicalAction } from "@/lib/ai/agents/pedagogical-planner";
import { generateRecommendations } from "@/lib/ai/agents/learning-router";

const emptyCtx = {
  currentSubmissionAlternatives: [],
  prerequisiteTargets: [],
  postrequisiteTargets: [],
  currentSubmissionDeliveryOptions: [],
};

const validDiag = {
  hasRoadblock: true, diagnosisType: "CONCEPTUAL_DIFFICULTY", primaryDiagnosis: "p", explanation: "e",
  evidence: [], possibleWeakConcepts: [], confidence: 0.7, evidenceLimitations: [], studentSummary: "s",
};

const roadblockState = makeState({
  mastery: mastery(25),
  quiz: { attemptCount: 3, bestScorePercentage: 35, latestScorePercentage: 30, latestAttemptAt: null, trend: "declining", history: hist([35, 32, 30]) },
});

beforeEach(() => {
  llm.calls = 0;
  llm.structured = null;
  llm.plain = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("Diagnostic agent – bounded LLM use and fallback", () => {
  it("AG-01 healthy student: deterministic short-circuit, ZERO LLM calls", async () => {
    const st = makeState({ mastery: mastery(92) });
    const d = await diagnoseRoadblock(st, extractRoadblockEvidence(st));
    expect(llm.calls).toBe(0);
    expect(d.diagnosisType).toBe("NO_ROADBLOCK_DETECTED");
    expect(d.hasRoadblock).toBe(false);
  });
  it("AG-02 roadblock + valid structured output: exactly one LLM call, output passed through", async () => {
    llm.structured = async () => validDiag;
    const d = await diagnoseRoadblock(roadblockState, extractRoadblockEvidence(roadblockState));
    expect(llm.calls).toBe(1);
    expect(d.diagnosisType).toBe("CONCEPTUAL_DIFFICULTY");
  });
  it("AG-03 structured call throws, plain-text JSON valid: recovers via second path (2 calls)", async () => {
    llm.structured = async () => { throw new Error("json_validate_failed"); };
    llm.plain = async () => ({ content: "Here: " + JSON.stringify(validDiag) });
    const d = await diagnoseRoadblock(roadblockState, extractRoadblockEvidence(roadblockState));
    expect(llm.calls).toBe(2);
    expect(d.diagnosisType).toBe("CONCEPTUAL_DIFFICULTY");
  });
  it("AG-04 both paths fail (invalid JSON): deterministic fallback INSUFFICIENT_EVIDENCE, no throw", async () => {
    llm.structured = async () => { throw new Error("bad"); };
    llm.plain = async () => ({ content: "I cannot produce JSON" });
    const d = await diagnoseRoadblock(roadblockState, extractRoadblockEvidence(roadblockState));
    expect(d.diagnosisType).toBe("INSUFFICIENT_EVIDENCE");
    expect(d.confidence).toBeLessThanOrEqual(0.3);
    expect(d.evidence.length).toBeGreaterThan(0);
  });
  it("AG-05 plain-text output violating schema (bad enum) is rejected -> fallback", async () => {
    llm.structured = async () => { throw new Error("bad"); };
    llm.plain = async () => ({ content: JSON.stringify({ ...validDiag, diagnosisType: "INVENTED" }) });
    const d = await diagnoseRoadblock(roadblockState, extractRoadblockEvidence(roadblockState));
    expect(d.diagnosisType).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("AG-06 rate limit (HTTP 429): no second LLM attempt, straight to fallback (1 call)", async () => {
    llm.structured = async () => { throw Object.assign(new Error("Too many requests"), { status: 429 }); };
    llm.plain = async () => ({ content: JSON.stringify(validDiag) });
    const d = await diagnoseRoadblock(roadblockState, extractRoadblockEvidence(roadblockState));
    expect(llm.calls).toBe(1);
    expect(d.diagnosisType).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("AG-07 provider timeout/network error: fallback, student copy leaks no technical detail", async () => {
    llm.structured = async () => { throw new Error("ETIMEDOUT"); };
    llm.plain = async () => { throw new Error("ETIMEDOUT"); };
    const d = await diagnoseRoadblock(roadblockState, extractRoadblockEvidence(roadblockState));
    expect(d.studentSummary).not.toMatch(/LLM|rate|timeout|ETIMEDOUT|error/i);
  });
});

describe("Pedagogical planner – grounding and fallback", () => {
  const diag = { ...validDiag } as never;

  it("AG-08 healthy student: no LLM call; NO_ACTION when no postrequisite exists", async () => {
    const st = makeState({ mastery: mastery(95) });
    const r = await planPedagogicalAction(st, extractRoadblockEvidence(st), diag, emptyCtx);
    expect(llm.calls).toBe(0);
    expect(r.plan.action).toBe("NO_ACTION");
  });
  it("AG-09 LLM failure: deterministic fallback returns a valid-schema action; no throw", async () => {
    llm.structured = async () => { throw new Error("down"); };
    const r = await planPedagogicalAction(roadblockState, extractRoadblockEvidence(roadblockState), diag, emptyCtx);
    expect(["CONTINUE", "ACTIVE_RECALL", "PRACTISE", "REVISIT_PREREQUISITE"]).toContain(r.plan.action);
    expect(r.groundingNotes.join(" ")).toMatch(/deterministic fallback/);
  });
  it("AG-10 fallback with weak prerequisite selects REVISIT_PREREQUISITE using only validated target ids", async () => {
    llm.structured = async () => { throw new Error("down"); };
    const st = makeState({
      mastery: mastery(30),
      prerequisites: {
        submissionScoped: { prerequisiteLoIds: ["lo-a"], postrequisiteLoIds: [] },
        prerequisiteDetails: [{ loId: "lo-a", title: "Arrays", slug: null, masteryBySubmission: [{ submissionId: "s-a", submissionTitle: null, score: 20, level: "Beginner" }] }],
        coursePrerequisites: [],
      },
    });
    const ctx = {
      ...emptyCtx,
      prerequisiteTargets: [{ loId: "lo-a", title: "Arrays", slug: null, submissions: [{ submissionId: "s-a", submissionTitle: null, teacherId: null, teacherName: null, score: 20, level: "Beginner" as const }] }],
    };
    const r = await planPedagogicalAction(st, extractRoadblockEvidence(st), diag, ctx);
    expect(r.plan.action).toBe("REVISIT_PREREQUISITE");
    expect(r.plan.targetLoId).toBe("lo-a");
    expect(r.plan.targetSubmissionId).toBe("s-a");
  });
  it("AG-11 hallucinated REVISIT_PREREQUISITE target id is rejected and action downgraded", async () => {
    llm.structured = async () => ({
      action: "REVISIT_PREREQUISITE", targetLoId: "lo-FAKE", targetSubmissionId: "sub-FAKE", targetDeliveryTypeId: null,
      reason: "r", confidence: 0.9, supportingSignals: [], alternativesConsidered: [], studentReason: "Go back to the fake topic.",
    });
    const r = await planPedagogicalAction(roadblockState, extractRoadblockEvidence(roadblockState), diag, emptyCtx);
    expect(r.plan.action).not.toBe("REVISIT_PREREQUISITE");
    expect(r.plan.targetLoId).toBeNull();
    expect(r.plan.targetSubmissionId).toBeNull();
    expect(r.groundingNotes.length).toBeGreaterThan(0);
  });
  it("AG-12 hallucinated target on a no-target action (PRACTISE) is stripped", async () => {
    llm.structured = async () => ({
      action: "PRACTISE", targetLoId: "lo-FAKE", targetSubmissionId: "x", targetDeliveryTypeId: "y",
      reason: "r", confidence: 0.6, supportingSignals: [], alternativesConsidered: [], studentReason: "Practise a bit more.",
    });
    const r = await planPedagogicalAction(roadblockState, extractRoadblockEvidence(roadblockState), diag, emptyCtx);
    expect(r.plan.action).toBe("PRACTISE");
    expect([r.plan.targetLoId, r.plan.targetSubmissionId, r.plan.targetDeliveryTypeId]).toEqual([null, null, null]);
  });
  it("AG-13 valid grounded ADVANCE target is accepted unchanged", async () => {
    const ctx = {
      ...emptyCtx,
      postrequisiteTargets: [{ loId: "lo-next", title: "Trees", slug: null, submissions: [{ submissionId: "s-next", submissionTitle: null, teacherId: null, teacherName: null, score: null, level: null }] }],
    };
    llm.structured = async () => ({
      action: "ADVANCE", targetLoId: "lo-next", targetSubmissionId: "s-next", targetDeliveryTypeId: null,
      reason: "r", confidence: 0.8, supportingSignals: [], alternativesConsidered: [], studentReason: "Move on to Trees.",
    });
    const r = await planPedagogicalAction(roadblockState, extractRoadblockEvidence(roadblockState), diag, ctx);
    expect(r.plan.action).toBe("ADVANCE");
    expect(r.plan.targetLoId).toBe("lo-next");
  });
});

describe("Learning router (recommendation LLM) – fallback behaviour", () => {
  const input = {
    signals: {
      masteryScores: [
        { submissionId: "s1", score: 30, level: "Beginner", lastCalculatedAt: "2026-10-30T00:00:00Z" },
        { submissionId: "s2", score: 80, level: "Proficient", lastCalculatedAt: "2026-10-30T00:00:00Z" },
      ],
      recentVisits: [],
      quizTrajectories: [{ submissionId: "s1", scores: [30, 35], latestAt: "2026-10-30T00:00:00Z" }],
      contentStylePreferences: [],
    },
    availableSubmissions: [
      { id: "s1", title: "A", loTitle: "A", courseTitle: "C", courseSlug: "c", loId: "lo1", mastery: 30 },
      { id: "s2", title: "B", loTitle: "B", courseTitle: "C", courseSlug: "c", loId: "lo2", mastery: 80 },
    ],
    prerequisiteEdges: [{ sourceLoId: "lo2", targetLoId: "lo1" }],
  } as never;

  it("AG-14 total LLM failure still returns a schema-valid heuristic recommendation (no throw)", async () => {
    llm.structured = async () => { throw new Error("down"); };
    llm.plain = async () => { throw new Error("down"); };
    const r = await generateRecommendations(input);
    expect(r.sections.map((s) => s.sectionType)).toEqual(["continue", "next", "style", "recall", "feynman"]);
    expect(r.reasoning).toMatch(/deterministic fallback/);
    const { RecommendationOutputSchema } = await import("@/lib/ai/output-schemas");
    expect(RecommendationOutputSchema.safeParse(r).success).toBe(true);
  });
  it("AG-15 fallback only recommends submission ids that exist in availableSubmissions", async () => {
    llm.structured = async () => { throw new Error("down"); };
    llm.plain = async () => ({ content: "garbage" });
    const r = await generateRecommendations(input);
    const known = new Set(["s1", "s2"]);
    for (const sec of r.sections) for (const it of sec.items) expect(known.has(it.submissionId)).toBe(true);
  });
  it("AG-16 malformed first output is repaired on the second attempt", async () => {
    llm.structured = async () => { throw new Error("fc fail"); };
    let n = 0;
    llm.plain = async () => {
      n++;
      return n === 1
        ? { content: "not json" }
        : { content: JSON.stringify({ sections: [{ sectionType: "next", items: [{ submissionId: "s1", reason: "r", confidence: 0.8, priority: 1 }] }], reasoning: "ok" }) };
    };
    const r = await generateRecommendations(input);
    expect(r.reasoning).toBe("ok");
  });
});
