import { NextResponse } from "next/server";
import { matchPeerLearners } from "@/lib/ai/agents/peer-matching-agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { topicTitle = "Stack Data Structure", learnerMasteryScore = 45 } = body;

    const match = await matchPeerLearners({ topicTitle, learnerMasteryScore });
    return NextResponse.json(match);
  } catch (error) {
    console.error("[api/ai/peer-match] Error:", error);
    return NextResponse.json({ error: "Failed to match peer learners." }, { status: 500 });
  }
}
