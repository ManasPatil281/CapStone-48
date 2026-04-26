import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FeynmanClient } from "./FeynmanClient";

export default async function FeynmanPage({
  params,
}: {
  params: { submissionId: string };
}) {
  const user = await requireAuth();

  if (user.role !== "STUDENT") {
    redirect("/dashboard");
  }

  const supabase = createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const { data: submissionRow, error: submissionError } = await supabaseAny
    .from("teacher_lo_submission")
    .select(
      "id, title, notes, learning_object:learning_object_id(id,title), course:course_id(slug,title)"
    )
    .eq("id", params.submissionId)
    .eq("status", "approved")
    .maybeSingle();

  if (submissionError || !submissionRow) {
    notFound();
  }

  if ((submissionRow.notes ?? "").startsWith("[SOFT_DELETED]")) {
    notFound();
  }

  const submissionTitle =
    (submissionRow.title as string | null | undefined)?.trim() ||
    "Untitled submission";
  const loTitle =
    (submissionRow.learning_object?.title as string | null | undefined)?.trim() ||
    "this concept";
  const courseTitle =
    (submissionRow.course?.title as string | null | undefined)?.trim() || "";

  const { data: masteryRow } = await supabaseAny
    .from("student_submission_mastery")
    .select("mastery_score, mastery_level")
    .eq("student_id", user.id)
    .eq("submission_id", params.submissionId)
    .maybeSingle();

  return (
    <FeynmanClient
      submissionId={params.submissionId}
      submissionTitle={submissionTitle}
      loTitle={loTitle}
      courseTitle={courseTitle}
      currentMasteryScore={
        typeof masteryRow?.mastery_score === "number"
          ? masteryRow.mastery_score
          : null
      }
      currentMasteryLevel={
        typeof masteryRow?.mastery_level === "string"
          ? masteryRow.mastery_level
          : null
      }
    />
  );
}
