import { requireRole } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  FilePlus,
  MessageSquare,
  BarChart2
} from "lucide-react";

export default async function TeacherPage() {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const displayName = user.profile?.full_name || user.email || "Instructor";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-10">

        {/* ── Header ── */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-label text-slate-600">
              {user.role}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-50">
              Teacher Dashboard
            </h1>
            <p className="text-sm text-slate-500">{displayName}</p>
          </div>
        </div>

        <div className="h-px w-full bg-slate-800/60" />

        {/* ── Primary action: Create New Submission ── */}
        <div>
          <Link href="/teacher/submissions/new" className="group block cursor-pointer">
            <div className="card-lift relative overflow-hidden rounded-xl border border-brand/20 bg-gradient-to-br from-brand/8 via-slate-900/60 to-slate-900/40 p-7 shadow-card backdrop-blur-[1px] hover:border-brand/35 hover:shadow-brand-glow">
              {/* Background glow */}
              <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 translate-x-1/3 -translate-y-1/3 rounded-full bg-brand/8 blur-[60px]" />

              <div className="relative flex items-start justify-between gap-4">
                <div className="flex flex-col gap-3">
                  {/* Icon */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand/30 bg-brand/15">
                    <FilePlus className="h-5 w-5 text-brand" />
                  </div>

                  {/* Text */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-label text-brand/70">
                      Primary Action
                    </p>
                    <h2 className="text-xl font-bold tracking-tight text-slate-50">
                      Create New Submission
                    </h2>
                    <p className="text-sm leading-relaxed text-slate-400">
                      Author teaching content for a learning object — concept notes,
                      flowcharts, worked examples, quizzes, and more.
                    </p>
                  </div>

                  <Button className="w-fit" size="sm">
                    Start Creating
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Arrow hint on desktop */}
                <div className="hidden shrink-0 translate-x-0 transform items-center justify-center self-center rounded-full border border-brand/20 bg-brand/10 p-3 opacity-60 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 sm:flex">
                  <ArrowRight className="h-5 w-5 text-brand" />
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* ── Secondary actions: Coming Soon ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-label text-slate-600">
            Secondary Actions
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            <Link href="/teacher/submissions" className="group block cursor-pointer">
              <div className="relative flex h-full flex-col gap-3 rounded-xl border border-slate-800/50 bg-slate-900/30 p-5 transition-colors hover:border-slate-600/70 hover:bg-slate-900/50">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-800/60">
                  <ClipboardList className="h-4 w-4 text-slate-300" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-300">My Submissions</p>
                  <p className="text-xs leading-relaxed text-slate-500">
                    View and manage your learning object submissions
                  </p>
                </div>

                <div className="pointer-events-none absolute right-4 top-4 hidden shrink-0 translate-x-0 transform items-center justify-center rounded-full border border-brand/20 bg-brand/10 p-2 opacity-60 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 sm:flex">
                  <ArrowRight className="h-4 w-4 text-brand" />
                </div>
              </div>
            </Link>

            <div className="flex flex-col gap-3 rounded-xl border border-slate-800/50 bg-slate-900/30 p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-800/60">
                <MessageSquare className="h-4 w-4 text-slate-500" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-400">Review Submissions</p>
                <p className="text-xs leading-relaxed text-slate-600">Review and provide feedback on student work</p>
              </div>
              <span className="w-fit rounded-full border border-slate-800/60 bg-slate-800/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-label text-slate-700">
                Coming soon
              </span>
            </div>

            <Link href={"/teacher/analytics" as any} className="group block cursor-pointer">
              <div className="relative flex h-full flex-col gap-3 rounded-xl border border-slate-800/50 bg-slate-900/30 p-5 transition-colors hover:border-slate-600/70 hover:bg-slate-900/50">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-800/60">
                  <BarChart2 className="h-4 w-4 text-slate-300" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-300">View analytics</p>
                  <p className="text-xs leading-relaxed text-slate-500">
                    View student engagement and performance metrics
                  </p>
                </div>

                <div className="pointer-events-none absolute right-4 top-4 hidden shrink-0 translate-x-0 transform items-center justify-center rounded-full border border-brand/20 bg-brand/10 p-2 opacity-60 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 sm:flex">
                  <ArrowRight className="h-4 w-4 text-brand" />
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* ── Back link ── */}
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 transition-colors hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
        </div>

      </div>
    </main>
  );
}
