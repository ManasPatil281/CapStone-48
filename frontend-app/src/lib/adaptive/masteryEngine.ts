export type MasteryInputs = {
  assessmentScore: number;
  contentCompletion: number;
  interactionQuality: number;
};

export type MasteryResult = {
  score: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "MASTERED";
};

export function calculateMastery({ assessmentScore, contentCompletion, interactionQuality }: MasteryInputs): MasteryResult {
  const score = Number((assessmentScore * 0.6 + contentCompletion * 0.2 + interactionQuality * 0.2).toFixed(2));

  let status: MasteryResult["status"] = "IN_PROGRESS";
  if (score > 80) {
    status = "MASTERED";
  } else if (score > 50) {
    status = "COMPLETED";
  } else if (score <= 0) {
    status = "NOT_STARTED";
  }

  return { score, status };
}
