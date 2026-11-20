import { describe, it, expect } from "vitest";
import { buildLearningPath } from "@/lib/adaptive/pathEngine";
import { calculateMastery } from "@/lib/adaptive/masteryEngine";

const lo = (id: string, difficulty: number, depth?: number) =>
  ({ id, title: id, difficulty_level: difficulty, depth }) as never;

describe("Learning path engine (prerequisite-aware)", () => {
  it("PA-01 already-mastered prerequisites are excluded", () => {
    const path = buildLearningPath({
      target: lo("T", 3),
      prerequisites: [lo("A", 1, 1), lo("B", 2, 1)],
      masteredIds: new Set(["A"]),
    });
    expect(path.map((p) => p.id)).toEqual(["B", "T"]);
  });
  it("PA-02 ordered by depth, then difficulty; target always last", () => {
    const path = buildLearningPath({
      target: lo("T", 5),
      prerequisites: [lo("C", 1, 2), lo("A", 3, 1), lo("B", 1, 1)],
      masteredIds: new Set(),
    });
    expect(path.map((p) => p.id)).toEqual(["B", "A", "C", "T"]);
  });
  it("PA-03 no prerequisites: path is just the target", () => {
    expect(buildLearningPath({ target: lo("T", 1), prerequisites: [], masteredIds: new Set() }).map((p) => p.id)).toEqual(["T"]);
  });
  it("PA-04 all prerequisites mastered: path is just the target", () => {
    expect(
      buildLearningPath({ target: lo("T", 1), prerequisites: [lo("A", 1, 1)], masteredIds: new Set(["A"]) }).map((p) => p.id)
    ).toEqual(["T"]);
  });
  it("PA-05 same inputs (twice) produce the same path (deterministic)", () => {
    const args = { target: lo("T", 5), prerequisites: [lo("C", 1, 2), lo("A", 3, 1), lo("B", 1, 1)], masteredIds: new Set<string>() };
    expect(buildLearningPath(args)).toEqual(buildLearningPath(args));
  });
});

describe("Legacy simple mastery helper (lib/adaptive/masteryEngine.ts)", () => {
  it("LG-01 weights 0.6/0.2/0.2 and status thresholds", () => {
    expect(calculateMastery({ assessmentScore: 100, contentCompletion: 100, interactionQuality: 100 })).toEqual({ score: 100, status: "MASTERED" });
    expect(calculateMastery({ assessmentScore: 0, contentCompletion: 0, interactionQuality: 0 }).status).toBe("NOT_STARTED");
    expect(calculateMastery({ assessmentScore: 60, contentCompletion: 60, interactionQuality: 60 }).status).toBe("COMPLETED");
    expect(calculateMastery({ assessmentScore: 30, contentCompletion: 30, interactionQuality: 30 }).status).toBe("IN_PROGRESS");
  });
});
