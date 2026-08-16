import { NextResponse } from "next/server";
import { generateRemediationLesson } from "@/lib/ai/agents/remediation-agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { loTitle, failedQuestions, userMasteryScore } = body;

    if (!loTitle) {
      return NextResponse.json({ error: "loTitle is required" }, { status: 400 });
    }

    const lesson = await generateRemediationLesson({
      loTitle,
      failedQuestions,
      userMasteryScore,
    });

    return NextResponse.json(lesson);
  } catch (error) {
    console.error("[api/ai/remediate] Error:", error);
    return NextResponse.json({ error: "Failed to generate remediation lesson." }, { status: 500 });
  }
}
