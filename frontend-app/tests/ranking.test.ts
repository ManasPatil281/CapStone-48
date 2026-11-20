import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeState, mastery, hist } from "./fixtures";

/* Fake Supabase: returns canned rows per table. */
const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      ["select", "eq", "in", "order", "limit"].forEach((m) => (chain[m] = self));
      (chain as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: db.tables[table] ?? [], error: null });
      return chain;
    },
  }),
}));

const states = vi.hoisted(() => ({ byId: {} as Record<string, unknown> }));
vi.mock("@/lib/adaptive/studentLearningState", () => ({
  buildStudentLearningState: async (_stu: string, id: string) => states.byId[id] ?? null,
}));

import { gatherRankedCandidates } from "@/lib/adaptive/candidateSubmissions";

const healthy = (id: string) => makeState({ submissionId: id, mastery: mastery(95) });
const weak = (id: string) => makeState({ submissionId: id, mastery: mastery(20) }); // MASTERY_LOW_SUBMISSION (high)
const mid = (id: string) => makeState({ submissionId: id, mastery: mastery(55) }); // medium

beforeEach(() => {
  db.tables = {};
  states.byId = {};
});

describe("Deterministic candidate ranking", () => {
  it("RK-01 higher-severity candidate ranks first even if less recently active", async () => {
    db.tables.student_submission_mastery = [
      { submission_id: "healthy", last_calculated_at: "2026-10-30T00:00:00Z" },
      { submission_id: "weak", last_calculated_at: "2026-10-01T00:00:00Z" },
    ];
    states.byId = { healthy: healthy("healthy"), weak: weak("weak") };
    const { candidates } = await gatherRankedCandidates("stu-1");
    expect(candidates.map((c) => c.submissionId)).toEqual(["weak", "healthy"]);
    expect(candidates[0].severityScore).toBeGreaterThanOrEqual(100);
    expect(candidates[1].severityScore).toBe(0);
  });
  it("RK-02 severity weights: high=100 dominates any number of mediums", async () => {
    db.tables.student_submission_mastery = [
      { submission_id: "high", last_calculated_at: "2026-10-01T00:00:00Z" },
      { submission_id: "mid", last_calculated_at: "2026-10-30T00:00:00Z" },
    ];
    states.byId = { high: weak("high"), mid: mid("mid") };
    const { candidates } = await gatherRankedCandidates("stu-1");
    expect(candidates[0].submissionId).toBe("high");
    expect(candidates[0].severityScore).toBeGreaterThan(candidates[1].severityScore);
  });
  it("RK-03 equal severity: most recent activity wins the tie-break", async () => {
    db.tables.student_submission_mastery = [
      { submission_id: "old", last_calculated_at: "2026-09-01T00:00:00Z" },
      { submission_id: "new", last_calculated_at: "2026-10-30T00:00:00Z" },
    ];
    states.byId = { old: healthy("old"), new: healthy("new") };
    const { candidates } = await gatherRankedCandidates("stu-1");
    expect(candidates.map((c) => c.submissionId)).toEqual(["new", "old"]);
  });
  it("RK-04 recent visit timestamp counts as activity for the tie-break", async () => {
    db.tables.student_submission_mastery = [
      { submission_id: "a", last_calculated_at: "2026-09-01T00:00:00Z" },
      { submission_id: "b", last_calculated_at: "2026-09-02T00:00:00Z" },
    ];
    db.tables.student_submission_visit = [{ submission_id: "a", started_at: "2026-10-29T00:00:00Z", ended_at: "2026-10-29T01:00:00Z" }];
    states.byId = { a: healthy("a"), b: healthy("b") };
    const { candidates, recentVisitRows } = await gatherRankedCandidates("stu-1");
    expect(candidates[0].submissionId).toBe("a");
    expect(recentVisitRows).toHaveLength(1);
  });
  it("RK-05 at most 8 candidates are considered (bounded cost)", async () => {
    db.tables.student_submission_mastery = Array.from({ length: 15 }, (_, i) => ({
      submission_id: `s${i}`, last_calculated_at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    states.byId = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`s${i}`, healthy(`s${i}`)]));
    const { candidates } = await gatherRankedCandidates("stu-1");
    expect(candidates).toHaveLength(8);
  });
  it("RK-06 unresolvable submissions are dropped; student with no activity gets an empty list", async () => {
    db.tables.student_submission_mastery = [{ submission_id: "ghost", last_calculated_at: "2026-10-30T00:00:00Z" }];
    expect((await gatherRankedCandidates("stu-1")).candidates).toHaveLength(0);
    db.tables = {};
    expect((await gatherRankedCandidates("stu-2")).candidates).toHaveLength(0);
  });
  it("RK-07 ranking is deterministic across 50 repeated runs", async () => {
    db.tables.student_submission_mastery = ["a", "b", "c", "d"].map((id, i) => ({
      submission_id: id, last_calculated_at: `2026-10-${10 + i}T00:00:00Z`,
    }));
    states.byId = {
      a: weak("a"),
      b: mid("b"),
      c: makeState({ submissionId: "c", quiz: { attemptCount: 1, bestScorePercentage: 20, latestScorePercentage: 20, latestAttemptAt: null, trend: "insufficient_data", history: hist([20]) } }),
      d: healthy("d"),
    };
    const first = (await gatherRankedCandidates("stu-1")).candidates.map((c) => c.submissionId).join(",");
    for (let i = 0; i < 50; i++) {
      expect((await gatherRankedCandidates("stu-1")).candidates.map((c) => c.submissionId).join(",")).toBe(first);
    }
  });
});
