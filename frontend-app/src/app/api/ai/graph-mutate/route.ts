import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mutateLearningGraph } from "@/lib/ai/agents/graph-mutator-agent";

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

    const { data: profile } = await supabaseAny.from("user_profile").select("role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? "").toUpperCase();
    if (role !== "STUDENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { currentLoTitle = "Stack Operations", masteryScore = 45, recentQuizScores = [40, 50], avgTimePerBlockSeconds = 180 } = body;

    const report = await mutateLearningGraph({
      studentId: user.id,
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
