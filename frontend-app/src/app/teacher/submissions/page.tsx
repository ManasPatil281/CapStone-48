import { requireRole } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MySubmissionsClient } from "@/app/teacher/submissions/MySubmissionsClient";

type SubmissionCard = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  course_title: string;
  lo_title: string;
};

export default async function TeacherMySubmissionsPage() {
  const user = await requireRole(["TEACHER"]);
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("teacher_lo_submission")
    .select(
      "id, title, notes, status, created_at, updated_at, course:course_id(title), learning_object:learning_object_id(title)"
    )
    .eq("teacher_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[TeacherMySubmissionsPage] Failed to load submissions:", error);
  }

  const initialSubmissions: SubmissionCard[] = (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    course_title: row.course?.title ?? "Unknown Course",
    lo_title: row.learning_object?.title ?? "Unknown LO",
  }));

  return <MySubmissionsClient teacherId={user.id} initialSubmissions={initialSubmissions} />;
}
