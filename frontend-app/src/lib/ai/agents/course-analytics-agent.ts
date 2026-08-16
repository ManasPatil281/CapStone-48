/**
 * Instructor Course Analytics Agent
 *
 * Scans course-wide student mastery metrics, visit idle ratios, and quiz attempt curves.
 * Flags problematic Learning Objects and provides actionable pedagogical recommendations.
 */

import { getGroqChat } from "@/lib/ai/model";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const InsightItemSchema = z.object({
  loId: z.string(),
  loTitle: z.string(),
  severity: z.enum(["CRITICAL", "WARNING", "INFO"]),
  issueDescription: z.string().describe("e.g. '70% of students drop in mastery at Node Deletion'"),
  suggestedAction: z.string().describe("e.g. 'Add a worked example or visual flowchart block'"),
  impactEstimate: z.string().describe("Estimated improvement if action is taken"),
});

const CourseAnalyticsOutputSchema = z.object({
  courseHealthScore: z.number().int().min(0).max(100),
  summary: z.string(),
  flaggedInsights: z.array(InsightItemSchema),
  topPerformingLOs: z.array(z.string()),
});

export type CourseAnalyticsReport = z.infer<typeof CourseAnalyticsOutputSchema>;

export async function analyzeCourseAnalytics(input: {
  courseTitle: string;
  loStats: Array<{
    loId: string;
    title: string;
    avgMastery: number;
    avgQuizScore: number;
    idleRatio: number;
    studentCount: number;
  }>;
}): Promise<CourseAnalyticsReport> {
  const model = getGroqChat({ temperature: 0.3, maxTokens: 1200 });
  const structuredModel = model.withStructuredOutput(CourseAnalyticsOutputSchema, { method: "jsonMode" });

  const formattedStats = input.loStats
    .map(
      (s) =>
        `- "${s.title}" (ID: ${s.loId}): Avg Mastery ${s.avgMastery}%, Avg Quiz ${s.avgQuizScore}%, Idle Ratio ${s.idleRatio.toFixed(2)}, Students ${s.studentCount}`
    )
    .join("\n");

  const prompt = [
    new SystemMessage(
      `You are an Instructor Analytics Agent for "${input.courseTitle}".\n\nOUTPUT IN STRICT JSON: Produce a single JSON object that exactly matches the Zod schema provided to you. Do NOT output any explanatory text, markdown, or trailing commas. Ensure valid JSON parsable by a strict JSON parser. The object must contain: \n- courseHealthScore: integer 0-100\n- summary: short 1-2 sentence executive summary\n- flaggedInsights: array of objects with keys loId, loTitle, severity (CRITICAL|WARNING|INFO), issueDescription, suggestedAction, impactEstimate\n- topPerformingLOs: array of LO title strings\n\nIf there are fewer than 3 flagged insights, still return an array (possibly empty).`
    ),
    new HumanMessage(`Course Metrics:\n${formattedStats}`),
  ];

  try {
    return await structuredModel.invoke(prompt);
  } catch (error) {
    console.warn("[analyzeCourseAnalytics] Structured model invoke failed, returning deterministic fallback:", error);

    // Deterministic fallback: compute weighted average health, flag clear issues
    const totalStudents = input.loStats.reduce((acc, s) => acc + (s.studentCount || 1), 0);
    const weightedSum = input.loStats.reduce((acc, s) => acc + (s.avgMastery || 0) * (s.studentCount || 1), 0);
    const courseHealthScore = totalStudents > 0 ? Math.round(weightedSum / totalStudents) : 60;

    const flaggedInsights = input.loStats
      .filter((s) => s.avgMastery < 65 || s.idleRatio > 1.0)
      .map((s) => {
        const severity = s.avgMastery < 50 || s.idleRatio > 1.5 ? "CRITICAL" : "WARNING";
        const issueDescription = s.avgMastery < 65
          ? `${Math.round(100 - s.avgMastery)}% of students underperform on ${s.title}`
          : `High idle ratio (${s.idleRatio.toFixed(2)}) on ${s.title}`;
        const suggestedAction = s.avgMastery < 65
          ? "Add a worked example, step-by-step trace, or interactive exercise."
          : "Add interactive checks/quizzes and shorten passive content segments.";
        const impactEstimate = s.avgMastery < 65 ? "Estimated improvement of ~20-30%" : "Estimated improvement of ~8-12%";

        return {
          loId: s.loId,
          loTitle: s.title,
          severity: severity as "CRITICAL" | "WARNING" | "INFO",
          issueDescription,
          suggestedAction,
          impactEstimate,
        };
      });

    const topPerformingLOs = input.loStats
      .slice()
      .sort((a, b) => (b.avgMastery || 0) - (a.avgMastery || 0))
      .slice(0, 3)
      .map((s) => s.title);

    return {
      courseHealthScore,
      summary: `Overall course health score is ${courseHealthScore}. Some learning objects show low mastery and high idle ratios requiring targeted remediation.`,
      flaggedInsights,
      topPerformingLOs,
    };
  }
}
