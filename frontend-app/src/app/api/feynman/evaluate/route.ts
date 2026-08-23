/**
 * POST /api/feynman/evaluate — Feynman Socratic Coaching Evaluator
 *
 * 1. Structured output via Zod (no more regex)
 * 2. Misconception detection + follow-up questions
 * 3. Persists the attempt to `student_feynman_attempt`, then invokes the
 *    canonical mastery engine (`recalculateMastery`) — this route no longer
 *    computes or writes `mastery_score` itself. See
 *    ADAPTIVE_AND_AGENTIC_ARCHITECTURE.md for why the previous
 *    `existingMastery * 0.7 + feynmanScore * 0.3` blend was retired: it was
 *    a second, independent mastery formula that disagreed with (and
 *    partially clobbered the metadata of) the main engine.
 *
 * Falls back to simple LangChain structured output if LangGraph fails.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateFeynman } from "@/lib/ai/agents/feynman-coach";
import { getGroqChat } from "@/lib/ai/model";
import { FEYNMAN_EVALUATION_PROMPT } from "@/lib/ai/prompts";
import { FeynmanEvaluationSchema } from "@/lib/ai/output-schemas";
import { recalculateMastery } from "@/lib/mastery/recalculateMastery";

type MasteryLevel = "Beginner" | "Developing" | "Proficient" | "Mastered";

function toLevel(score: number): MasteryLevel {
  if (score >= 85) return "Mastered";
  if (score >= 70) return "Proficient";
  if (score >= 40) return "Developing";
  return "Beginner";
}

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabaseAny
      .from("user_profile")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = String(profile?.role ?? "").toUpperCase();
    if (role !== "STUDENT") {
      if (process.env.NODE_ENV === "development") {
        console.log("[api/feynman/evaluate] Forbidden role:", {
          rawRole: profile?.role,
          normalizedRole: role,
        });
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const submissionId =
      typeof body.submissionId === "string" ? body.submissionId.trim() : "";
    const explanation =
      typeof body.explanation === "string" ? body.explanation.trim() : "";
    const loTitle =
      typeof body.loTitle === "string" ? body.loTitle.trim() : "";

    if (!submissionId || !explanation || !loTitle) {
      return NextResponse.json(
        { error: "submissionId, explanation, and loTitle are required." },
        { status: 400 }
      );
    }

    if (explanation.length < 50) {
      return NextResponse.json(
        { error: "Explanation is too short." },
        { status: 400 }
      );
    }

    if (explanation.length > 3000) {
      return NextResponse.json(
        { error: "Explanation must be under 3000 characters." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GROQ_API_KEY on the server." },
        { status: 500 }
      );
    }

    let feynmanScore: number;
    let feynmanFeedback: string;
    let misconceptions: string[] = [];
    let followUpQuestion = "";
    let phase: "evaluate" | "followup" | "final" = "final";

    try {
      // Try the LangGraph Socratic coaching flow
      const coachResult = await evaluateFeynman({
        loTitle,
        explanation,
        maxFollowUps: 2,
      });

      feynmanScore = Math.round(Math.max(0, Math.min(100, coachResult.score)));
      feynmanFeedback = coachResult.feedback;
      misconceptions = coachResult.misconceptions;
      followUpQuestion = coachResult.followUpQuestion;
      phase = coachResult.phase;
    } catch (agentError) {
      // Fallback: simple LangChain structured output
      console.warn(
        "[api/feynman/evaluate] LangGraph agent failed, falling back to structured output:",
        agentError
      );

      try {
        const model = getGroqChat({ temperature: 0.3, maxTokens: 300 });
        const structuredModel = model.withStructuredOutput(
          FeynmanEvaluationSchema
        );

        const prompt = await FEYNMAN_EVALUATION_PROMPT.formatMessages({
          loTitle,
          explanation,
        });

        const result = await structuredModel.invoke(prompt);
        feynmanScore = Math.round(
          Math.max(0, Math.min(100, result.score))
        );
        feynmanFeedback = result.feedback;
      } catch (fallbackError) {
        console.error(
          "[api/feynman/evaluate] Structured output fallback also failed:",
          fallbackError
        );
        return NextResponse.json(
          {
            error:
              "AI returned an invalid response format. Please try again.",
          },
          { status: 502 }
        );
      }
    }

    // Persist the Feynman attempt as its own historical evidence row (new
    // table — see student_feynman_attempt migration) instead of only
    // surviving as the latest snippet inside mastery's metadata_json.
    const { error: feynmanInsertErr } = await supabaseAny.from("student_feynman_attempt").insert({
      student_id: user.id,
      submission_id: submissionId,
      explanation,
      score: feynmanScore,
      feedback: feynmanFeedback,
      misconceptions: misconceptions.length > 0 ? misconceptions : null,
      follow_up_question: followUpQuestion || null,
    });

    if (feynmanInsertErr) {
      console.error("[api/feynman/evaluate] Failed to persist Feynman attempt:", feynmanInsertErr);
      return NextResponse.json(
        { error: "Failed to save your explanation. Please try again." },
        { status: 500 }
      );
    }

    // Recalculate mastery through the single canonical engine — this route
    // no longer computes or writes mastery_score itself.
    const masteryResult = await recalculateMastery(user.id, submissionId);
    // A Feynman attempt is knowledge evidence, so recalculateMastery should
    // never return null immediately after this insert — this fallback only
    // guards against an unexpected read-after-write race.
    const newMasteryScore = masteryResult?.score ?? feynmanScore;
    const newLevel = masteryResult?.level ?? toLevel(newMasteryScore);

    return NextResponse.json({
      score: feynmanScore,
      feedback: feynmanFeedback,
      newMasteryScore,
      masteryLevel: newLevel,
      // New fields for Socratic coaching
      misconceptions,
      followUpQuestion,
      phase,
    });
  } catch (error) {
    console.error("[api/feynman/evaluate] Unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
