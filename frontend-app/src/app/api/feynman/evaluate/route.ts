import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

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

    const systemPrompt = `You are an educational assessment AI. A student has explained a concept using the Feynman technique. Evaluate their explanation on:
1. Conceptual correctness — Are the core ideas accurate?
2. Simplicity — Is it clear enough for a beginner?
3. Completeness — Are the key points covered?

Respond ONLY with valid JSON and no other text:
{"score": <integer 0-100>, "feedback": "<2-3 sentences of constructive feedback>"}`;

    const userMessage = `Topic: "${loTitle}"\n\nStudent explanation:\n${explanation}`;

    const groqResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 300,
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
      return NextResponse.json({ error: providerMessage }, { status: 502 });
    }

    const rawReply = groqData?.choices?.[0]?.message?.content;
    if (typeof rawReply !== "string" || !rawReply.trim()) {
      return NextResponse.json(
        { error: "AI returned an empty response." },
        { status: 502 }
      );
    }

    let feynmanScore: number;
    let feynmanFeedback: string;

    try {
      const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      const parsed = JSON.parse(jsonMatch[0]);

      const rawScore = parsed.score;
      if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) {
        throw new Error("Invalid score");
      }
      feynmanScore = Math.round(Math.max(0, Math.min(100, rawScore)));

      feynmanFeedback =
        typeof parsed.feedback === "string" ? parsed.feedback.trim() : "";
      if (!feynmanFeedback) throw new Error("Missing feedback");
    } catch {
      return NextResponse.json(
        { error: "AI returned an invalid response format. Please try again." },
        { status: 502 }
      );
    }

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
      masterySource: "feynman_prototype",
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
    });
  } catch (error) {
    console.error("[api/feynman/evaluate] Unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
