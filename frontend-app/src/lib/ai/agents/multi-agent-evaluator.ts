/**
 * Multi-Agent Debate / Peer Review Evaluator
 *
 * Implements a 3-agent debate architecture for grading open-ended Feynman explanations:
 * 1. Agent A (Defender): Argues FOR the student, highlighting conceptual intuition, simplicity, and key valid points.
 * 2. Agent B (Strict Evaluator): Argues AGAINST, looking for technical inaccuracies, missing edge cases, and imprecise terminology.
 * 3. Agent C (Judge): Synthesizes both arguments into a balanced score (0-100), feedback, and key strengths/weaknesses.
 */

import { getGroqChat } from "@/lib/ai/model";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const DefenderSchema = z.object({
  strengths: z.array(z.string()).describe("Valid intuition or correct concepts in the explanation"),
  defenseArgument: z.string().describe("Argument for why the student demonstrated reasonable understanding"),
  proposedScore: z.number().int().min(0).max(100).describe("Optimistic score recommendation"),
});

const StrictEvaluatorSchema = z.object({
  weaknesses: z.array(z.string()).describe("Flaws, missing details, or misconceptions"),
  critiqueArgument: z.string().describe("Argument for why the explanation falls short of mastery"),
  proposedScore: z.number().int().min(0).max(100).describe("Critical score recommendation"),
});

const JudgeSchema = z.object({
  finalScore: z.number().int().min(0).max(100).describe("Final synthesized score (0-100)"),
  feedback: z.string().min(10).describe("Constructive feedback synthesizing both perspectives"),
  keyStrengths: z.array(z.string()).describe("Key strengths recognized by the defender"),
  keyAreasToImprove: z.array(z.string()).describe("Key areas to improve flagged by the critique"),
  debateSummary: z.string().describe("Brief 1-sentence summary of the consensus reached"),
});

export type MultiAgentDebateResult = z.infer<typeof JudgeSchema> & {
  defenderOpinion: z.infer<typeof DefenderSchema>;
  critiqueOpinion: z.infer<typeof StrictEvaluatorSchema>;
};

export async function runMultiAgentDebate(input: {
  loTitle: string;
  explanation: string;
}): Promise<MultiAgentDebateResult> {
  const model = getGroqChat({ temperature: 0.3, maxTokens: 400 });

  // 1. Agent A: Defender
  const defenderModel = model.withStructuredOutput(DefenderSchema);
  const defenderPrompt = [
    new SystemMessage(
      `You are the "Student Defender Agent". Your role is to look for valid intuition, effort, and conceptual clarity in the student's explanation of "${input.loTitle}". Highlight what the student got right, even if phrased informally.`
    ),
    new HumanMessage(`Explanation:\n${input.explanation}`),
  ];
  const defenderOpinion = await defenderModel.invoke(defenderPrompt);

  // 2. Agent B: Strict Evaluator
  const strictModel = model.withStructuredOutput(StrictEvaluatorSchema);
  const strictPrompt = [
    new SystemMessage(
      `You are the "Strict Academic Evaluator Agent". Your role is to critically analyze the explanation of "${input.loTitle}" for any technical inaccuracies, missing core concepts, or oversimplification that loses essential meaning.`
    ),
    new HumanMessage(`Explanation:\n${input.explanation}`),
  ];
  const critiqueOpinion = await strictModel.invoke(strictPrompt);

  // 3. Agent C: Judge
  const judgeModel = model.withStructuredOutput(JudgeSchema);
  const judgePrompt = [
    new SystemMessage(
      `You are the "Judge Agent". Two sub-agents have evaluated a student's explanation of "${input.loTitle}".
Synthesize their opposing perspectives into a fair, balanced final grade (0-100) and actionable feedback.

Defender proposed: ${defenderOpinion.proposedScore}% with argument: "${defenderOpinion.defenseArgument}"
Strict Evaluator proposed: ${critiqueOpinion.proposedScore}% with argument: "${critiqueOpinion.critiqueArgument}"`
    ),
    new HumanMessage(`Student Explanation:\n${input.explanation}`),
  ];
  const judgeResult = await judgeModel.invoke(judgePrompt);

  return {
    ...judgeResult,
    defenderOpinion,
    critiqueOpinion,
  };
}
