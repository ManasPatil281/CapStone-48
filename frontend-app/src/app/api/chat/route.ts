import { NextResponse } from "next/server";
import {
  buildTutorPlannerPrompt,
  buildTutorResponderPrompt,
  summarizeHistoryForPlanner
} from "@/lib/ai/prompt";
import type { ChatHistoryMessage, StruggleSignal, SubmissionChatContext, TutorAgentState } from "@/lib/ai/types";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

interface ChatRequestBody {
  message?: string;
  context?: SubmissionChatContext;
  history?: ChatHistoryMessage[];
  struggleSignal?: StruggleSignal;
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
      .slice(-8)
      .map((entry) => ({
        role: entry.role,
        content: entry.content.trim().slice(0, 1200)
      }));

    const plannerPrompt = buildTutorPlannerPrompt({
      context: body.context,
      studentMessage: message.slice(0, 1200),
      historySummary: summarizeHistoryForPlanner(safeHistory),
      struggleSignal: body.struggleSignal
    });

    const plannerResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `******
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 300,
        messages: [{ role: "system", content: plannerPrompt }]
      })
    });

    const plannerData = await plannerResponse.json();
    if (!plannerResponse.ok) {
      const providerMessage =
        plannerData?.error?.message || plannerData?.message || "Groq planner request failed.";
      return NextResponse.json({ error: providerMessage }, { status: 502 });
    }

    const fallbackIntervention = inferInterventionFromSignals(safeHistory, body.struggleSignal);
    const plannerRaw = plannerData?.choices?.[0]?.message?.content;
    const plan = parsePlannerState(plannerRaw, fallbackIntervention);

    const responderResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `******
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.35,
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: buildTutorResponderPrompt({
              context: body.context,
              plan
            })
          },
          ...safeHistory,
          {
            role: "user",
            content: message.slice(0, 1200)
          }
        ]
      })
    });

    const responderData = await responderResponse.json();
    if (!responderResponse.ok) {
      const providerMessage =
        responderData?.error?.message || responderData?.message || "Groq response request failed.";
      return NextResponse.json({ error: providerMessage }, { status: 502 });
    }

    const reply = responderData?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return NextResponse.json({ error: "Groq returned an empty response." }, { status: 502 });
    }

    return NextResponse.json({ reply: reply.trim(), model: GROQ_MODEL, agentState: plan });
  } catch (error) {
    console.error("[api/chat] Unexpected error:", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

function parsePlannerState(raw: unknown, fallbackIntervention: TutorAgentState["intervention"]): TutorAgentState {
  const fallback: TutorAgentState = {
    goal: "Clarify the student's immediate confusion and verify understanding.",
    stage: "diagnose",
    nextAction: "Provide a concise explanation and ask one understanding check.",
    confidence: 0.5,
    intervention: fallbackIntervention,
    rationale: "Fallback plan due to planner parsing failure."
  };

  if (typeof raw !== "string" || !raw.trim()) {
    return fallback;
  }

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return fallback;
    }
    const parsed = JSON.parse(match[0]) as Partial<TutorAgentState>;
    const stage =
      parsed.stage === "diagnose" ||
      parsed.stage === "explain" ||
      parsed.stage === "check" ||
      parsed.stage === "remediate" ||
      parsed.stage === "reflect"
        ? parsed.stage
        : fallback.stage;
    const intervention =
      parsed.intervention === "none" ||
      parsed.intervention === "hint" ||
      parsed.intervention === "analogy" ||
      parsed.intervention === "prerequisite_recap" ||
      parsed.intervention === "micro_quiz" ||
      parsed.intervention === "reflection"
        ? parsed.intervention
        : fallbackIntervention;

    const confidenceRaw = typeof parsed.confidence === "number" ? parsed.confidence : fallback.confidence;

    return {
      goal: typeof parsed.goal === "string" && parsed.goal.trim() ? parsed.goal.trim() : fallback.goal,
      stage,
      nextAction:
        typeof parsed.nextAction === "string" && parsed.nextAction.trim()
          ? parsed.nextAction.trim()
          : fallback.nextAction,
      confidence: Math.max(0, Math.min(1, Number.isFinite(confidenceRaw) ? confidenceRaw : fallback.confidence)),
      intervention,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.trim() : fallback.rationale
    };
  } catch {
    return fallback;
  }
}

function inferInterventionFromSignals(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  signal?: StruggleSignal
): TutorAgentState["intervention"] {
  const idleSeconds = Number(signal?.idleSeconds ?? 0);
  const recentQuizScore = signal?.recentQuizScore;
  const confusionCountSignal = Number(signal?.confusionCount ?? 0);

  const confusionTokens = ["confused", "don't understand", "dont understand", "stuck", "lost", "unclear"];
  const historyConfusionHits = history
    .filter((entry) => entry.role === "user")
    .reduce((sum, entry) => {
      const text = entry.content.toLowerCase();
      return sum + (confusionTokens.some((token) => text.includes(token)) ? 1 : 0);
    }, 0);

  const confusionCount = Math.max(confusionCountSignal, historyConfusionHits);
  if (idleSeconds >= 120) {
    return "reflection";
  }
  if (typeof recentQuizScore === "number" && recentQuizScore < 50) {
    return "micro_quiz";
  }
  if (confusionCount >= 2) {
    return "prerequisite_recap";
  }
  if (confusionCount === 1) {
    return "analogy";
  }
  return "none";
}
