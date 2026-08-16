/**
 * Autonomous Content Remediation Agent
 *
 * Triggered when a student fails a quiz or struggles with a concept.
 * Dynamically generates a tailored 3-card micro-lesson:
 * - Card 1: Core Misconception Fix (Direct, friendly correction)
 * - Card 2: Mental Model & Analogy (Simplified visual/analogical explanation)
 * - Card 3: Instant Check Question (Interactive verification question)
 */

import { getGroqChat } from "@/lib/ai/model";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const MicroLessonCardSchema = z.object({
  stepNumber: z.number().int().min(1).max(3),
  title: z.string().max(80),
  contentType: z.enum(["concept_fix", "mental_model", "check_question"]),
  markdownText: z.string().min(10),
  options: z.array(z.string()).optional().describe("Options if content_type is check_question"),
  correctOptionIndex: z.number().int().optional().describe("0-based index of correct option"),
});

const RemediationOutputSchema = z.object({
  targetTopic: z.string(),
  summaryOfGap: z.string(),
  cards: z.array(MicroLessonCardSchema).length(3),
});

export type RemediationMicroLesson = z.infer<typeof RemediationOutputSchema>;

export async function generateRemediationLesson(input: {
  loTitle: string;
  failedQuestions?: string[];
  userMasteryScore?: number;
}): Promise<RemediationMicroLesson> {
  const model = getGroqChat({ temperature: 0.35, maxTokens: 700 });
  const structuredModel = model.withStructuredOutput(RemediationOutputSchema);

  const prompt = [
    new SystemMessage(
      `You are an Autonomous Remediation Agent. A student has struggled with the learning object "${input.loTitle}".
Generate a custom 3-card micro-lesson designed to immediately resolve their misconception:
- Card 1: "Core Misconception Fix" — address the exact confusion directly and simply.
- Card 2: "Mental Model" — provide a vivid analogy or step-by-step intuition.
- Card 3: "Check Question" — a quick multiple-choice diagnostic question with 4 options and correct index to test understanding.`
    ),
    new HumanMessage(
      `Topic: ${input.loTitle}
Current Mastery: ${input.userMasteryScore ?? "Low"}%
Specific Weak Areas: ${input.failedQuestions?.join("; ") || "General conceptual gap"}`
    ),
  ];

  return await structuredModel.invoke(prompt);
}
