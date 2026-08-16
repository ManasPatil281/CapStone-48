/**
 * Multi-Agent Technical Viva / Mock Interviewer Agent Panel
 *
 * Technical Interviewer: Asks core conceptual and implementation questions.
 * Bar Raiser: Pushes back on edge cases, time/space complexity, and failure modes.
 */

import { getGroqChat } from "@/lib/ai/model";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const InterviewTurnSchema = z.object({
  interviewerQuestion: z.string().describe("Main technical question from the primary interviewer"),
  barRaiserPushback: z.string().describe("Challenging edge-case pushback from the Bar Raiser agent"),
  topicFocus: z.string(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  evaluationCriteria: z.array(z.string()),
});

export type MockInterviewTurn = z.infer<typeof InterviewTurnSchema>;

export async function generateVivaQuestion(input: {
  loTitle: string;
  previousTurnCount?: number;
  studentAnswerHistory?: string[];
}): Promise<MockInterviewTurn> {
  try {
    const model = getGroqChat({ temperature: 0.4, maxTokens: 600 });
    const structuredModel = model.withStructuredOutput(InterviewTurnSchema, { method: "jsonMode" });

    const prompt = [
      new SystemMessage(
        `You are a Dual-Agent Technical Viva Panel for "${input.loTitle}".
Return JSON ONLY matching:
{
  "interviewerQuestion": "Core technical question",
  "barRaiserPushback": "Edge-case pushback question",
  "topicFocus": "${input.loTitle}",
  "difficulty": "MEDIUM",
  "evaluationCriteria": ["Correct algorithm choice", "Time/space complexity awareness", "Edge case handling"]
}`
      ),
      new HumanMessage(`Topic: ${input.loTitle}\nTurn: ${(input.previousTurnCount || 0) + 1}`),
    ];

    return await structuredModel.invoke(prompt);
  } catch (error) {
    console.warn("[generateVivaQuestion] Fallback engaged:", error);
    return {
      interviewerQuestion: `Explain how ${input.loTitle} manages internal state during push/pop operations, and detail its worst-case time complexity.`,
      barRaiserPushback: `What happens when memory is constrained or the underlying array needs resizing? How does amortized O(1) analysis hold up under high burst loads?`,
      topicFocus: input.loTitle,
      difficulty: "MEDIUM",
      evaluationCriteria: [
        "LIFO/FIFO state semantics",
        "Amortized O(1) vs worst-case O(N) reallocation",
        "Null pointer and empty bounds checks"
      ],
    };
  }
}
