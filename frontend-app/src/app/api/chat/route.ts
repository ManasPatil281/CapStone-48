/**
 * POST /api/chat — LO Chat Assistant (Agentic)
 *
 * Upgraded from single-shot Groq fetch to a LangChain ReAct agent
 * with tool-calling capabilities:
 * - fetch_prerequisites: Looks up prerequisite chain
 * - get_quiz_weakness: Finds weak quiz topics
 * - get_content_block: Retrieves detailed content
 * - get_mastery_status: Checks mastery score/level
 *
 * Falls back to a simple LangChain chain if agent creation fails.
 */

import { NextResponse } from "next/server";
import type { ChatHistoryMessage, SubmissionChatContext } from "@/lib/ai/types";
import { invokeTutorAgent } from "@/lib/ai/agents/tutor-agent";
import { getGroqChat } from "@/lib/ai/model";
import { buildLoAssistantSystemPrompt } from "@/lib/ai/prompt";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";

interface ChatRequestBody {
  message?: string;
  context?: SubmissionChatContext;
  history?: ChatHistoryMessage[];
  studentId?: string;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GROQ_API_KEY on the server." }, { status: 500 });
    }

    const body = (await request.json()) as ChatRequestBody;
    const message = body.message?.trim() || "";

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    if (!body.context) {
      return NextResponse.json({ error: "Context is required." }, { status: 400 });
    }

    const safeHistory = (body.history || [])
      .filter((entry) => (entry.role === "user" || entry.role === "assistant") && Boolean(entry.content?.trim()))
      .slice(-6)
      .map((entry) => ({
        role: entry.role,
        content: entry.content.trim().slice(0, 1200)
      }));

    try {
      // Try the agentic path first
      const result = await invokeTutorAgent({
        message,
        context: body.context,
        history: safeHistory as ChatHistoryMessage[],
        studentId: body.studentId,
      });

      return NextResponse.json({
        reply: result.reply,
        model: result.model,
        toolsUsed: result.toolsUsed,
        agentic: true,
      });
    } catch (agentError) {
      // Fallback: simple LangChain chain (no tools)
      console.warn("[api/chat] Agent failed, falling back to simple chain:", agentError);

      const model = getGroqChat({ temperature: 0.35, maxTokens: 600 });

      const messages = [
        new SystemMessage(buildLoAssistantSystemPrompt(body.context)),
        ...safeHistory.map((entry) =>
          entry.role === "user"
            ? new HumanMessage(entry.content)
            : new AIMessage(entry.content)
        ),
        new HumanMessage(message.slice(0, 1200)),
      ];

      const response = await model.invoke(messages);
      const reply = typeof response.content === "string" ? response.content.trim() : "";

      if (!reply) {
        return NextResponse.json({ error: "AI returned an empty response." }, { status: 502 });
      }

      return NextResponse.json({
        reply,
        model: "llama-3.1-8b-instant",
        toolsUsed: [],
        agentic: false,
      });
    }
  } catch (error) {
    console.error("[api/chat] Unexpected error:", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
