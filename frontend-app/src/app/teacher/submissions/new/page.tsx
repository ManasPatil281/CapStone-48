import { requireRole } from "@/lib/auth/server";
import { SubmissionForm } from "@/app/teacher/submissions/SubmissionForm";

export default async function NewSubmissionPage() {
  await requireRole(["TEACHER", "ADMIN"]);

  return <SubmissionForm mode="create" successRedirect="/teacher/submissions" />;
}
