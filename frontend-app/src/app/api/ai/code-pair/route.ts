import { NextResponse } from "next/server";
import { analyzeCodeSocratically } from "@/lib/ai/agents/code-pair-programmer-agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { loTitle = "Stack Implementation", code = "", language = "javascript", errorMessage, outputLog } = body;

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const hint = await analyzeCodeSocratically({
      loTitle,
      code,
      language,
      errorMessage,
      outputLog,
    });

    return NextResponse.json(hint);
  } catch (error) {
    console.error("[api/ai/code-pair] Error:", error);
    return NextResponse.json({ error: "Failed to analyze code." }, { status: 500 });
  }
}
