import { requireRole } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  BookOpen,
  Clock,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { BarChart } from "@/components/charts/BarChart";
import { HBarChart } from "@/components/charts/HBarChart";
import { MasteryDistBar } from "@/components/charts/MasteryDistBar";

// ── Types ─────────────────────────────────────────────────────────────────────

type SubmissionRow = {
  id: string;
  title: string;
  notes: string | null;
  updated_at: string;
  lo_title: string;
};

type VisitRow = {
  submission_id: string;
  student_id: string;
  active_seconds: number | null;
  idle_seconds: number | null;
  started_at: string | null;
};

type MasteryRow = {
  submission_id: string;
  student_id: string;
  mastery_score: number;
};

type QuizRow = {
  submission_id: string;
  student_id: string;
};

type SubmissionStats = {
  totalVisits: number;
  distinctStudents: number;
  avgActiveSecondsPerStudent: number;
  avgMastery: number | null;
  quizParticipationRate: number | null;
  hasQuiz: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  if (s <= 0) return "0s";
  const t = Math.round(s);
  if (t < 60) return `${t}s`;
  const m = Math.floor(t / 60);
  const rem = t % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TeacherAnalyticsPage() {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const teacherId = user.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = createSupabaseServerClient() as any;

  // Fetch all teacher submissions with LO title
  const { data: subData } = await supabaseAny
    .from("teacher_lo_submission")
    .select("id, title, notes, updated_at, learning_object:learning_object_id(title)")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false });

  const submissions: SubmissionRow[] = ((subData ?? []) as any[]).map((row: any) => ({
    id: row.id,
    title: row.title,
    notes: row.notes ?? null,
    updated_at: row.updated_at,
    lo_title: row.learning_object?.title ?? "Unknown LO",
  }));

  const submissionIds: string[] = submissions.map((s) => s.id);

  // Empty state
  if (submissionIds.length === 0) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10">
        <div className="mx-auto max-w-5xl space-y-8">
          <BackLink />
          <PageHeader />
          <div className="rounded-xl border border-dashed border-slate-800/60 bg-slate-900/30 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">
              No submissions yet.{" "}
              <Link href="/teacher/submissions/new" className="text-brand hover:underline">
                Create your first submission
              </Link>{" "}
              to see analytics.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Fetch visit data (teacher_id column lets us skip submission join)
  const { data: visitData } = await supabaseAny
    .from("student_submission_visit")
    .select("submission_id, student_id, active_seconds, idle_seconds, started_at")
    .eq("teacher_id", teacherId);

  const visitRows: VisitRow[] = (visitData ?? []) as VisitRow[];

  // Fetch mastery scores
  const { data: masteryData } = await supabaseAny
    .from("student_submission_mastery")
    .select("submission_id, student_id, mastery_score")
    .in("submission_id", submissionIds);

  const masteryRows: MasteryRow[] = (masteryData ?? []) as MasteryRow[];

  // Fetch quiz attempts (participation only — no scores needed here)
  const { data: quizData } = await supabaseAny
    .from("student_quiz_attempt")
    .select("submission_id, student_id")
    .in("submission_id", submissionIds);

  const quizRows: QuizRow[] = (quizData ?? []) as QuizRow[];

  // Which submissions have a quiz assessment
  const { data: assessmentData } = await supabaseAny
    .from("teacher_lo_submission_assessment")
    .select("submission_id")
    .in("submission_id", submissionIds);

  const submissionsWithQuiz = new Set<string>(
    ((assessmentData ?? []) as any[]).map((a: any) => a.submission_id as string)
  );

  // ── Top summary aggregation ────────────────────────────────────────────────

  const now = Date.now();
  const MS_30 = 30 * 24 * 60 * 60 * 1000;

  const totalActiveSeconds = visitRows.reduce(
    (sum, r) => sum + Number(r.active_seconds ?? 0),
    0
  );

  const last30ActiveSeconds = visitRows
    .filter((r) => r.started_at && new Date(r.started_at).getTime() >= now - MS_30)
    .reduce((sum, r) => sum + Number(r.active_seconds ?? 0), 0);

  const prev30ActiveSeconds = visitRows
    .filter((r) => {
      const t = r.started_at ? new Date(r.started_at).getTime() : 0;
      return t >= now - 2 * MS_30 && t < now - MS_30;
    })
    .reduce((sum, r) => sum + Number(r.active_seconds ?? 0), 0);

  const avgMasteryAll =
    masteryRows.length > 0
      ? masteryRows.reduce((sum, r) => sum + r.mastery_score, 0) / masteryRows.length
      : null;

  const trend30: "up" | "down" | "flat" =
    last30ActiveSeconds > prev30ActiveSeconds
      ? "up"
      : last30ActiveSeconds < prev30ActiveSeconds
        ? "down"
        : "flat";

  // ── Per-submission stats ───────────────────────────────────────────────────

  const statsMap = new Map<string, SubmissionStats>();

  for (const sub of submissions) {
    const subVisits = visitRows.filter((r) => r.submission_id === sub.id);
    const distinctStudents = new Set(subVisits.map((r) => r.student_id));
    const totalActive = subVisits.reduce(
      (sum, r) => sum + Number(r.active_seconds ?? 0),
      0
    );

    const subMastery = masteryRows.filter((r) => r.submission_id === sub.id);
    const avgMastery =
      subMastery.length > 0
        ? subMastery.reduce((sum, r) => sum + r.mastery_score, 0) / subMastery.length
        : null;

    const hasQuiz = submissionsWithQuiz.has(sub.id);
    const subQuizStudents = new Set(
      quizRows.filter((r) => r.submission_id === sub.id).map((r) => r.student_id)
    );
    const quizParticipationRate =
      hasQuiz && distinctStudents.size > 0
        ? subQuizStudents.size / distinctStudents.size
        : null;

    statsMap.set(sub.id, {
      totalVisits: subVisits.length,
      distinctStudents: distinctStudents.size,
      avgActiveSecondsPerStudent:
        distinctStudents.size > 0 ? totalActive / distinctStudents.size : 0,
      avgMastery,
      quizParticipationRate,
      hasQuiz,
    });
  }

  // ── Chart data ────────────────────────────────────────────────────────────────

  // 1. Daily active time trend — last 30 days (UTC dates)
  const dailyEntries: [string, number][] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dailyEntries.push([d.toISOString().slice(0, 10), 0]);
  }
  const dailyMap = new Map<string, number>(dailyEntries);
  for (const r of visitRows) {
    if (!r.started_at) continue;
    const day = r.started_at.slice(0, 10);
    if (dailyMap.has(day)) {
      dailyMap.set(day, dailyMap.get(day)! + Number(r.active_seconds ?? 0));
    }
  }
  const dailyTrendData = Array.from(dailyMap.entries()).map(([day, secs]) => ({
    label: String(parseInt(day.slice(8), 10)), // day-of-month
    value: secs,
  }));

  // 2. Submission engagement — total active time per submission
  const submissionEngagementData = submissions.map((sub) => {
    const subVisits = visitRows.filter((r) => r.submission_id === sub.id);
    const totalActive = subVisits.reduce(
      (sum, r) => sum + Number(r.active_seconds ?? 0),
      0
    );
    const label =
      sub.title.length > 22 ? sub.title.slice(0, 22) + "…" : sub.title;
    return { label, value: totalActive };
  });

  // 3. Mastery distribution — bucket all scores across all submissions
  const masteryBuckets = [
    { label: "Struggling", count: 0, color: "#f87171" },
    { label: "Developing", count: 0, color: "#fb923c" },
    { label: "Proficient", count: 0, color: "#818cf8" },
    { label: "Mastered",   count: 0, color: "#34d399" },
  ];
  for (const r of masteryRows) {
    if (r.mastery_score >= 85)      masteryBuckets[3].count++;
    else if (r.mastery_score >= 70) masteryBuckets[2].count++;
    else if (r.mastery_score >= 40) masteryBuckets[1].count++;
    else                            masteryBuckets[0].count++;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <BackLink />
        <PageHeader />

        <div className="h-px w-full bg-slate-800/60" />

        {/* ── Top summary cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="Total active time"
            value={fmtSeconds(totalActiveSeconds)}
            icon={<Clock className="h-3.5 w-3.5" />}
          />

          {/* 30-day trend card */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4 backdrop-blur-[1px]">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              Last 30 days
            </p>
            <p className="mt-1.5 text-xl font-bold text-slate-100">
              {fmtSeconds(last30ActiveSeconds)}
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              {trend30 === "up" && <TrendingUp className="h-3 w-3 text-emerald-400" />}
              {trend30 === "down" && <TrendingDown className="h-3 w-3 text-red-400" />}
              {trend30 === "flat" && <Minus className="h-3 w-3 text-slate-500" />}
              <span
                className={`text-[10px] font-medium ${
                  trend30 === "up"
                    ? "text-emerald-400"
                    : trend30 === "down"
                      ? "text-red-400"
                      : "text-slate-500"
                }`}
              >
                {fmtSeconds(prev30ActiveSeconds)} prev 30d
              </span>
            </div>
          </div>

          <SummaryCard
            label="Total submissions"
            value={String(submissions.length)}
            icon={<BookOpen className="h-3.5 w-3.5" />}
          />

          <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4 backdrop-blur-[1px]">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <BarChart2 className="h-3.5 w-3.5" />
              Avg mastery
            </p>
            {avgMasteryAll !== null ? (
              <>
                <p className="mt-1.5 text-xl font-bold text-slate-100">
                  {Math.round(avgMasteryAll)}
                  <span className="ml-0.5 text-sm font-normal text-slate-500">/100</span>
                </p>
                <p className="mt-0.5 text-[10px] text-slate-600">
                  across {masteryRows.length} student{masteryRows.length !== 1 ? "s" : ""}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-xl font-bold text-slate-500">—</p>
            )}
          </div>
        </div>

        {/* ── Charts ────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Activity Overview
          </p>

          {/* Row 1: daily trend (2 cols) + mastery distribution (1 col) */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 backdrop-blur-[1px] xl:col-span-2">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Student active time · last 30 days
              </p>
              <BarChart data={dailyTrendData} labelEvery={7} />
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 backdrop-blur-[1px]">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Mastery distribution
              </p>
              <MasteryDistBar buckets={masteryBuckets} />
            </div>
          </div>

          {/* Row 2: submission engagement (full width, only meaningful with 2+ submissions) */}
          {submissions.length > 0 && (
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 backdrop-blur-[1px]">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Module engagement · total active time
              </p>
              <HBarChart
                data={submissionEngagementData}
                emptyMessage="No student visits yet"
              />
            </div>
          )}
        </div>

        {/* ── Submission cards ───────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Your Modules
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {submissions.map((sub) => {
              const stats = statsMap.get(sub.id)!;
              return (
                <Link key={sub.id} href={`/teacher/analytics/${sub.id}` as any} className="group block">
                  <div className="relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-slate-800/50 bg-slate-900/40 p-5 transition-all hover:border-slate-600/60 hover:bg-slate-900/60">
                    <div className="absolute left-0 top-0 h-full w-[3px] rounded-l-xl bg-brand/0 transition-colors group-hover:bg-brand/50" />

                    {/* Submission header */}
                    <div className="space-y-0.5 pl-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        {sub.lo_title}
                      </p>
                      <h3 className="text-sm font-semibold leading-snug text-slate-100 group-hover:text-white">
                        {sub.title}
                      </h3>
                      {sub.notes && (
                        <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                          {sub.notes}
                        </p>
                      )}
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <MiniStat label="Students" value={String(stats.distinctStudents)} />
                      <MiniStat
                        label="Total visits"
                        value={String(stats.totalVisits)}
                      />
                      <MiniStat
                        label="Avg active time"
                        value={fmtSeconds(stats.avgActiveSecondsPerStudent)}
                      />
                      <MiniStat
                        label="Avg mastery"
                        value={
                          stats.avgMastery !== null
                            ? `${Math.round(stats.avgMastery)}/100`
                            : "—"
                        }
                      />
                    </div>

                    {stats.hasQuiz && (
                      <div className="rounded-lg border border-slate-800/40 bg-slate-950/30 px-2.5 py-1.5">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">
                          Quiz participation
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-slate-200">
                          {stats.quizParticipationRate !== null
                            ? `${Math.round(stats.quizParticipationRate * 100)}%`
                            : "—"}
                        </p>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="mt-auto flex items-center justify-between">
                      <p className="text-[10px] text-slate-600">
                        Updated {fmtDate(sub.updated_at)}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <BarChart2 className="h-3.5 w-3.5 text-slate-600 transition-colors group-hover:text-brand/70" />
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-brand/20 bg-brand/10 opacity-60 transition-all group-hover:opacity-100">
                          <ArrowRight className="h-3 w-3 text-brand" />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/teacher"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 transition-colors hover:text-slate-300"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Teacher Dashboard
    </Link>
  );
}

function PageHeader() {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        Analytics
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-slate-50">
        Submission Analytics
      </h1>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4 backdrop-blur-[1px]">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-xl font-bold text-slate-100">{value}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  dim = false,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800/50 bg-slate-950/40 px-2.5 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">
        {label}
      </p>
      <p
        className={`mt-0.5 text-xs font-bold ${dim ? "text-slate-500" : "text-slate-200"}`}
      >
        {value}
      </p>
    </div>
  );
}
