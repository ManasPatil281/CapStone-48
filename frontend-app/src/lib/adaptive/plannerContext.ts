/**
 * Pedagogical Planner target-context builder.
 *
 * Deterministic, bounded data preparation step for the pedagogical planner
 * (src/lib/ai/agents/pedagogical-planner.ts). This is intentionally NOT part
 * of the planner itself: the planner LLM never gets arbitrary database
 * access — it only ever sees the already-safe candidate lists assembled
 * here, and the planner's output is validated against these same lists
 * after the LLM responds.
 *
 * Reuses StudentLearningState fields wherever they already carry the
 * required data (loMastery.breakdown, prerequisites.prerequisiteDetails);
 * only queries for data the state doesn't already carry: postrequisite LO
 * submissions, and the full set of delivery types offered by the current
 * submission's content (not just the ones the student has engaged with).
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSoftDeletedSubmission, type MasteryLevel, type StudentLearningState } from "./studentLearningState";

export interface PlannerTargetSubmission {
  submissionId: string;
  submissionTitle: string | null;
  teacherId: string | null;
  teacherName: string | null;
  score: number | null;
  level: MasteryLevel | null;
}

export interface PlannerTargetLo {
  loId: string;
  title: string | null;
  slug: string | null;
  submissions: PlannerTargetSubmission[];
}

export interface PlannerDeliveryOption {
  deliveryTypeId: string;
  deliveryTypeName: string | null;
}

export interface PlannerContext {
  /** Other approved, accessible submissions for the SAME LO as the current submission. Candidates for TRY_DIFFERENT_METHOD. */
  currentSubmissionAlternatives: PlannerTargetSubmission[];
  /** Candidates for REVISIT_PREREQUISITE. Reused as-is from StudentLearningState (already approved + non-soft-deleted). */
  prerequisiteTargets: PlannerTargetLo[];
  /** Candidates for ADVANCE. Submission-scoped postrequisite LOs for the current submission, resolved to real approved submissions. */
  postrequisiteTargets: PlannerTargetLo[];
  /** Candidates for TRY_DIFFERENT_METHOD's targetDeliveryTypeId — all delivery types actually offered by the current submission, not just ones the student has tried. */
  currentSubmissionDeliveryOptions: PlannerDeliveryOption[];
}

export async function buildPlannerContext(state: StudentLearningState): Promise<PlannerContext> {
  const supabase = createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const currentSubmissionAlternatives: PlannerTargetSubmission[] = (state.loMastery?.breakdown ?? [])
    .filter((s) => s.submissionId !== state.submissionId)
    .map((s) => ({
      submissionId: s.submissionId,
      submissionTitle: s.submissionTitle,
      teacherId: s.teacherId,
      teacherName: s.teacherName,
      score: s.score,
      level: s.level,
    }));

  const prerequisiteTargets: PlannerTargetLo[] = state.prerequisites.prerequisiteDetails.map((p) => ({
    loId: p.loId,
    title: p.title,
    slug: p.slug,
    submissions: p.masteryBySubmission.map((m) => ({
      submissionId: m.submissionId,
      submissionTitle: m.submissionTitle,
      teacherId: null,
      teacherName: null,
      score: m.score,
      level: m.level,
    })),
  }));

  const postrequisiteLoIds = state.prerequisites.submissionScoped.postrequisiteLoIds;
  let postrequisiteTargets: PlannerTargetLo[] = [];
  if (postrequisiteLoIds.length > 0) {
    const [{ data: loRows, error: loErr }, { data: subRows, error: subErr }] = await Promise.all([
      supabaseAny.from("learning_object").select("id, title, slug").in("id", postrequisiteLoIds),
      supabaseAny
        .from("teacher_lo_submission")
        .select("id, title, teacher_id, notes, learning_object_id")
        .in("learning_object_id", postrequisiteLoIds)
        .eq("status", "approved"),
    ]);
    if (loErr) console.error("[buildPlannerContext] Failed to load postrequisite LOs:", loErr);
    if (subErr) console.error("[buildPlannerContext] Failed to load postrequisite submissions:", subErr);

    const approvedSubs = ((subRows ?? []) as Array<{
      id: string;
      title: string | null;
      teacher_id: string | null;
      notes: string | null;
      learning_object_id: string;
    }>).filter((r) => !isSoftDeletedSubmission(r.notes));

    const teacherIds = Array.from(new Set(approvedSubs.map((s) => s.teacher_id).filter((v): v is string => !!v)));
    const teacherNameById = new Map<string, string | null>();
    if (teacherIds.length > 0) {
      const { data: teacherRows, error: teacherErr } = await supabaseAny
        .from("user_profile")
        .select("id, full_name")
        .in("id", teacherIds);
      if (teacherErr) console.error("[buildPlannerContext] Failed to load teacher profiles:", teacherErr);
      ((teacherRows ?? []) as Array<{ id: string; full_name: string | null }>).forEach((r) =>
        teacherNameById.set(r.id, r.full_name ?? null)
      );
    }

    const subIds = approvedSubs.map((s) => s.id);
    const masteryBySubId = new Map<string, { score: number | null; level: MasteryLevel | null }>();
    if (subIds.length > 0) {
      const { data: masteryRows, error: masteryErr } = await supabaseAny
        .from("student_submission_mastery")
        .select("submission_id, mastery_score, mastery_level")
        .eq("student_id", state.studentId)
        .in("submission_id", subIds);
      if (masteryErr) console.error("[buildPlannerContext] Failed to load postrequisite mastery:", masteryErr);
      ((masteryRows ?? []) as Array<{ submission_id: string; mastery_score: number | null; mastery_level: string | null }>).forEach(
        (r) => {
          const level: MasteryLevel | null =
            r.mastery_level === "Beginner" ||
            r.mastery_level === "Developing" ||
            r.mastery_level === "Proficient" ||
            r.mastery_level === "Mastered"
              ? r.mastery_level
              : null;
          masteryBySubId.set(r.submission_id, { score: r.mastery_score, level });
        }
      );
    }

    const subsByLo = new Map<string, PlannerTargetSubmission[]>();
    approvedSubs.forEach((s) => {
      const list = subsByLo.get(s.learning_object_id) ?? [];
      list.push({
        submissionId: s.id,
        submissionTitle: s.title,
        teacherId: s.teacher_id,
        teacherName: s.teacher_id ? teacherNameById.get(s.teacher_id) ?? null : null,
        score: masteryBySubId.get(s.id)?.score ?? null,
        level: masteryBySubId.get(s.id)?.level ?? null,
      });
      subsByLo.set(s.learning_object_id, list);
    });

    postrequisiteTargets = ((loRows ?? []) as Array<{ id: string; title: string; slug: string }>).map((lo) => ({
      loId: lo.id,
      title: lo.title,
      slug: lo.slug,
      submissions: subsByLo.get(lo.id) ?? [],
    }));
  }

  let currentSubmissionDeliveryOptions: PlannerDeliveryOption[] = [];
  {
    const { data: contentRows, error: contentErr } = await supabaseAny
      .from("teacher_lo_submission_content")
      .select("delivery_type_id, delivery_type:delivery_type_id(id, name)")
      .eq("submission_id", state.submissionId)
      .eq("is_active", true);
    if (contentErr) {
      console.error("[buildPlannerContext] Failed to load current submission content:", contentErr);
    }
    const seen = new Map<string, string | null>();
    ((contentRows ?? []) as Array<{ delivery_type_id: string; delivery_type: { id: string; name: string | null } | null }>).forEach(
      (row) => {
        if (row.delivery_type_id && !seen.has(row.delivery_type_id)) {
          seen.set(row.delivery_type_id, row.delivery_type?.name ?? null);
        }
      }
    );
    currentSubmissionDeliveryOptions = Array.from(seen.entries()).map(([deliveryTypeId, deliveryTypeName]) => ({
      deliveryTypeId,
      deliveryTypeName,
    }));
  }

  return {
    currentSubmissionAlternatives,
    prerequisiteTargets,
    postrequisiteTargets,
    currentSubmissionDeliveryOptions,
  };
}
