import type { SubmissionChatContext } from "@/lib/ai/types";

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
