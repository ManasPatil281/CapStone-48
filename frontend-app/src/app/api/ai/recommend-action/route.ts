/**
 * POST /api/ai/recommend-action — on-demand version of the same pipeline
 * the /recommendations page auto-runs for its single top candidate:
 *
 *   StudentLearningState -> RoadblockEvidence -> Diagnosis -> Pedagogical Planner -> student-facing action
 *
 * Used by the secondary "Other areas that might need attention" list so
 * additional submissions are only ever analyzed when the student explicitly
 * asks — never automatically. Read-only, self-scoped to the authenticated
 * student; never trusts a client-supplied studentId.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildFocusResult } from "@/lib/recommendations/buildFocusResult";

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

    const result = await buildFocusResult(user.id, submissionId);
    if (!result) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/ai/recommend-action] Unexpected error:", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
