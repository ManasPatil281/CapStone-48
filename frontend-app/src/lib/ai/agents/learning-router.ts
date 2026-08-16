/**
 * Learning Router Agent — AI-powered personalized recommendation engine.
 *
 * Replaces heuristic recommendation rules with an LLM that reasons over:
 * - Mastery scores across submissions
 * - Recent visit patterns
 * - Quiz attempt trajectories
 * - Content style preferences
 * - Prerequisite graph edges
 */

import { getGroqChat } from "@/lib/ai/model";
import { LEARNING_ROUTER_PROMPT } from "@/lib/ai/prompts";
import {
  RecommendationOutputSchema,
  type RecommendationOutput,
} from "@/lib/ai/output-schemas";

/* ── Input Types ─────────────────────────────────────────────────────── */

export interface StudentSignals {
  masteryScores: Array<{
    submissionId: string;
    score: number;
    level: string;
    lastCalculatedAt: string;
  }>;
  recentVisits: Array<{
    submissionId: string;
    startedAt: string;
    endedAt: string | null;
    activeSeconds: number;
    idleSeconds: number;
  }>;
  quizTrajectories: Array<{
    submissionId: string;
    scores: number[];
    latestAt: string;
  }>;
  contentStylePreferences: Array<{
    deliveryTypeId: string;
    deliveryTypeName: string;
    totalActiveSeconds: number;
  }>;
}

export interface AvailableSubmission {
  id: string;
  title: string;
  loTitle: string;
  courseTitle: string;
  courseSlug: string;
  loId: string;
  mastery?: number | null;
}

export interface PrerequisiteEdge {
  sourceLoId: string;
  targetLoId: string;
}

/* ── Format Helpers ──────────────────────────────────────────────────── */

function formatStudentSignals(signals: StudentSignals): string {
  const parts: string[] = [];

  // Mastery overview
  if (signals.masteryScores.length > 0) {
    const mastered = signals.masteryScores.filter((m) => m.score >= 70).length;
    const developing = signals.masteryScores.filter(
      (m) => m.score >= 40 && m.score < 70
    ).length;
    const beginner = signals.masteryScores.filter((m) => m.score < 40).length;

    parts.push(
      `Mastery: ${mastered} mastered, ${developing} developing, ${beginner} beginner (${signals.masteryScores.length} total)`
    );

    // Top 5 lowest mastery
    const lowest = [...signals.masteryScores]
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
    parts.push(
      `Lowest mastery: ${lowest.map((m) => `${m.submissionId.slice(0, 8)}…: ${Math.round(m.score)}%`).join(", ")}`
    );
  } else {
    parts.push("Mastery: No mastery data yet");
  }

  // Recent activity
  if (signals.recentVisits.length > 0) {
    const recent = signals.recentVisits.slice(0, 5);
    parts.push(
      `Recent visits (last ${recent.length}): ${recent.map((v) => `${v.submissionId.slice(0, 8)}… (${v.activeSeconds}s active, ${v.idleSeconds}s idle)`).join("; ")}`
    );
  }

  // Quiz performance
  if (signals.quizTrajectories.length > 0) {
    const weak = signals.quizTrajectories
      .filter((q) => q.scores.length > 0)
      .map((q) => ({
        ...q,
        avg: q.scores.reduce((s, v) => s + v, 0) / q.scores.length,
      }))
      .filter((q) => q.avg < 70)
      .slice(0, 5);

    if (weak.length > 0) {
      parts.push(
        `Weak quiz topics: ${weak.map((q) => `${q.submissionId.slice(0, 8)}… avg ${Math.round(q.avg)}%`).join(", ")}`
      );
    }
  }

  // Content style
  if (signals.contentStylePreferences.length > 0) {
    const sorted = [...signals.contentStylePreferences].sort(
      (a, b) => b.totalActiveSeconds - a.totalActiveSeconds
    );
    parts.push(
      `Preferred content styles: ${sorted.slice(0, 3).map((s) => `${s.deliveryTypeName} (${Math.round(s.totalActiveSeconds / 60)}min)`).join(", ")}`
    );
  }

  return parts.join("\n");
}

function formatAvailableSubmissions(
  submissions: AvailableSubmission[]
): string {
  if (submissions.length === 0) return "No available submissions.";

  return submissions
    .slice(0, 20)
    .map(
      (s) =>
        `- ${s.id.slice(0, 8)}… | "${s.title}" | LO: "${s.loTitle}" | Course: "${s.courseTitle}" | Mastery: ${s.mastery != null ? `${Math.round(s.mastery)}%` : "none"}`
    )
    .join("\n");
}

function formatPrerequisiteGraph(edges: PrerequisiteEdge[]): string {
  if (edges.length === 0) return "No prerequisite edges defined.";

  return edges
    .slice(0, 30)
    .map(
      (e) =>
        `${e.sourceLoId.slice(0, 8)}… → ${e.targetLoId.slice(0, 8)}…`
    )
    .join(", ");
}

/* ── Public API ──────────────────────────────────────────────────────── */

export interface LearningRouterInput {
  signals: StudentSignals;
  availableSubmissions: AvailableSubmission[];
  prerequisiteEdges: PrerequisiteEdge[];
}

/**
 * Run the learning router agent to generate personalized recommendations.
 */
export async function generateRecommendations(
  input: LearningRouterInput
): Promise<RecommendationOutput> {
  const model = getGroqChat({
    temperature: 0.4,
    maxTokens: 800,
  });

  const structuredModel = model.withStructuredOutput(
    RecommendationOutputSchema
  );

  const prompt = await LEARNING_ROUTER_PROMPT.formatMessages({
    studentSignals: formatStudentSignals(input.signals),
    availableSubmissions: formatAvailableSubmissions(
      input.availableSubmissions
    ),
    prerequisiteGraph: formatPrerequisiteGraph(input.prerequisiteEdges),
  });

  const result = await structuredModel.invoke(prompt);
  return result;
}
