import { requireAuth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { CourseCatalog } from "./CourseCatalog";

type Course = Database["public"]["Tables"]["course"]["Row"];

export default async function DashboardPage() {
  const user = await requireAuth();
  const supabase = createSupabaseServerClient();

  if (user.role === "TEACHER" || user.role === "ADMIN") {
    redirect("/teacher");
  }

  const { data: courses, error } = await supabase.from("course").select("*").order("title", { ascending: true });

  if (error) {
    console.error("[DashboardPage] Failed to fetch courses:", error);
  }

  const roleDisplay = user.role || "No Role Assigned";
  const showRoleWarning = !user.role;
  const availableCourses = (courses ?? []) as Course[];

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-500/20 via-slate-950 to-slate-900 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {user.profile?.full_name || user.email}</h1>
          <p className="text-slate-400">Role: {roleDisplay}</p>
          {showRoleWarning && (
            <p className="mt-2 text-sm text-amber-400">
              ⚠ No user profile found. Please contact an administrator to set up your account.
            </p>
          )}
        </div>

        <CourseCatalog courses={availableCourses} />
      </div>
    </main>
  );
}
