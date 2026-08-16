import { NextResponse } from "next/server";
import { generateVivaQuestion } from "@/lib/ai/agents/mock-interviewer-agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { loTitle = "Stack & Queue Data Structures", previousTurnCount = 0 } = body;

    const turn = await generateVivaQuestion({ loTitle, previousTurnCount });
    return NextResponse.json(turn);
  } catch (error) {
    console.error("[api/ai/viva] Error:", error);
    return NextResponse.json({ error: "Failed to generate viva question." }, { status: 500 });
  }
}
