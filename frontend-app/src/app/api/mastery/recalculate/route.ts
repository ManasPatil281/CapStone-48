/**
 * POST /api/mastery/recalculate
 *
 * Server-authorized trigger for the canonical mastery engine
 * (`src/lib/mastery/recalculateMastery.ts`). Called by `QuizSession.tsx`
 * right after a quiz attempt is successfully inserted, so quiz evidence
 * reaches mastery immediately rather than waiting for the next page visit.
 *
 * The student id is always taken from the authenticated session, never from
 * the request body — the body only supplies which submission to recompute.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recalculateMastery } from "@/lib/mastery/recalculateMastery";

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
    const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";

    if (!submissionId) {
      return NextResponse.json({ error: "submissionId is required." }, { status: 400 });
    }

    const result = await recalculateMastery(user.id, submissionId);

    return NextResponse.json({
      score: result?.score ?? null,
      level: result?.level ?? null,
    });
  } catch (error) {
    console.error("[api/mastery/recalculate] Unexpected error:", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
