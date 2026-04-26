import { requireRole } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Clock } from "lucide-react";
import { HBarChart } from "@/components/charts/HBarChart";
import { MasteryDistBar } from "@/components/charts/MasteryDistBar";
import { QuizTrendLine } from "@/components/charts/QuizTrendLine";

// ── Types ─────────────────────────────────────────────────────────────────────

type VisitRow = {
  student_id: string;
  active_seconds: number | null;
  idle_seconds: number | null;
};

type MasteryRow = {
  student_id: string;
  mastery_score: number;
  mastery_level: string;
};

type QuizAttemptRow = {
  student_id: string;
  score_percentage: number | null;
  submitted_at: string | null;
  created_at: string | null;
};

type BlockTimeRow = {
  student_id: string;
  content_id: string;
  active_seconds: number | null;
};

type ContentBlockRow = {
  id: string;
  title: string | null;
  recommended_time_seconds: number | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

type StudentAnalytics = {
  studentId: string;
  name: string;
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  masteryScore: number | null;
  masteryLevel: string | null;
  latestQuizScore: number | null;
  bestQuizScore: number | null;
  quizAttempts: number;
  contentEngagement: "Under-engaged" | "On-track" | "Over-engaged" | "—";
  badge: "Struggling" | "Developing" | "Proficient" | "Mastered" | null;
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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function masteryLevelToBadge(
  level: string | null
): StudentAnalytics["badge"] {
  if (!level) return null;
  if (level === "Beginner") return "Struggling";
  if (level === "Developing") return "Developing";
  if (level === "Proficient") return "Proficient";
  if (level === "Mastered") return "Mastered";
  return null;
}

function badgeStyles(badge: StudentAnalytics["badge"]): string {
  switch (badge) {
    case "Mastered":   return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
    case "Proficient": return "border-indigo-500/40 bg-indigo-500/10 text-indigo-400";
    case "Developing": return "border-orange-500/40 bg-orange-500/10 text-orange-400";
    case "Struggling": return "border-red-500/40 bg-red-500/10 text-red-400";
    default:           return "border-slate-700/40 bg-slate-800/40 text-slate-500";
  }
}

function masteryScoreColor(score: number | null): string {
  if (score === null) return "text-slate-500";
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-indigo-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function engagementStyles(status: StudentAnalytics["contentEngagement"]): string {
  switch (status) {
    case "On-track":      return "text-emerald-400";
    case "Over-engaged":  return "text-orange-400";
    case "Under-engaged": return "text-red-400";
    default:              return "text-slate-500";
  }
}

function computeEngagement(
  studentActiveSeconds: number,
  totalRecommendedSeconds: number
): StudentAnalytics["contentEngagement"] {
  if (totalRecommendedSeconds <= 0) return "—";
  const ratio = studentActiveSeconds / totalRecommendedSeconds;
  if (ratio < 0.7) return "Under-engaged";
  if (ratio <= 1.3) return "On-track";
  return "Over-engaged";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SubmissionAnalyticsDetailPage({
  params,
}: {
  params: { submissionId: string };
}) {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const { submissionId } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = createSupabaseServerClient() as any;

  // Fetch submission and verify ownership
  const { data: submissionData, error: subErr } = await supabaseAny
    .from("teacher_lo_submission")
    .select("id, title, notes, updated_at, teacher_id, learning_object:learning_object_id(title)")
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr || !submissionData) {
    redirect("/teacher/analytics");
  }

  const sub = submissionData as any;

  if (user.role !== "ADMIN" && sub.teacher_id !== user.id) {
    redirect("/teacher/analytics");
  }

  const loTitle: string = sub.learning_object?.title ?? "Unknown LO";

  // Fetch all visits for this submission
  const { data: visitData } = await supabaseAny
    .from("student_submission_visit")
    .select("student_id, active_seconds, idle_seconds")
    .eq("submission_id", submissionId);

  const visitRows: VisitRow[] = (visitData ?? []) as VisitRow[];
  const allStudentIds = [...new Set(visitRows.map((r) => r.student_id))];

  if (allStudentIds.length === 0) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <BackLink />
          <SubmissionHeader title={sub.title} loTitle={loTitle} notes={sub.notes} updatedAt={sub.updated_at} />
          <div className="rounded-xl border border-dashed border-slate-800/60 bg-slate-900/30 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">No students have visited this submission yet.</p>
          </div>
        </div>
      </main>
    );
  }

  // Fetch mastery, quiz attempts, content block times, profiles — in parallel
  const [masteryRes, quizRes, blockTimeRes, contentBlockRes, profileRes] = await Promise.all([
    supabaseAny
      .from("student_submission_mastery")
      .select("student_id, mastery_score, mastery_level")
      .eq("submission_id", submissionId),
    supabaseAny
      .from("student_quiz_attempt")
      .select("student_id, score_percentage, submitted_at, created_at")
      .eq("submission_id", submissionId)
      .in("student_id", allStudentIds),
    supabaseAny
      .from("student_content_block_time")
      .select("student_id, content_id, active_seconds")
      .eq("submission_id", submissionId)
      .in("student_id", allStudentIds),
    supabaseAny
      .from("teacher_lo_submission_content")
      .select("id, title, recommended_time_seconds")
      .eq("submission_id", submissionId)
      .eq("is_active", true),
    supabaseAny
      .from("user_profile")
      .select("id, full_name")
      .in("id", allStudentIds),
  ]);

  const masteryRows: MasteryRow[] = (masteryRes.data ?? []) as MasteryRow[];
  const quizRows: QuizAttemptRow[] = (quizRes.data ?? []) as QuizAttemptRow[];
  const blockTimeRows: BlockTimeRow[] = (blockTimeRes.data ?? []) as BlockTimeRow[];
  const contentBlockRows: ContentBlockRow[] = (contentBlockRes.data ?? []) as ContentBlockRow[];
  const profileRows: ProfileRow[] = (profileRes.data ?? []) as ProfileRow[];

  // Total recommended time across all content blocks
  const totalRecommendedSeconds = contentBlockRows.reduce(
    (sum, b) => sum + Number(b.recommended_time_seconds ?? 0),
    0
  );

  // Build lookup maps
  const masteryByStudent = new Map<string, MasteryRow>(
    masteryRows.map((r) => [r.student_id, r])
  );

  const profileById = new Map<string, string>(
    profileRows.map((r) => [r.id, r.full_name ?? "Unknown Student"])
  );

  // Group quiz attempts by student, sorted newest first
  const quizByStudent = new Map<string, QuizAttemptRow[]>();
  for (const row of quizRows) {
    const existing = quizByStudent.get(row.student_id) ?? [];
    existing.push(row);
    quizByStudent.set(row.student_id, existing);
  }

  // Group block times by student
  const blockTimeByStudent = new Map<string, number>(); // studentId → total active seconds
  for (const row of blockTimeRows) {
    const prev = blockTimeByStudent.get(row.student_id) ?? 0;
    blockTimeByStudent.set(row.student_id, prev + Number(row.active_seconds ?? 0));
  }

  // Aggregate per-student visit totals
  const visitTotalsByStudent = new Map<string, { active: number; idle: number }>();
  for (const row of visitRows) {
    const prev = visitTotalsByStudent.get(row.student_id) ?? { active: 0, idle: 0 };
    visitTotalsByStudent.set(row.student_id, {
      active: prev.active + Number(row.active_seconds ?? 0),
      idle: prev.idle + Number(row.idle_seconds ?? 0),
    });
  }

  // Build per-student analytics
  const students: StudentAnalytics[] = allStudentIds.map((sid) => {
    const visits = visitTotalsByStudent.get(sid) ?? { active: 0, idle: 0 };
    const mastery = masteryByStudent.get(sid) ?? null;
    const attempts = quizByStudent.get(sid) ?? [];

    // Sort quiz attempts newest first
    const sortedAttempts = [...attempts].sort((a, b) => {
      const ta = a.submitted_at ?? a.created_at ?? "";
      const tb = b.submitted_at ?? b.created_at ?? "";
      return tb.localeCompare(ta);
    });
    const latestQuizScore = sortedAttempts[0]?.score_percentage ?? null;
    const bestQuizScore =
      attempts.length > 0
        ? Math.max(
            ...attempts
              .map((a) => a.score_percentage)
              .filter((s): s is number => s !== null && Number.isFinite(s))
          )
        : null;

    const studentContentActive = blockTimeByStudent.get(sid) ?? 0;
    const engagement = computeEngagement(studentContentActive, totalRecommendedSeconds);

    return {
      studentId: sid,
      name: profileById.get(sid) ?? "Unknown Student",
      totalActiveSeconds: visits.active,
      totalIdleSeconds: visits.idle,
      masteryScore: mastery?.mastery_score ?? null,
      masteryLevel: mastery?.mastery_level ?? null,
      latestQuizScore: latestQuizScore ?? null,
      bestQuizScore: isFinite(bestQuizScore as number) ? (bestQuizScore as number) : null,
      quizAttempts: attempts.length,
      contentEngagement: engagement,
      badge: masteryLevelToBadge(mastery?.mastery_level ?? null),
    };
  });

  // Sort by mastery score desc, then name
  students.sort((a, b) => {
    if (a.masteryScore !== null && b.masteryScore !== null)
      return b.masteryScore - a.masteryScore;
    if (a.masteryScore !== null) return -1;
    if (b.masteryScore !== null) return 1;
    return a.name.localeCompare(b.name);
  });

  // ── Top-level averages ─────────────────────────────────────────────────────

  const masteriesWithScore = students.filter((s) => s.masteryScore !== null);
  const avgMastery = avg(masteriesWithScore.map((s) => s.masteryScore!));
  const avgActive = avg(students.map((s) => s.totalActiveSeconds));
  const avgIdle = avg(students.map((s) => s.totalIdleSeconds));
  const studentsWithQuiz = students.filter((s) => s.quizAttempts > 0);
  const avgQuiz = avg(
    studentsWithQuiz
      .map((s) => s.bestQuizScore)
      .filter((s): s is number => s !== null)
  );

  const hasQuizData = students.some((s) => s.quizAttempts > 0);

  // ── Chart data ────────────────────────────────────────────────────────────────

  // 1. Active vs idle totals across all students (for HBarChart)
  const chartTotalActive = students.reduce((s, st) => s + st.totalActiveSeconds, 0);
  const chartTotalIdle   = students.reduce((s, st) => s + st.totalIdleSeconds,   0);
  const activeIdleData = [
    { label: "Active time", value: chartTotalActive },
    { label: "Idle time",   value: chartTotalIdle },
  ];

  // 2. Mastery distribution for this submission
  const subMasteryBuckets = [
    { label: "Struggling", count: 0, color: "#f87171" },
    { label: "Developing", count: 0, color: "#fb923c" },
    { label: "Proficient", count: 0, color: "#818cf8" },
    { label: "Mastered",   count: 0, color: "#34d399" },
  ];
  for (const s of students) {
    if (s.masteryScore === null) continue;
    if (s.masteryScore >= 85)      subMasteryBuckets[3].count++;
    else if (s.masteryScore >= 70) subMasteryBuckets[2].count++;
    else if (s.masteryScore >= 40) subMasteryBuckets[1].count++;
    else                           subMasteryBuckets[0].count++;
  }

  // 3. Quiz score trend — daily average across all students' attempts
  const quizByDate = new Map<string, number[]>();
  for (const row of quizRows) {
    const date = (row.submitted_at ?? row.created_at ?? "").slice(0, 10);
    if (!date || row.score_percentage === null) continue;
    const arr = quizByDate.get(date) ?? [];
    arr.push(row.score_percentage);
    quizByDate.set(date, arr);
  }
  const quizTrendData = Array.from(quizByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      label: date.slice(5).replace("-", "/"), // "MM/DD"
      score: scores.reduce((a, b) => a + b, 0) / scores.length,
    }));

  // 4. Content engagement by block — avg active per student vs recommended
  const blockActiveMap = new Map<string, number>();
  for (const row of blockTimeRows) {
    const prev = blockActiveMap.get(row.content_id) ?? 0;
    blockActiveMap.set(row.content_id, prev + Number(row.active_seconds ?? 0));
  }
  const studentCount = allStudentIds.length;
  const contentEngagementData = contentBlockRows
    .map((block) => {
      const totalBlockActive = blockActiveMap.get(block.id) ?? 0;
      const avgActive = studentCount > 0 ? totalBlockActive / studentCount : 0;
      const recommended = block.recommended_time_seconds ?? null;
      const rawTitle = block.title ?? "Untitled";
      const label = rawTitle.length > 22 ? rawTitle.slice(0, 22) + "…" : rawTitle;
      return { label, value: Math.round(avgActive), secondaryValue: recommended };
    })
    .filter((d) => d.value > 0 || d.secondaryValue !== null);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <BackLink />

        <SubmissionHeader
          title={sub.title}
          loTitle={loTitle}
          notes={sub.notes}
          updatedAt={sub.updated_at}
        />

        <div className="h-px w-full bg-slate-800/60" />

        {/* ── Overall averages ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="Avg mastery"
            value={avgMastery !== null ? `${Math.round(avgMastery)}/100` : "—"}
          />
          <SummaryCard
            label="Avg active time"
            value={avgActive !== null ? fmtSeconds(avgActive) : "—"}
          />
          <SummaryCard
            label="Avg idle time"
            value={avgIdle !== null ? fmtSeconds(avgIdle) : "—"}
            dim
          />
          <SummaryCard
            label="Quiz avg (best)"
            value={avgQuiz !== null ? `${Math.round(avgQuiz)}%` : "—"}
          />
        </div>

        {/* ── Charts ────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Engagement Overview
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {/* Active vs idle */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 backdrop-blur-[1px]">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Active vs idle · all students combined
              </p>
              <HBarChart
                data={activeIdleData}
                emptyMessage="No time data yet"
              />
            </div>

            {/* Mastery distribution */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 backdrop-blur-[1px]">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Mastery distribution
              </p>
              <MasteryDistBar buckets={subMasteryBuckets} />
            </div>

            {/* Content engagement by block */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 backdrop-blur-[1px]">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Content engagement · avg time per student
              </p>
              <HBarChart
                data={contentEngagementData}
                primaryLabel="Avg active"
                secondaryLabel="Recommended"
                emptyMessage="No content engagement data yet"
              />
            </div>

            {/* Quiz score trend */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 backdrop-blur-[1px]">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Quiz score trend · daily avg across students
              </p>
              <QuizTrendLine
                points={quizTrendData}
                emptyMessage={hasQuizData ? "Processing…" : "No quiz attempts yet"}
              />
            </div>
          </div>
        </div>

        {/* ── Student table ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            {students.length} Student{students.length !== 1 ? "s" : ""}
          </p>

          <div className="overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/40">
            {/* Table header */}
            <div className="hidden border-b border-slate-800/60 px-4 py-2.5 sm:grid sm:grid-cols-[minmax(140px,2fr)_repeat(6,minmax(80px,1fr))_minmax(100px,1fr)_minmax(90px,1fr)]">
              {[
                "Student",
                "Mastery",
                "Active time",
                "Idle time",
                "Latest quiz",
                "Best quiz",
                "Attempts",
                "Engagement",
                "Level",
              ].map((h) => (
                <span
                  key={h}
                  className="text-[10px] font-semibold uppercase tracking-wider text-slate-600"
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-800/40">
              {students.map((s) => (
                <StudentRow
                  key={s.studentId}
                  student={s}
                  hasQuizData={hasQuizData}
                />
              ))}
            </div>
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
      href={"/teacher/analytics" as any}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 transition-colors hover:text-slate-300"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Analytics
    </Link>
  );
}

function SubmissionHeader({
  title,
  loTitle,
  notes,
  updatedAt,
}: {
  title: string;
  loTitle: string;
  notes: string | null;
  updatedAt: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 shrink-0 text-slate-600" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          {loTitle}
        </p>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-50">{title}</h1>
      {notes && <p className="text-sm leading-relaxed text-slate-400">{notes}</p>}
      <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
        <Clock className="h-3 w-3" />
        Last updated {fmtDate(updatedAt)}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  dim = false,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4 backdrop-blur-[1px]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1.5 text-xl font-bold ${dim ? "text-slate-400" : "text-slate-100"}`}>
        {value}
      </p>
    </div>
  );
}

function StudentRow({
  student: s,
  hasQuizData,
}: {
  student: StudentAnalytics;
  hasQuizData: boolean;
}) {
  const scoreColor = masteryScoreColor(s.masteryScore);
  const engagementColor = engagementStyles(s.contentEngagement);

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:grid sm:grid-cols-[minmax(140px,2fr)_repeat(6,minmax(80px,1fr))_minmax(100px,1fr)_minmax(90px,1fr)] sm:items-center sm:gap-0">
      {/* Name */}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-100">{s.name}</p>
      </div>

      {/* Mastery score */}
      <div>
        <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-slate-600 sm:block">
          Mastery
        </span>
        <p className={`text-sm font-bold ${scoreColor}`}>
          {s.masteryScore !== null ? `${Math.round(s.masteryScore)}` : "—"}
          {s.masteryScore !== null && (
            <span className="text-[10px] font-normal text-slate-600">/100</span>
          )}
        </p>
      </div>

      {/* Active time */}
      <div>
        <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-slate-600 sm:block">
          Active
        </span>
        <p className="text-sm text-slate-200">{fmtSeconds(s.totalActiveSeconds)}</p>
      </div>

      {/* Idle time */}
      <div>
        <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-slate-600 sm:block">
          Idle
        </span>
        <p className="text-sm text-slate-500">{fmtSeconds(s.totalIdleSeconds)}</p>
      </div>

      {/* Latest quiz */}
      <div>
        <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-slate-600 sm:block">
          Latest quiz
        </span>
        <p className="text-sm text-slate-200">
          {s.latestQuizScore !== null ? `${Math.round(s.latestQuizScore)}%` : "—"}
        </p>
      </div>

      {/* Best quiz */}
      <div>
        <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-slate-600 sm:block">
          Best quiz
        </span>
        <p className="text-sm text-slate-200">
          {s.bestQuizScore !== null ? `${Math.round(s.bestQuizScore)}%` : "—"}
        </p>
      </div>

      {/* Quiz attempts */}
      <div>
        <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-slate-600 sm:block">
          Attempts
        </span>
        <p className="text-sm text-slate-400">{s.quizAttempts > 0 ? s.quizAttempts : "—"}</p>
      </div>

      {/* Content engagement */}
      <div>
        <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-slate-600 sm:block">
          Engagement
        </span>
        <p className={`text-xs font-semibold ${engagementColor}`}>{s.contentEngagement}</p>
      </div>

      {/* Level badge */}
      <div>
        <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-slate-600 sm:block">
          Level
        </span>
        {s.badge ? (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeStyles(s.badge)}`}
          >
            {s.badge}
          </span>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </div>
    </div>
  );
}
