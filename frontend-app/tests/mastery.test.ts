import { describe, it, expect } from "vitest";
import {
  calculateMasteryScore,
  QUIZ_KNOWLEDGE_WEIGHT,
  FEYNMAN_KNOWLEDGE_WEIGHT,
} from "@/lib/mastery/calculateMasteryScore";

const T = (d: number) => `2026-10-${String(d).padStart(2, "0")}T00:00:00Z`;
// scores listed oldest -> newest
const quiz = (scores: number[], mode: number | null = 0) =>
  scores.map((s, i) => ({ scorePercentage: s, timestamp: T(10 + i), randomizationMode: mode }));
const fey = (scores: number[]) => scores.map((s, i) => ({ score: s, timestamp: T(10 + i) }));
const base = { contentBlocks: [], contentBlockTimes: [] };

describe("Mastery engine (current-mastery-v2)", () => {
  it("MS-01 returns null (unknown) when there is no knowledge evidence", () => {
    expect(calculateMasteryScore({ ...base, quizAttempts: [], feynmanAttempts: [] })).toBeNull();
  });
  it("MS-02 ignores attempts with null/NaN scores or missing timestamps", () => {
    const r = calculateMasteryScore({
      ...base,
      quizAttempts: [
        { scorePercentage: null, timestamp: T(1), randomizationMode: 0 },
        { scorePercentage: NaN, timestamp: T(2), randomizationMode: 0 },
        { scorePercentage: 80, timestamp: null, randomizationMode: 0 },
      ],
      feynmanAttempts: [],
    });
    expect(r).toBeNull();
  });
  it("MS-03 single quiz attempt: score equals that attempt", () => {
    expect(calculateMasteryScore({ ...base, quizAttempts: quiz([72]), feynmanAttempts: [] })!.score).toBe(72);
  });
  it("MS-04 five attempts use weights 5:4:3:2:1 (newest = 5)", () => {
    // (100*5+40*4+30*3+20*2+10*1)/15 = 800/15 = 53.3
    const r = calculateMasteryScore({ ...base, quizAttempts: quiz([10, 20, 30, 40, 100]), feynmanAttempts: [] })!;
    expect(r.score).toBe(53.3);
    expect(r.metadata.quizAttemptCountUsed).toBe(5);
  });
  it("MS-05 three attempts use weights 5:4:3 normalised by 12", () => {
    // (90*5+60*4+30*3)/12 = 65
    expect(calculateMasteryScore({ ...base, quizAttempts: quiz([30, 60, 90]), feynmanAttempts: [] })!.score).toBe(65);
  });
  it("MS-06 only the 5 most recent attempts count (old peak fades out)", () => {
    const r = calculateMasteryScore({ ...base, quizAttempts: quiz([100, 20, 20, 20, 20, 20]), feynmanAttempts: [] })!;
    expect(r.score).toBe(20);
    expect(r.metadata.quizAttemptCountUsed).toBe(5);
  });
  it("MS-07 recent attempts weigh more than old ones (order matters)", () => {
    const improving = calculateMasteryScore({ ...base, quizAttempts: quiz([20, 40, 60, 80, 100]), feynmanAttempts: [] })!.score;
    const declining = calculateMasteryScore({ ...base, quizAttempts: quiz([100, 80, 60, 40, 20]), feynmanAttempts: [] })!.score;
    expect(improving).toBeGreaterThan(declining);
  });
  it("MS-08 input order does not matter (sorted by timestamp internally)", () => {
    const q = quiz([10, 50, 90]);
    const a = calculateMasteryScore({ ...base, quizAttempts: q, feynmanAttempts: [] })!.score;
    const b = calculateMasteryScore({ ...base, quizAttempts: [...q].reverse(), feynmanAttempts: [] })!.score;
    expect(a).toBe(b);
  });
  it("MS-09 quiz + Feynman blend is 60:40", () => {
    expect(QUIZ_KNOWLEDGE_WEIGHT).toBe(0.6);
    expect(FEYNMAN_KNOWLEDGE_WEIGHT).toBe(0.4);
    const r = calculateMasteryScore({ ...base, quizAttempts: quiz([80]), feynmanAttempts: fey([50]) })!;
    expect(r.score).toBe(68); // 0.6*80 + 0.4*50
  });
  it("MS-10 Feynman-only evidence is used as-is (no missing-signal penalty)", () => {
    expect(calculateMasteryScore({ ...base, quizAttempts: [], feynmanAttempts: fey([77]) })!.score).toBe(77);
  });
  it("MS-11 randomisation multipliers 1.05 / 1.10 applied and capped at 100", () => {
    expect(calculateMasteryScore({ ...base, quizAttempts: quiz([80], 1), feynmanAttempts: [] })!.score).toBe(84);
    expect(calculateMasteryScore({ ...base, quizAttempts: quiz([80], 2), feynmanAttempts: [] })!.score).toBe(88);
    expect(calculateMasteryScore({ ...base, quizAttempts: quiz([98], 2), feynmanAttempts: [] })!.score).toBe(100);
  });
  it("MS-12 final score is clamped to 0-100", () => {
    const hi = calculateMasteryScore({ ...base, quizAttempts: quiz([100], 2), feynmanAttempts: fey([100]) })!;
    expect(hi.score).toBeLessThanOrEqual(100);
    const lo = calculateMasteryScore({
      contentBlocks: [{ id: "b", recommendedTimeSeconds: 600 }],
      contentBlockTimes: [{ contentId: "b", activeSeconds: 1, idleSeconds: 5000 }],
      quizAttempts: quiz([0]),
      feynmanAttempts: [],
    })!;
    expect(lo.score).toBe(0);
  });
  it("MS-13 level boundaries: 39/40, 69/70, 84/85", () => {
    const lvl = (s: number) => calculateMasteryScore({ ...base, quizAttempts: quiz([s]), feynmanAttempts: [] })!.level;
    expect(lvl(0)).toBe("Beginner");
    expect(lvl(39)).toBe("Beginner");
    expect(lvl(40)).toBe("Developing");
    expect(lvl(69)).toBe("Developing");
    expect(lvl(70)).toBe("Proficient");
    expect(lvl(84)).toBe("Proficient");
    expect(lvl(85)).toBe("Mastered");
    expect(lvl(100)).toBe("Mastered");
  });
  it("MS-14 engagement modifier is never positive, even for huge active time", () => {
    const r = calculateMasteryScore({
      contentBlocks: [{ id: "b", recommendedTimeSeconds: 60 }],
      contentBlockTimes: [{ contentId: "b", activeSeconds: 100000, idleSeconds: 0 }],
      quizAttempts: quiz([60]),
      feynmanAttempts: [],
    })!;
    expect(r.metadata.engagementModifier).toBeLessThanOrEqual(0);
    expect(r.score).toBe(60);
  });
  it("MS-15 engagement deduction is bounded at -5", () => {
    const r = calculateMasteryScore({
      contentBlocks: [{ id: "b", recommendedTimeSeconds: 1000 }],
      contentBlockTimes: [{ contentId: "b", activeSeconds: 0, idleSeconds: 99999 }],
      quizAttempts: quiz([90]),
      feynmanAttempts: [],
    })!;
    expect(r.metadata.engagementModifier).toBeGreaterThanOrEqual(-5);
    expect(r.score).toBeGreaterThanOrEqual(85);
  });
  it("MS-15b worst-case engagement deduction is exactly -5 (2 under-exposure + 3 idle)", () => {
    const r = calculateMasteryScore({
      contentBlocks: [{ id: "b", recommendedTimeSeconds: 1000 }],
      contentBlockTimes: [{ contentId: "b", activeSeconds: 1, idleSeconds: 99999 }],
      quizAttempts: quiz([90]),
      feynmanAttempts: [],
    })!;
    expect(r.metadata.engagementModifier).toBe(-5);
    expect(r.score).toBe(85);
  });
  it("MS-16 time-on-page alone cannot create a mastery score", () => {
    const r = calculateMasteryScore({
      contentBlocks: [{ id: "b", recommendedTimeSeconds: 60 }],
      contentBlockTimes: [{ contentId: "b", activeSeconds: 99999, idleSeconds: 0 }],
      quizAttempts: [],
      feynmanAttempts: [],
    });
    expect(r).toBeNull();
  });
  it("MS-17 under-exposure penalty max is 2; idle penalty max is 3", () => {
    const under = calculateMasteryScore({
      contentBlocks: [{ id: "b", recommendedTimeSeconds: 1000 }],
      contentBlockTimes: [{ contentId: "b", activeSeconds: 0, idleSeconds: 0 }],
      quizAttempts: quiz([80]),
      feynmanAttempts: [],
    })!;
    expect(under.metadata.engagementModifier).toBe(-2);
    const idle = calculateMasteryScore({
      contentBlocks: [],
      contentBlockTimes: [{ contentId: "b", activeSeconds: 10, idleSeconds: 1000 }],
      quizAttempts: quiz([80]),
      feynmanAttempts: [],
    })!;
    expect(idle.metadata.engagementModifier).toBe(-3);
  });
  it("MS-18 metadata reports engine version and components", () => {
    const r = calculateMasteryScore({ ...base, quizAttempts: quiz([80, 90]), feynmanAttempts: fey([70]) })!;
    expect(r.metadata.engineVersion).toBe("current-mastery-v2");
    expect(r.metadata.quizAttemptCountUsed).toBe(2);
    expect(r.metadata.feynmanAttemptCountUsed).toBe(1);
    expect(r.metadata.finalScore).toBe(r.score);
  });
  it("MS-19 deterministic: identical input gives identical output (100 runs)", () => {
    const input = { ...base, quizAttempts: quiz([33, 66, 99, 12, 45]), feynmanAttempts: fey([50, 60]) };
    const first = JSON.stringify(calculateMasteryScore(input));
    for (let i = 0; i < 100; i++) expect(JSON.stringify(calculateMasteryScore(input))).toBe(first);
  });
});
