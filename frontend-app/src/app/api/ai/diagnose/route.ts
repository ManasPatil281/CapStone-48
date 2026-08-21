/**
 * POST /api/ai/diagnose — Roadblock Diagnostic Agent.
 *
 * StudentLearningState -> RoadblockEvidence -> diagnoseRoadblock() -> Diagnosis
 *
 * Read-only: does not write to the database, does not choose a pedagogical
 * action, does not touch mastery. Always operates on the authenticated
 * student's own id — never a client-supplied studentId.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildStudentLearningState } from "@/lib/adaptive/studentLearningState";
import { extractRoadblockEvidence } from "@/lib/adaptive/roadblockEvidence";
import { diagnoseRoadblock } from "@/lib/ai/agents/diagnostic-agent";

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

    const { data: profile } = await supabaseAny
      .from("user_profile")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = String(profile?.role ?? "").toUpperCase();
    if (role !== "STUDENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";

    if (!submissionId) {
      return NextResponse.json({ error: "submissionId is required." }, { status: 400 });
    }

    const state = await buildStudentLearningState(user.id, submissionId);
    if (!state) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    const evidence = extractRoadblockEvidence(state);
    const diagnosis = await diagnoseRoadblock(state, evidence);

    return NextResponse.json({ state, evidence, diagnosis });
  } catch (error) {
    console.error("[api/ai/diagnose] Unexpected error:", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
