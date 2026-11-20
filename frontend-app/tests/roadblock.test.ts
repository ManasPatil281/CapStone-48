import { describe, it, expect } from "vitest";
import { extractRoadblockEvidence } from "@/lib/adaptive/roadblockEvidence";
import { makeState, hist, mastery } from "./fixtures";

const types = (s: ReturnType<typeof makeState>) => extractRoadblockEvidence(s).signals.map((x) => x.type);

describe("Roadblock evidence extraction (deterministic)", () => {
  it("RB-01 empty / no-evidence state yields no signals and no roadblock", () => {
    const e = extractRoadblockEvidence(makeState());
    expect(e.hasPotentialRoadblock).toBe(false);
    expect(e.signals).toHaveLength(0);
    expect(e.evidenceAvailability).toEqual({
      mastery: false, quiz: false, engagement: false, prerequisites: false, feynman: false,
    });
  });
  it("RB-02 healthy learner (mastery 90, quiz 90) yields no signals", () => {
    const e = extractRoadblockEvidence(
      makeState({
        mastery: mastery(90),
        quiz: { attemptCount: 2, bestScorePercentage: 92, latestScorePercentage: 90, latestAttemptAt: null, trend: "stable", history: hist([92, 90]) },
      })
    );
    expect(e.hasPotentialRoadblock).toBe(false);
  });
  it("RB-03 low submission mastery <40 is HIGH severity, 40-69 is MEDIUM", () => {
    const hi = extractRoadblockEvidence(makeState({ mastery: mastery(30) })).signals.find((s) => s.type === "MASTERY_LOW_SUBMISSION")!;
    const med = extractRoadblockEvidence(makeState({ mastery: mastery(55) })).signals.find((s) => s.type === "MASTERY_LOW_SUBMISSION")!;
    expect(hi.severity).toBe("high");
    expect(med.severity).toBe("medium");
  });
  it("RB-04 mastery exactly at 70 (Proficient) emits no low-mastery signal", () => {
    expect(types(makeState({ mastery: mastery(70) }))).not.toContain("MASTERY_LOW_SUBMISSION");
  });
  it("RB-05 absence of a mastery score is never treated as a negative finding", () => {
    expect(types(makeState({ mastery: mastery(null) }))).toEqual([]);
  });
  it("RB-06 latest quiz <40% emits QUIZ_LATEST_LOW_SCORE (high)", () => {
    const e = extractRoadblockEvidence(
      makeState({ quiz: { attemptCount: 1, bestScorePercentage: 30, latestScorePercentage: 30, latestAttemptAt: null, trend: "insufficient_data", history: hist([30]) } })
    );
    expect(e.signals.find((s) => s.type === "QUIZ_LATEST_LOW_SCORE")?.severity).toBe("high");
  });
  it("RB-07 strong then sudden failure triggers RECENT_FAILURE_AFTER_STRONG_PERFORMANCE", () => {
    const e = extractRoadblockEvidence(
      makeState({ quiz: { attemptCount: 2, bestScorePercentage: 85, latestScorePercentage: 40, latestAttemptAt: null, trend: "declining", history: hist([85, 40]) } })
    );
    const t = e.signals.map((s) => s.type);
    expect(t).toContain("QUIZ_RECENT_FAILURE_AFTER_STRONG_PERFORMANCE");
    expect(t).toContain("QUIZ_DECLINING_TREND");
    expect(t).toContain("QUIZ_LATEST_BELOW_BEST");
    expect(e.signals.find((s) => s.type === "QUIZ_LATEST_BELOW_BEST")?.severity).toBe("high"); // gap 45 >= 30
  });
  it("RB-08 3+ attempts never reaching 70 emits NO_PROFICIENCY", () => {
    expect(
      types(makeState({ quiz: { attemptCount: 3, bestScorePercentage: 60, latestScorePercentage: 60, latestAttemptAt: null, trend: "stable", history: hist([55, 58, 60]) } }))
    ).toContain("QUIZ_MULTIPLE_ATTEMPTS_NO_PROFICIENCY");
  });
  it("RB-09 high idle ratio (>1.5x) emits ENGAGEMENT_HIGH_IDLE_RATIO; 1.5x exactly does not", () => {
    const mk = (idle: number) =>
      makeState({ contentEngagement: { blocks: [], totalActiveSeconds: 100, totalIdleSeconds: idle } });
    expect(types(mk(200))).toContain("ENGAGEMENT_HIGH_IDLE_RATIO");
    expect(types(mk(150))).not.toContain("ENGAGEMENT_HIGH_IDLE_RATIO");
  });
  it("RB-10 repeated visits (>=4) with mastery <40 emits REPEATED_VISITS_LOW_MASTERY", () => {
    const s = makeState({
      mastery: mastery(30),
      visits: { totalVisits: 4, firstVisitAt: null, lastVisitAt: null, totalActiveSeconds: 0, totalIdleSeconds: 0 },
    });
    expect(types(s)).toContain("ENGAGEMENT_REPEATED_VISITS_LOW_MASTERY");
  });
  it("RB-11 lots of time alone is only a LOW-severity exposure signal, never high", () => {
    const e = extractRoadblockEvidence(
      makeState({
        contentEngagement: {
          blocks: [{ contentId: "c", title: null, deliveryTypeId: null, deliveryTypeName: null, activeSeconds: 1000, idleSeconds: 0, recommendedTimeSeconds: 100, firstViewedAt: null, lastViewedAt: null }],
          totalActiveSeconds: 1000, totalIdleSeconds: 0,
        },
      })
    );
    const sig = e.signals.find((s) => s.type === "ENGAGEMENT_HIGH_TIME_NO_IMPROVEMENT");
    expect(sig?.severity).toBe("low");
  });
  it("RB-12 weak prerequisite emits PREREQUISITE_LOW_MASTERY carrying relatedLoId", () => {
    const e = extractRoadblockEvidence(
      makeState({
        prerequisites: {
          submissionScoped: { prerequisiteLoIds: ["lo-a"], postrequisiteLoIds: [] },
          prerequisiteDetails: [{ loId: "lo-a", title: "Arrays", slug: "arrays", masteryBySubmission: [{ submissionId: "x", submissionTitle: null, score: 35, level: "Beginner" }] }],
          coursePrerequisites: [],
        },
      })
    );
    const sig = e.signals.find((s) => s.type === "PREREQUISITE_LOW_MASTERY")!;
    expect(sig.relatedLoId).toBe("lo-a");
    expect(sig.severity).toBe("high");
    expect(e.prerequisiteEvidence[0].evidenceStatus).toBe("concerning");
  });
  it("RB-13 prerequisite with no mastery rows is 'unavailable' and emits no signal", () => {
    const e = extractRoadblockEvidence(
      makeState({
        prerequisites: {
          submissionScoped: { prerequisiteLoIds: ["lo-a"], postrequisiteLoIds: [] },
          prerequisiteDetails: [{ loId: "lo-a", title: "Arrays", slug: null, masteryBySubmission: [] }],
          coursePrerequisites: [],
        },
      })
    );
    expect(e.prerequisiteEvidence[0].evidenceStatus).toBe("unavailable");
    expect(e.signals).toHaveLength(0);
  });
  it("RB-14 weak current + strong prerequisite flags a submission-specific difficulty", () => {
    const e = extractRoadblockEvidence(
      makeState({
        mastery: mastery(30),
        prerequisites: {
          submissionScoped: { prerequisiteLoIds: ["lo-a"], postrequisiteLoIds: [] },
          prerequisiteDetails: [{ loId: "lo-a", title: "Arrays", slug: null, masteryBySubmission: [{ submissionId: "x", submissionTitle: null, score: 90, level: "Mastered" }] }],
          coursePrerequisites: [],
        },
      })
    );
    expect(e.signals.map((s) => s.type)).toContain("PREREQUISITE_CURRENT_WEAK_PREREQ_STRONG");
  });
  it("RB-15 low Feynman (<70) and Feynman/quiz mismatch (>=20 gap) are detected", () => {
    const e = extractRoadblockEvidence(
      makeState({
        feynman: { score: 40, feedback: null, lastAttemptAt: null, misconceptions: null, source: null },
        quiz: { attemptCount: 1, bestScorePercentage: 90, latestScorePercentage: 90, latestAttemptAt: null, trend: "insufficient_data", history: hist([90]) },
      })
    );
    const t = e.signals.map((s) => s.type);
    expect(t).toContain("FEYNMAN_LOW_SCORE");
    expect(t).toContain("FEYNMAN_MISMATCH_WITH_PERFORMANCE");
  });
  it("RB-16 active-recall eligibility yields a LOW retention signal only with quiz evidence", () => {
    const withQuiz = makeState({
      revision: { activeRecallEligible: true, latestQualifyingAttemptAt: "2026-10-01" },
      quiz: { attemptCount: 1, bestScorePercentage: 80, latestScorePercentage: 80, latestAttemptAt: null, trend: "insufficient_data", history: hist([80]) },
    });
    expect(extractRoadblockEvidence(withQuiz).signals.find((s) => s.type === "RETENTION_RISK_ACTIVE_RECALL_DUE")?.severity).toBe("low");
    const noQuiz = makeState({ revision: { activeRecallEligible: true, latestQualifyingAttemptAt: null } });
    expect(types(noQuiz)).not.toContain("RETENTION_RISK_ACTIVE_RECALL_DUE");
  });
  it("RB-17 extraction is a pure function: same state -> same signals; input not mutated", () => {
    const s = makeState({ mastery: mastery(20) });
    const snap = JSON.stringify(s);
    const a = extractRoadblockEvidence(s).signals;
    const b = extractRoadblockEvidence(s).signals;
    expect(a).toEqual(b);
    expect(JSON.stringify(s)).toBe(snap);
  });
});
