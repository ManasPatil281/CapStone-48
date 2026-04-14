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
    <main className="min-h-screen bg-slate-950 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Page header */}
        <div className="border-b border-slate-800 pb-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
            {roleDisplay}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Welcome back,{" "}
            <span className="text-slate-200">
              {user.profile?.full_name || user.email?.split("@")[0] || user.email}
            </span>
          </h1>
          {showRoleWarning && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-400">
              No user profile found — contact an administrator to set up your account.
            </div>
          )}
        </div>

        <CourseCatalog courses={availableCourses} />
      </div>
    </main>
  );
}
