import { NextResponse } from "next/server";
import { mutateLearningGraph } from "@/lib/ai/agents/graph-mutator-agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { studentId = "std-1", currentLoTitle = "Stack Operations", masteryScore = 45, recentQuizScores = [40, 50], avgTimePerBlockSeconds = 180 } = body;

    const report = await mutateLearningGraph({
      studentId,
      currentLoTitle,
      masteryScore,
      recentQuizScores,
      avgTimePerBlockSeconds,
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("[api/ai/graph-mutate] Error:", error);
    return NextResponse.json({ error: "Failed to mutate learning graph." }, { status: 500 });
  }
}
