import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateRemediationLesson } from "@/lib/ai/agents/remediation-agent";

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
