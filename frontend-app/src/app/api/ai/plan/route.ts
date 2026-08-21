/**
 * POST /api/ai/plan — Pedagogical Planner.
 *
 * StudentLearningState -> RoadblockEvidence -> (client-supplied) Diagnosis -> Plan
 *
 * State and RoadblockEvidence are always recomputed server-side fresh — they
 * remain the sole source of factual truth and gate the deterministic
 * "no roadblock" short-circuit. The `diagnosis` field is accepted from the
 * client (the debug page already fetched it from /api/ai/diagnose moments
 * earlier) to avoid a redundant, uncontrolled second LLM call; it is
 * schema-validated before use and only ever treated as an interpretive hint,
 * never as new factual data.
 *
 * Read-only, self-scoped to the authenticated student. Does not write to
 * the database.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildStudentLearningState } from "@/lib/adaptive/studentLearningState";
import { extractRoadblockEvidence } from "@/lib/adaptive/roadblockEvidence";
import { buildPlannerContext } from "@/lib/adaptive/plannerContext";
import { planPedagogicalAction } from "@/lib/ai/agents/pedagogical-planner";
import { DiagnosisSchema } from "@/lib/ai/output-schemas";

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

    const diagnosisParse = DiagnosisSchema.safeParse(body.diagnosis);
    if (!diagnosisParse.success) {
      return NextResponse.json(
        { error: "A valid diagnosis object (from /api/ai/diagnose) is required." },
        { status: 400 }
      );
    }

    const state = await buildStudentLearningState(user.id, submissionId);
    if (!state) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    const evidence = extractRoadblockEvidence(state);
    const context = await buildPlannerContext(state);
    const result = await planPedagogicalAction(state, evidence, diagnosisParse.data, context);

    return NextResponse.json({ ...result, context });
  } catch (error) {
    console.error("[api/ai/plan] Unexpected error:", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
