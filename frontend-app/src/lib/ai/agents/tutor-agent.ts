/**
 * Tutor Agent — Tool-calling agent for the LO chat assistant.
 *
 * Uses LangGraph's `createReactAgent` from `@langchain/langgraph/prebuilt`
 * with tool-calling capabilities:
 * - fetch_prerequisites: Looks up prerequisite chain
 * - get_quiz_weakness: Finds weak quiz topics
 * - get_content_block: Retrieves detailed content
 * - get_mastery_status: Checks mastery score/level
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getGroqChat } from "@/lib/ai/model";
import { createPrerequisiteTool } from "@/lib/ai/tools/prerequisites";
import { createQuizWeaknessTool } from "@/lib/ai/tools/quiz-weakness";
import { createContentBlockTool } from "@/lib/ai/tools/content-block";
import { createMasteryStatusTool } from "@/lib/ai/tools/mastery-status";
import {
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { SubmissionChatContext, ChatHistoryMessage } from "@/lib/ai/types";

export interface TutorAgentInput {
  message: string;
  context: SubmissionChatContext;
  history: ChatHistoryMessage[];
  studentId?: string;
}

export interface TutorAgentResult {
  reply: string;
  toolsUsed: string[];
  model: string;
}

/**
 * Format teaching blocks into a single string for system prompt context.
 */
function formatTeachingBlocks(
  blocks: SubmissionChatContext["teachingBlocks"]
): string {
  if (!blocks || blocks.length === 0) {
    return "No teaching blocks were available.";
  }
  return blocks
    .map(
      (block, index) =>
        `${index + 1}. [${block.deliveryType}] ${block.title}: ${block.text}`
    )
    .join("\n");
}

/**
 * Convert chat history from the frontend format to LangChain messages.
 */
function convertHistory(history: ChatHistoryMessage[]): BaseMessage[] {
  return history
    .filter(
      (entry) =>
        (entry.role === "user" || entry.role === "assistant") &&
        Boolean(entry.content?.trim())
    )
    .slice(-6)
    .map((entry) => {
      const content = entry.content.trim().slice(0, 1200);
      return entry.role === "user"
        ? new HumanMessage(content)
        : new AIMessage(content);
    });
}

/**
 * Build system prompt string with full context.
 */
function buildSystemPrompt(context: SubmissionChatContext): string {
  const blocksText = formatTeachingBlocks(context.teachingBlocks);
  return `You are a focused study assistant for one learning object page in a learning platform.
Use the provided page context as your primary source.
Keep answers clear, practical, and student-friendly.
When asked to quiz the user, provide short interactive questions.

You have access to active database query tools:
1. fetch_prerequisites: Fetch prerequisite chain for this LO. Pass loTitle="${context.loTitle}", submissionId="${context.submissionId}", or learningObjectId="${context.learningObjectId || ""}".
2. get_quiz_weakness: Fetch the student's weakest quiz topics. Pass studentId if available.
3. get_content_block: Retrieve full content for a specific block. Pass submissionId="${context.submissionId}".
4. get_mastery_status: Check mastery score and level. Pass submissionId="${context.submissionId}".

IMPORTANT: When asked about prerequisites, MUST call fetch_prerequisites tool with loTitle="${context.loTitle}" or submissionId="${context.submissionId}".

Course: ${context.courseTitle}
Learning Object: ${context.loTitle}
Learning Object ID: ${context.learningObjectId || "not provided"}
Submission Title: ${context.submissionTitle}
Submission ID: ${context.submissionId}
Teacher: ${context.teacherName || "not provided"}
LO Description: ${context.loDescription || "not provided"}
Teaching Block Excerpts:
${blocksText}`;
}

/**
 * Create and invoke the tutor agent.
 */
export async function invokeTutorAgent(
  input: TutorAgentInput
): Promise<TutorAgentResult> {
  const model = getGroqChat({
    temperature: 0.35,
    maxTokens: 600,
  });

  // Create tools
  const tools = [
    createPrerequisiteTool(),
    createQuizWeaknessTool(),
    createContentBlockTool(),
    createMasteryStatusTool(),
  ];

  const systemPrompt = buildSystemPrompt(input.context);

  // Create LangGraph ReAct agent
  const agent = createReactAgent({
    llm: model,
    tools,
    prompt: systemPrompt,
  });

  // Build input messages array: chat history + new human message
  const chatHistory = convertHistory(input.history);
  const inputMessages = [
    ...chatHistory,
    new HumanMessage(input.message.slice(0, 1200)),
  ];

  // Invoke agent
  const result = await agent.invoke({
    messages: inputMessages,
  });

  // Extract final reply and tools used from output messages
  const outputMessages = result.messages as BaseMessage[];
  const toolsUsed: string[] = [];

  for (const msg of outputMessages) {
    if ("tool_calls" in msg && Array.isArray((msg as any).tool_calls)) {
      for (const tc of (msg as any).tool_calls) {
        if (tc.name && !toolsUsed.includes(tc.name)) {
          toolsUsed.push(tc.name);
        }
      }
    }
  }

  const lastMessage = outputMessages[outputMessages.length - 1];
  let reply = "";

  if (typeof lastMessage?.content === "string") {
    reply = lastMessage.content.trim();
  } else if (Array.isArray(lastMessage?.content)) {
    reply = (lastMessage.content as any[])
      .map((c) => (typeof c === "string" ? c : c.text || ""))
      .join("\n")
      .trim();
  }

  return {
    reply: reply || "I could not generate a response right now.",
    toolsUsed,
    model: "openai/gpt-oss-120b",
  };
}
