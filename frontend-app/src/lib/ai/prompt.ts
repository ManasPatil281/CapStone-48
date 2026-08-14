import type { StruggleSignal, SubmissionChatContext, TutorAgentState } from "@/lib/ai/types";

export function buildLoAssistantSystemPrompt(context: SubmissionChatContext): string {
  const blockText = context.teachingBlocks.length
    ? context.teachingBlocks
        .map(
          (block, index) =>
            `${index + 1}. [${block.deliveryType}] ${block.title}: ${block.text}`
        )
        .join("\n")
    : "No teaching blocks were available.";

  const teacherLine = context.teacherName ? `Teacher: ${context.teacherName}` : "Teacher: not provided";
  const descriptionLine = context.loDescription ? `LO Description: ${context.loDescription}` : "LO Description: not provided";

  return [
    "You are a focused study assistant for one learning object page in a learning platform.",
    "Use only the provided page context as your primary source.",
    "Do not claim to have read hidden material, databases, or external sources.",
    "If the user asks outside this page, say that clearly and offer a best-effort explanation tied to this LO.",
    "Keep answers clear, practical, and student-friendly.",
    "When asked to quiz the user, provide 3-5 short questions and wait for answers.",
    "If prerequisites are requested, infer them from context and mark uncertainty when needed.",
    "",
    `Course: ${context.courseTitle}`,
    `Learning Object: ${context.loTitle}`,
    `Submission Title: ${context.submissionTitle}`,
    `Submission ID: ${context.submissionId}`,
    teacherLine,
    descriptionLine,
    "Teaching Block Excerpts:",
    blockText
  ].join("\n");
}

export function buildTutorPlannerPrompt(input: {
  context: SubmissionChatContext;
  studentMessage: string;
  historySummary: string;
  struggleSignal?: StruggleSignal;
}): string {
  const { context, studentMessage, historySummary, struggleSignal } = input;
  const idle = struggleSignal?.idleSeconds ?? 0;
  const quizScore = struggleSignal?.recentQuizScore ?? null;
  const confusionCount = struggleSignal?.confusionCount ?? 0;

  return [
    "You are a tutoring planner agent for one learning object.",
    "Set a short-term learning goal and choose one next stage.",
    "Stages: diagnose, explain, check, remediate, reflect.",
    "Pick one intervention type: none, hint, analogy, prerequisite_recap, micro_quiz, reflection.",
    "Respond ONLY as valid JSON:",
    '{"goal":"...", "stage":"diagnose|explain|check|remediate|reflect", "nextAction":"...", "confidence":<0-1>, "intervention":"none|hint|analogy|prerequisite_recap|micro_quiz|reflection", "rationale":"..."}',
    "",
    `Course: ${context.courseTitle}`,
    `Learning Object: ${context.loTitle}`,
    `Student Message: ${studentMessage}`,
    `Recent History Summary: ${historySummary || "No prior context."}`,
    `Signals: idleSeconds=${idle}, recentQuizScore=${quizScore ?? "n/a"}, confusionCount=${confusionCount}`
  ].join("\n");
}

export function buildTutorResponderPrompt(input: {
  context: SubmissionChatContext;
  plan: TutorAgentState;
}): string {
  const base = buildLoAssistantSystemPrompt(input.context);

  return [
    base,
    "",
    "You must follow this tutoring plan for your next reply:",
    `Goal: ${input.plan.goal}`,
    `Stage: ${input.plan.stage}`,
    `Next action: ${input.plan.nextAction}`,
    `Intervention: ${input.plan.intervention}`,
    "If intervention is micro_quiz, ask exactly 2 short checking questions.",
    "If intervention is prerequisite_recap, explain prerequisite first in 2-3 lines.",
    "Keep response concise, concrete, and student-friendly."
  ].join("\n");
}

export function summarizeHistoryForPlanner(history: Array<{ role: "user" | "assistant"; content: string }>): string {
  if (!history.length) {
    return "";
  }

  return history
    .slice(-4)
    .map((entry, idx) => `${idx + 1}. ${entry.role}: ${entry.content.replace(/\s+/g, " ").trim().slice(0, 180)}`)
    .join("\n");
}
