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
import { AIMessage, HumanMessage } from "@langchain/core/messages";
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

type RecommendationSectionType = "continue" | "next" | "style" | "recall" | "feynman";
const IS_DEV = process.env.NODE_ENV !== "production";

function toTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : (part as { text?: string }).text ?? ""))
      .join("\n");
  }
  return "";
}

function logRawPreview(label: string, raw: string): void {
  if (!IS_DEV) return;
  const compact = raw.replace(/\s+/g, " ").trim();
  console.debug(`[LearningRouter] ${label} preview (first 300): ${compact.slice(0, 300)}`);
}

function parseRecommendationOutput(raw: string): RecommendationOutput {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Model response did not contain a valid JSON object.");
  }

  const parsed = JSON.parse(raw.slice(start, end + 1));
  const validated = RecommendationOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Model JSON failed schema validation: ${validated.error.message}`);
  }

  return validated.data;
}

function buildHeuristicRecommendations(input: LearningRouterInput): RecommendationOutput {
  const now = Date.now();
  const masteryById = new Map(
    input.signals.masteryScores.map((m) => [m.submissionId, m.score])
  );
  const visitById = new Map(
    input.signals.recentVisits.map((v) => [
      v.submissionId,
      {
        timestamp: Math.max(Date.parse(v.endedAt ?? ""), Date.parse(v.startedAt ?? "")) || 0,
        activeSeconds: v.activeSeconds,
        idleSeconds: v.idleSeconds,
      },
    ])
  );
  const quizAvgById = new Map(
    input.signals.quizTrajectories.map((q) => {
      const avg = q.scores.length
        ? q.scores.reduce((sum, s) => sum + s, 0) / q.scores.length
        : 0;
      return [q.submissionId, avg] as const;
    })
  );

  const all = input.availableSubmissions;
  const byLoId = new Map<string, AvailableSubmission[]>();
  all.forEach((s) => {
    const bucket = byLoId.get(s.loId) ?? [];
    bucket.push(s);
    byLoId.set(s.loId, bucket);
  });

  const addSection = (
    sectionType: RecommendationSectionType,
    items: Array<{ submissionId: string; reason: string; confidence: number; priority: number }>
  ) => ({ sectionType, items: items.slice(0, 5) });

  const continueItems = all
    .filter((s) => {
      const mastery = masteryById.get(s.id);
      return typeof mastery !== "number" || mastery < 70;
    })
    .sort((a, b) => (visitById.get(b.id)?.timestamp ?? 0) - (visitById.get(a.id)?.timestamp ?? 0))
    .slice(0, 5)
    .map((s, idx) => {
      const mastery = masteryById.get(s.id) ?? 0;
      const visit = visitById.get(s.id);
      const activeMin = Math.round((visit?.activeSeconds ?? 0) / 60);
      return {
        submissionId: s.id,
        reason: `You recently spent ${activeMin} minutes on this topic and mastery is ${Math.round(mastery)}%, so revisiting now will close understanding gaps before moving ahead.`,
        confidence: 0.7,
        priority: idx + 1,
      };
    });

  const masteredLoIds = new Set(
    input.signals.masteryScores
      .filter((m) => m.score >= 70)
      .map((m) => input.availableSubmissions.find((s) => s.id === m.submissionId)?.loId)
      .filter((v): v is string => Boolean(v))
  );

  const nextCandidates = input.prerequisiteEdges
    .filter((e) => masteredLoIds.has(e.sourceLoId))
    .flatMap((e) => byLoId.get(e.targetLoId) ?? [])
    .filter((s, idx, arr) => arr.findIndex((x) => x.id === s.id) === idx)
    .filter((s) => (masteryById.get(s.id) ?? 0) < 70)
    .slice(0, 5)
    .map((s, idx) => ({
      submissionId: s.id,
      reason: "You already have good mastery in the prerequisite concept, so this is the natural next topic in your learning path.",
      confidence: 0.68,
      priority: idx + 1,
    }));

  const topStyle = input.signals.contentStylePreferences
    .slice()
    .sort((a, b) => b.totalActiveSeconds - a.totalActiveSeconds)[0];

  const styleItems = all
    .filter((s) => (masteryById.get(s.id) ?? 0) < 70)
    .slice(0, 5)
    .map((s, idx) => ({
      submissionId: s.id,
      reason: topStyle
        ? `You learn best with ${topStyle.deliveryTypeName} content based on your activity pattern, so this topic is prioritized in that style.`
        : "This topic is suggested while the system learns your preferred study style.",
      confidence: topStyle ? 0.64 : 0.5,
      priority: idx + 1,
    }));

  const recallItems = input.signals.masteryScores
    .filter((m) => m.score >= 70)
    .sort((a, b) => {
      const aQuiz = quizAvgById.get(a.submissionId) ?? 0;
      const bQuiz = quizAvgById.get(b.submissionId) ?? 0;
      return bQuiz - aQuiz;
    })
    .slice(0, 5)
    .map((m, idx) => ({
      submissionId: m.submissionId,
      reason: `You previously mastered this area (${Math.round(m.score)}%), and a quick recall pass now helps retain it for long-term memory.`,
      confidence: 0.62,
      priority: idx + 1,
    }));

  const feynmanItems = input.signals.masteryScores
    .filter((m) => m.score < 60)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((m, idx) => ({
      submissionId: m.submissionId,
      reason: `This topic is at ${Math.round(m.score)}% mastery; explaining it in your own words can reveal hidden misconceptions quickly.`,
      confidence: 0.72,
      priority: idx + 1,
    }));

  return {
    sections: [
      addSection("continue", continueItems),
      addSection("next", nextCandidates),
      addSection("style", styleItems),
      addSection("recall", recallItems),
      addSection("feynman", feynmanItems),
    ],
    reasoning: `Generated from live student signals and graph data with a deterministic fallback at ${new Date(now).toISOString()} because structured LLM output was unavailable.`,
  };
}

/**
 * Run the learning router agent to generate personalized recommendations.
 */
export async function generateRecommendations(
  input: LearningRouterInput
): Promise<RecommendationOutput> {
  const model = getGroqChat({
    model: "openai/gpt-oss-120b",
    temperature: 0.4,
    maxTokens: 800,
  });

  const prompt = await LEARNING_ROUTER_PROMPT.formatMessages({
    studentSignals: formatStudentSignals(input.signals),
    availableSubmissions: formatAvailableSubmissions(
      input.availableSubmissions
    ),
    prerequisiteGraph: formatPrerequisiteGraph(input.prerequisiteEdges),
  });

  const functionCallingModel = model.withStructuredOutput(
    RecommendationOutputSchema,
    { method: "functionCalling" }
  );

  try {
    try {
      const fcResult = await functionCallingModel.invoke(prompt);
      return fcResult;
    } catch {
      // Fall through to plain-text JSON parsing path.
    }

    const firstResponse = await model.invoke(prompt);
    const firstRaw = toTextContent(firstResponse.content);
    logRawPreview("First model output", firstRaw);

    try {
      return parseRecommendationOutput(firstRaw);
    } catch {
      const repairInstruction = [
        "Repair your previous response into valid JSON only.",
        "Do not include markdown or explanation.",
        "Return exactly one JSON object with keys: sections, reasoning.",
        "Each section must use sectionType in continue|next|style|recall|feynman and items[] with submissionId, reason, confidence, priority.",
      ].join(" ");

      const repairMessages = [
        ...prompt,
        new AIMessage(firstRaw),
        new HumanMessage(repairInstruction),
      ];

      const repairResponse = await model.invoke(repairMessages);
      const repairRaw = toTextContent(repairResponse.content);
      logRawPreview("Repair model output", repairRaw);
      return parseRecommendationOutput(repairRaw);
    }
  } catch (error) {
    console.error("[LearningRouter] Structured output failed, using deterministic fallback:", error);
    return buildHeuristicRecommendations(input);
  }
}
