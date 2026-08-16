/**
 * Spaced Repetition Scheduler Agent
 *
 * Models retention decay based on:
 * - Days since last quiz / visit
 * - Historical quiz score stability
 * - Concept difficulty level
 *
 * Recommends optimal revision intervals (e.g. 1-day, 3-day, 7-day, 14-day checks).
 */

import { getGroqChat } from "@/lib/ai/model";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const ScheduleItemSchema = z.object({
  submissionId: z.string(),
  loTitle: z.string(),
  retentionEstimatePercent: z.number().int().min(0).max(100),
  recommendedAction: z.enum(["REVISE_NOW", "SCHEDULE_SOON", "RETAINED"]),
  nextRevisionDays: z.number().int(),
  reason: z.string(),
});

const SpacedRepetitionOutputSchema = z.object({
  urgentReviews: z.array(ScheduleItemSchema),
  upcomingReviews: z.array(ScheduleItemSchema),
  overallRetentionScore: z.number().int().min(0).max(100),
});

export type SpacedRepetitionSchedule = z.infer<typeof SpacedRepetitionOutputSchema>;

export async function calculateSpacedRepetition(input: {
  studentId: string;
  items: Array<{
    submissionId: string;
    loTitle: string;
    lastAttemptDaysAgo: number;
    lastScore: number;
    attemptCount: number;
  }>;
}): Promise<SpacedRepetitionSchedule> {
  const model = getGroqChat({ temperature: 0.3, maxTokens: 600 });
  const structuredModel = model.withStructuredOutput(SpacedRepetitionOutputSchema);

  const formattedItems = input.items
    .map(
      (item) =>
        `- LO: "${item.loTitle}" (Submission: ${item.submissionId.slice(0, 8)}…): Last score ${item.lastScore}%, ${item.lastAttemptDaysAgo} days ago, ${item.attemptCount} total attempt(s)`
    )
    .join("\n");

  const prompt = [
    new SystemMessage(
      `You are a Spaced Repetition Scheduler Agent. Calculate memory retention decay and schedule optimal review times for a student.`
    ),
    new HumanMessage(`Completed Learning Objects:\n${formattedItems}`),
  ];

  return await structuredModel.invoke(prompt);
}
