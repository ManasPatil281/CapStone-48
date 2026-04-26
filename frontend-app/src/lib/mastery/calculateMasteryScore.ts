type ContentBlock = {
  id: string;
  recommendedTimeSeconds: number | null;
};

type ContentBlockTime = {
  contentId: string;
  activeSeconds: number;
  idleSeconds: number;
};

type QuizAttempt = {
  scorePercentage: number | null;
  timestamp: string | null;
  randomizationMode: number | null;
};

export type MasteryLevel = "Beginner" | "Developing" | "Proficient" | "Mastered";

export type MasteryResult = {
  score: number;
  level: MasteryLevel;
  metadata: {
    contentScore: number | null;
    quizScore: number | null;
    idlePenalty: number;
    improvementBonus: number;
  };
};

function computeContentScore(blocks: ContentBlock[], blockTimes: ContentBlockTime[]): number | null {
  const timeMap = new Map(blockTimes.map((bt) => [bt.contentId, bt.activeSeconds]));

  const scored = blocks
    .filter((b) => b.recommendedTimeSeconds != null && b.recommendedTimeSeconds > 0)
    .map((b) => {
      const active = timeMap.get(b.id) ?? 0;
      const ratio = active / b.recommendedTimeSeconds!;

      if (ratio < 0.7) return (ratio / 0.7) * 70;
      if (ratio <= 1.3) return 100;
      return Math.max(60, 100 - (ratio - 1.3) * 20);
    });

  if (scored.length === 0) return null;

  const avg = scored.reduce((s, v) => s + v, 0) / scored.length;
  return Math.round(avg * 10) / 10;
}

function computeQuizScore(attempts: QuizAttempt[]): number | null {
  const scored = attempts.filter(
    (a): a is QuizAttempt & { scorePercentage: number } =>
      a.scorePercentage !== null && Number.isFinite(a.scorePercentage)
  );
  if (scored.length === 0) return null;

  const best = scored.reduce((prev, curr) =>
    curr.scorePercentage > prev.scorePercentage ? curr : prev
  );

  const mode = typeof best.randomizationMode === "number" ? best.randomizationMode : 0;
  const multiplier = mode === 2 ? 1.1 : mode === 1 ? 1.05 : 1.0;
  return Math.min(100, Math.round(best.scorePercentage * multiplier * 10) / 10);
}

function computeIdlePenalty(blockTimes: ContentBlockTime[]): number {
  const totalActive = blockTimes.reduce((s, bt) => s + bt.activeSeconds, 0);
  const totalIdle = blockTimes.reduce((s, bt) => s + bt.idleSeconds, 0);
  if (totalActive <= 0) return 0;
  return Math.min(8, Math.round((totalIdle / totalActive) * 8 * 10) / 10);
}

function computeImprovementBonus(attempts: QuizAttempt[]): number {
  const valid = attempts
    .filter(
      (a): a is QuizAttempt & { scorePercentage: number; timestamp: string } =>
        a.timestamp != null &&
        a.scorePercentage !== null &&
        Number.isFinite(a.scorePercentage)
    )
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (valid.length < 2) return 0;

  const first = valid[0].scorePercentage;
  const latest = valid[valid.length - 1].scorePercentage;
  if (latest <= first) return 0;

  return Math.min(5, Math.round(((latest - first) / 4) * 10) / 10);
}

function toLevel(score: number): MasteryLevel {
  if (score >= 85) return "Mastered";
  if (score >= 70) return "Proficient";
  if (score >= 40) return "Developing";
  return "Beginner";
}

export function calculateMasteryScore(params: {
  contentBlocks: ContentBlock[];
  contentBlockTimes: ContentBlockTime[];
  quizAttempts: QuizAttempt[];
}): MasteryResult {
  const { contentBlocks, contentBlockTimes, quizAttempts } = params;

  const cScore = computeContentScore(contentBlocks, contentBlockTimes);
  const qScore = computeQuizScore(quizAttempts);
  const idle = computeIdlePenalty(contentBlockTimes);
  const improvement = computeImprovementBonus(quizAttempts);

  let combined: number;
  if (cScore !== null && qScore !== null) {
    combined = cScore * 0.5 + qScore * 0.5;
  } else if (cScore !== null) {
    combined = cScore;
  } else if (qScore !== null) {
    combined = qScore * 0.75;
  } else {
    combined = 0;
  }

  const score = Math.round(Math.max(0, Math.min(100, combined - idle + improvement)) * 10) / 10;

  return {
    score,
    level: toLevel(score),
    metadata: {
      contentScore: cScore,
      quizScore: qScore,
      idlePenalty: idle,
      improvementBonus: improvement,
    },
  };
}
