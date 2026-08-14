import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

type MasteryLevel = "Beginner" | "Developing" | "Proficient" | "Mastered";

type GraderOutput = {
  score: number;
  feedback: string;
  strengths: string[];
  gaps: string[];
};

type CriticOutput = {
  adjustedScore: number;
  critique: string;
  confidence: number;
};

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

    const userMessage = `Topic: "${loTitle}"\n\nStudent explanation:\n${explanation}`;

    const graderRaw = await callGroq({
      apiKey,
      systemPrompt: `You are Grader Agent.
Evaluate student explanation quality on correctness, simplicity, and completeness.
Return ONLY valid JSON:
{"score":<integer 0-100>, "feedback":"<2-3 sentences>", "strengths":["..."], "gaps":["..."]}`,
      userMessage,
      maxTokens: 320
    });

    const grader = parseGraderOutput(graderRaw);
    if (!grader) {
      return NextResponse.json(
        { error: "AI grader returned an invalid response format. Please try again." },
        { status: 502 }
      );
    }

    const criticRaw = await callGroq({
      apiKey,
      systemPrompt: `You are Critic Agent reviewing a grader's output.
Assess whether score is too strict or too lenient based on the student's explanation.
Return ONLY valid JSON:
{"adjustedScore":<integer 0-100>, "critique":"<1-2 sentences>", "confidence":<number 0-1>}`,
      userMessage: `${userMessage}\n\nGrader output:\n${JSON.stringify(grader)}`,
      maxTokens: 220
    });

    const critic = parseCriticOutput(criticRaw);
    if (!critic) {
      return NextResponse.json(
        { error: "AI critic returned an invalid response format. Please try again." },
        { status: 502 }
      );
    }

    const refereeRaw = await callGroq({
      apiKey,
      systemPrompt: `You are Referee Agent.
Synthesize grader + critic into final calibrated result.
Return ONLY valid JSON:
{"score":<integer 0-100>, "feedback":"<2-3 sentences>", "confidence":<number 0-1>, "debateSummary":"<1 sentence>"} `,
      userMessage: `${userMessage}\n\nGrader output:\n${JSON.stringify(grader)}\n\nCritic output:\n${JSON.stringify(critic)}`,
      maxTokens: 260
    });

    const referee = parseRefereeOutput(refereeRaw);
    if (!referee) {
      return NextResponse.json(
        { error: "AI referee returned an invalid response format. Please try again." },
        { status: 502 }
      );
    }

    const feynmanScore = referee.score;
    const feynmanFeedback = referee.feedback;

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
      feynmanConfidence: referee.confidence,
      feynmanDebate: {
        grader,
        critic,
        summary: referee.debateSummary,
      },
      lastFeynmanAttemptAt: now,
      masterySource: "feynman_multi_agent",
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
      confidence: referee.confidence,
      debateSummary: referee.debateSummary,
      newMasteryScore,
      masteryLevel: newLevel,
    });
  } catch (error) {
    console.error("[api/feynman/evaluate] Unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

async function callGroq({
  apiKey,
  systemPrompt,
  userMessage,
  maxTokens
}: {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
}): Promise<string> {
  const groqResponse = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `******
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  const groqData = await groqResponse.json();
  if (!groqResponse.ok) {
    const providerMessage =
      groqData?.error?.message || "Groq request failed.";
    throw new Error(providerMessage);
  }

  const rawReply = groqData?.choices?.[0]?.message?.content;
  if (typeof rawReply !== "string" || !rawReply.trim()) {
    throw new Error("AI returned an empty response.");
  }
  return rawReply;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseGraderOutput(raw: string): GraderOutput | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;
  const score = Number(parsed.score);
  const feedback = typeof parsed.feedback === "string" ? parsed.feedback.trim() : "";
  const strengths = Array.isArray(parsed.strengths)
    ? parsed.strengths.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
    : [];
  const gaps = Array.isArray(parsed.gaps)
    ? parsed.gaps.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
    : [];
  if (!Number.isFinite(score) || !feedback) return null;
  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    feedback,
    strengths,
    gaps
  };
}

function parseCriticOutput(raw: string): CriticOutput | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;
  const adjustedScore = Number(parsed.adjustedScore);
  const critique = typeof parsed.critique === "string" ? parsed.critique.trim() : "";
  const confidence = Number(parsed.confidence);
  if (!Number.isFinite(adjustedScore) || !critique || !Number.isFinite(confidence)) return null;
  return {
    adjustedScore: Math.round(Math.max(0, Math.min(100, adjustedScore))),
    critique,
    confidence: Math.max(0, Math.min(1, confidence))
  };
}

function parseRefereeOutput(raw: string): {
  score: number;
  feedback: string;
  confidence: number;
  debateSummary: string;
} | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;
  const score = Number(parsed.score);
  const feedback = typeof parsed.feedback === "string" ? parsed.feedback.trim() : "";
  const confidence = Number(parsed.confidence);
  const debateSummary = typeof parsed.debateSummary === "string" ? parsed.debateSummary.trim() : "";
  if (!Number.isFinite(score) || !feedback || !Number.isFinite(confidence)) return null;
  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    feedback,
    confidence: Math.max(0, Math.min(1, confidence)),
    debateSummary
  };
}
