import { NextResponse } from "next/server";
import { buildLoAssistantSystemPrompt } from "@/lib/ai/prompt";
import type { ChatHistoryMessage, SubmissionChatContext } from "@/lib/ai/types";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

interface ChatRequestBody {
  message?: string;
  context?: SubmissionChatContext;
  history?: ChatHistoryMessage[];
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

    const payload = {
      model: GROQ_MODEL,
      temperature: 0.35,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: buildLoAssistantSystemPrompt(body.context)
        },
        ...safeHistory,
        {
          role: "user",
          content: message.slice(0, 1200)
        }
      ]
    };

    const groqResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await groqResponse.json();

    if (!groqResponse.ok) {
      const providerMessage =
        data?.error?.message || data?.message || "Groq request failed.";
      return NextResponse.json({ error: providerMessage }, { status: 502 });
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return NextResponse.json({ error: "Groq returned an empty response." }, { status: 502 });
    }

    return NextResponse.json({ reply: reply.trim(), model: GROQ_MODEL });
  } catch (error) {
    console.error("[api/chat] Unexpected error:", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
