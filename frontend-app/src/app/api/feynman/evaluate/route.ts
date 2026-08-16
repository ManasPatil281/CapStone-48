/**
 * POST /api/feynman/evaluate — Feynman Socratic Coaching Evaluator
 *
 * Upgraded from single-shot regex-parsed grading to a LangGraph-based
 * Socratic coaching flow:
 *
 * 1. Structured output via Zod (no more regex)
 * 2. Misconception detection + follow-up questions
 * 3. Score blending into persisted mastery (preserved from original)
 *
 * Falls back to simple LangChain structured output if LangGraph fails.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateFeynman } from "@/lib/ai/agents/feynman-coach";
import { getGroqChat } from "@/lib/ai/model";
import { FEYNMAN_EVALUATION_PROMPT } from "@/lib/ai/prompts";
import { FeynmanEvaluationSchema } from "@/lib/ai/output-schemas";

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

    // Persist mastery (preserved from original implementation)
    const { data: existing } = await supabaseAny
      .from("student_submission_mastery")
      .select("mastery_score, metadata_json")
      .eq("student_id", user.id)
      .eq("submission_id", submissionId)
      .maybeSingle();

    const now = new Date().toISOString();
    let newMasteryScore: number;
    let existingMetadata: Record<string, unknown> = {};

    if (!existing) {
      newMasteryScore = feynmanScore * 0.3;
    } else {
      const current =
        typeof existing.mastery_score === "number" ? existing.mastery_score : 0;
      existingMetadata =
        existing.metadata_json &&
        typeof existing.metadata_json === "object" &&
        !Array.isArray(existing.metadata_json)
          ? (existing.metadata_json as Record<string, unknown>)
          : {};
      newMasteryScore = current * 0.7 + feynmanScore * 0.3;
    }

    newMasteryScore =
      Math.round(Math.max(0, Math.min(100, newMasteryScore)) * 10) / 10;
    const newLevel = toLevel(newMasteryScore);

    const newMetadata: Record<string, unknown> = {
      ...existingMetadata,
      feynmanScore,
      feynmanFeedback,
      lastFeynmanAttemptAt: now,
      masterySource: "feynman_langgraph",
      misconceptions:
        misconceptions.length > 0 ? misconceptions : undefined,
    };

    await supabaseAny.from("student_submission_mastery").upsert(
      {
        student_id: user.id,
        submission_id: submissionId,
        mastery_score: newMasteryScore,
        mastery_level: newLevel,
        last_calculated_at: now,
        metadata_json: newMetadata,
      },
      { onConflict: "student_id,submission_id" }
    );

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
