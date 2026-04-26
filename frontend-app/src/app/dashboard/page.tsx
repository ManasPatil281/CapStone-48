import { requireAuth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { CourseCatalog } from "./CourseCatalog";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Course = Database["public"]["Tables"]["course"]["Row"];

export default async function DashboardPage() {
  const user = await requireAuth();
  const supabase = createSupabaseServerClient();

  if (user.role === "TEACHER" || user.role === "ADMIN") {
    redirect("/teacher");
  }

  const { data: courses, error } = await supabase
    .from("course")
    .select("*")
    .order("title", { ascending: true });

  if (error) {
    console.error("[DashboardPage] Failed to fetch courses:", error);
  }

  const roleDisplay = user.role || "No Role Assigned";
  const showRoleWarning = !user.role;
  const availableCourses = (courses ?? []) as Course[];
  const displayName = user.profile?.full_name || user.email?.split("@")[0] || user.email || "there";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-10">

        {/* ── Welcome section ── */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-label text-slate-600">
              {roleDisplay}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-50">
              Welcome back,{" "}
              <span className="text-brand-muted">{displayName}</span>
            </h1>
            <p className="text-sm text-slate-500">
              Pick up where you left off or explore new courses.
            </p>
          </div>

          {showRoleWarning && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-800/30 bg-amber-950/15 px-4 py-3 text-sm text-amber-400/90">
              <span className="mt-px h-4 w-4 flex-shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 text-center text-[10px] leading-4 font-bold">!</span>
              No user profile found — contact an administrator to set up your account.
            </div>
          )}

          {user.role === "STUDENT" && (
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/55 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-100">Personalised recommendations</p>
                  <p className="text-xs text-slate-500">
                    View suggested modules, revision prompts, and next steps based on your learning
                    activity.
                  </p>
                </div>

                <Link
                  href="/recommendations"
                  className="inline-flex items-center gap-1.5 self-start rounded-md border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/20"
                >
                  View recommendations
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div className="h-px w-full bg-slate-800/60" />

        {/* ── Course catalog ── */}
        <CourseCatalog courses={availableCourses} />
      </div>
    </main>
  );
}
