import type { StudentLearningState } from "@/lib/adaptive/studentLearningState";

/** A healthy, evidence-free baseline state. Tests override only what they need. */
export function makeState(over: Partial<StudentLearningState> = {}): StudentLearningState {
  return {
    generatedAt: "2026-10-30T00:00:00.000Z",
    studentId: "stu-1",
    submissionId: "sub-1",
    course: null,
    learningObject: null,
    mastery: null,
    loMastery: null,
    feynman: null,
    quiz: {
      attemptCount: 0,
      bestScorePercentage: null,
      latestScorePercentage: null,
      latestAttemptAt: null,
      trend: "insufficient_data",
      history: [],
    },
    visits: { totalVisits: 0, firstVisitAt: null, lastVisitAt: null, totalActiveSeconds: 0, totalIdleSeconds: 0 },
    contentEngagement: { blocks: [], totalActiveSeconds: 0, totalIdleSeconds: 0 },
    deliveryTypeEngagement: [],
    prerequisites: {
      submissionScoped: { prerequisiteLoIds: [], postrequisiteLoIds: [] },
      prerequisiteDetails: [],
      coursePrerequisites: [],
    },
    revision: { activeRecallEligible: false, latestQualifyingAttemptAt: null },
    dataCompleteness: {
      hasMastery: false,
      hasQuizAttempts: false,
      hasVisits: false,
      hasContentEngagement: false,
      hasPrerequisiteEdges: false,
    },
    ...over,
  };
}

export const hist = (scores: number[]) =>
  scores.map((s, i) => ({
    scorePercentage: s,
    correctCount: null,
    totalQuestions: null,
    submittedAt: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`,
  }));

export const mastery = (score: number | null) => ({
  score,
  level: null,
  lastCalculatedAt: null,
  metadata: null,
});
