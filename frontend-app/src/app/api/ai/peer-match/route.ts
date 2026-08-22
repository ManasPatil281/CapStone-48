import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { matchPeerLearners } from "@/lib/ai/agents/peer-matching-agent";

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
    const { topicTitle = "Stack Data Structure", learnerMasteryScore = 45 } = body;

    const match = await matchPeerLearners({ topicTitle, learnerMasteryScore });
    return NextResponse.json(match);
  } catch (error) {
    console.error("[api/ai/peer-match] Error:", error);
    return NextResponse.json({ error: "Failed to match peer learners." }, { status: 500 });
  }
}
