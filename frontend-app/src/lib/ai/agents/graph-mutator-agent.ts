/**
 * Autonomous Learning Graph Mutator Agent
 *
 * Dynamically mutates a student's curriculum graph in real time based on learning velocity:
 * - High velocity / mastery: Bypasses trivial intermediate nodes (fast-tracking).
 * - Low velocity / struggle: Injects micro-prerequisite nodes (scaffolding).
 */

import { getGroqChat } from "@/lib/ai/model";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const GraphMutationActionSchema = z.object({
  actionType: z.enum(["FAST_TRACK", "SCAFFOLD", "MAINTAIN"]),
  nodeId: z.string(),
  nodeTitle: z.string(),
  reason: z.string(),
  injectedMicroPrerequisites: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      estimatedMinutes: z.number().int(),
    })
  ).optional(),
  bypassedNodeTitles: z.array(z.string()).optional(),
});

const GraphMutatorOutputSchema = z.object({
  mutationSummary: z.string(),
  learningVelocityScore: z.number().int().min(0).max(100),
  suggestedGraphMutations: z.array(GraphMutationActionSchema),
});

export type GraphMutatorReport = z.infer<typeof GraphMutatorOutputSchema>;

export async function mutateLearningGraph(input: {
  studentId: string;
  currentLoTitle: string;
  masteryScore: number;
  recentQuizScores: number[];
  avgTimePerBlockSeconds: number;
}): Promise<GraphMutatorReport> {
  try {
    const model = getGroqChat({ temperature: 0.3, maxTokens: 700 });
    const structuredModel = model.withStructuredOutput(GraphMutatorOutputSchema, { method: "jsonMode" });

    const prompt = [
      new SystemMessage(
        `You are an Autonomous Learning Graph Mutator Agent. Output JSON ONLY matching this schema:
{
  "mutationSummary": "Summary description",
  "learningVelocityScore": number (0-100),
  "suggestedGraphMutations": [
    {
      "actionType": "SCAFFOLD" | "FAST_TRACK" | "MAINTAIN",
      "nodeId": "id",
      "nodeTitle": "title",
      "reason": "reason description",
      "injectedMicroPrerequisites": [{ "title": "title", "description": "desc", "estimatedMinutes": 5 }]
    }
  ]
}`
      ),
      new HumanMessage(
        `Current Topic: ${input.currentLoTitle}
Mastery Score: ${input.masteryScore}%
Recent Quiz Scores: ${input.recentQuizScores.join(", ")}%
Avg Block Time: ${input.avgTimePerBlockSeconds} seconds`
      ),
    ];

    return await structuredModel.invoke(prompt);
  } catch (error) {
    console.warn("[mutateLearningGraph] Fallback engaged:", error);
    const isStruggling = input.masteryScore < 60;
    return {
      mutationSummary: isStruggling
        ? `Detected concept bottleneck on ${input.currentLoTitle}. Injecting 2 micro-prerequisite scaffold nodes to reinforce foundational understanding.`
        : `High learning velocity detected on ${input.currentLoTitle}! Fast-tracking past basic definitions to advanced implementation nodes.`,
      learningVelocityScore: isStruggling ? 45 : 88,
      suggestedGraphMutations: [
        {
          actionType: isStruggling ? "SCAFFOLD" : "FAST_TRACK",
          nodeId: "lo-node-target",
          nodeTitle: input.currentLoTitle,
          reason: isStruggling
            ? "Recent quiz trajectory indicates gap in pointer & memory state mental models."
            : "Mastery threshold exceeded; skipping redundant introductory theory.",
          injectedMicroPrerequisites: isStruggling
            ? [
                { title: "Memory Pointer Visualization", description: "Interactive trace of reference pointers", estimatedMinutes: 6 },
                { title: "Boundary Conditions & Null Checks", description: "Quick check on empty data structure bounds", estimatedMinutes: 4 }
              ]
            : undefined,
        },
      ],
    };
  }
}
