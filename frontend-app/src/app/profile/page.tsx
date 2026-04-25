import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type VisitRow = {
  submission_id: string | null;
  learning_object_id: string | null;
  teacher_id: string | null;
  active_seconds: number | null;
  idle_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
};

type QuizAttemptRow = {
  id: string;
  submission_id: string | null;
  score_percentage: number | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

type ContentTimeRow = {
  delivery_type_id: string | null;
  active_seconds: number | null;
};

type SubmissionRow = {
  id: string;
  title: string | null;
  learning_object_id: string | null;
};

type LearningObjectRow = {
  id: string;
  title: string | null;
};

type DeliveryTypeRow = {
  id: string;
  name: string | null;
};

type UserProfileRow = {
  id: string;
  full_name: string | null;
};

type RecentlyVisitedItem = {
  submissionTitle: string;
  loTitle: string;
  lastVisitedAt: string | null;
};

type TopPreferenceItem = {
  name: string;
  totalSeconds: number;
};

type TopTeacherItem = {
  name: string;
  totalSeconds: number;
};

type QuizSubmissionPerformanceItem = {
  submissionId: string;
  submissionTitle: string;
  loTitle: string;
  latestAttemptScore: number | null;
  bestScore: number | null;
  totalAttempts: number;
  latestAttemptAt: string | null;
};

function secondsToMinutesLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes.toLocaleString()} min`;
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }

  return `${Math.round(value)}%`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

function getAttemptTimestamp(attempt: QuizAttemptRow): string | null {
  if (attempt.submitted_at) {
    return attempt.submitted_at;
  }

  return attempt.created_at ?? null;
}

function getAttemptTimeMs(attempt: QuizAttemptRow): number {
  const timestamp = getAttemptTimestamp(attempt);
  if (!timestamp) {
    return 0;
  }

  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function getOverallRingTheme(score: number | null): {
  arc: string;
  textClass: string;
} {
  if (score === null || Number.isNaN(score)) {
    return {
      arc: "rgba(100, 116, 139, 0.9)",
      textClass: "text-slate-300",
    };
  }

  if (score <= 39) {
    return {
      arc: "rgba(248, 113, 113, 0.95)",
      textClass: "text-red-300",
    };
  }

  if (score <= 69) {
    return {
      arc: "rgba(251, 146, 60, 0.95)",
      textClass: "text-orange-300",
    };
  }

  return {
    arc: "rgba(74, 222, 128, 0.95)",
    textClass: "text-emerald-300",
  };
}

export default async function ProfilePage() {
  const user = await requireAuth();

  if (user.role === "TEACHER" || user.role === "ADMIN") {
    redirect("/teacher");
  }

  if (user.role !== "STUDENT") {
    redirect("/dashboard");
  }

  const supabase = createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  const errorNotices: string[] = [];

  let visitRows: VisitRow[] = [];
  try {
    const { data, error } = await supabaseAny
      .from("student_submission_visit")
      .select("submission_id, learning_object_id, teacher_id, active_seconds, idle_seconds, started_at, ended_at")
      .eq("student_id", user.id);

    if (error) {
      throw error;
    }

    visitRows = (data ?? []) as VisitRow[];
  } catch (err) {
    console.error("[ProfilePage] Failed to load visit rows:", err);
    errorNotices.push("Some visit metrics could not be loaded.");
  }

  let recentVisitRows: VisitRow[] = [];
  try {
    const { data, error } = await supabaseAny
      .from("student_submission_visit")
      .select("submission_id, learning_object_id, teacher_id, active_seconds, idle_seconds, started_at, ended_at")
      .eq("student_id", user.id)
      .order("started_at", { ascending: false })
      .limit(5);

    if (error) {
      throw error;
    }

    recentVisitRows = (data ?? []) as VisitRow[];
  } catch (err) {
    console.error("[ProfilePage] Failed to load recent visits:", err);
    errorNotices.push("Recent visits are temporarily unavailable.");
  }

  let quizAttemptRows: QuizAttemptRow[] = [];
  try {
    const { data, error } = await supabaseAny
      .from("student_quiz_attempt")
      .select("id, submission_id, score_percentage, submitted_at, created_at")
      .eq("student_id", user.id)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false });

    if (error) {
      throw error;
    }

    quizAttemptRows = (data ?? []) as QuizAttemptRow[];
  } catch (err) {
    console.error("[ProfilePage] Failed to load quiz attempts:", err);
    errorNotices.push("Quiz metrics are temporarily unavailable.");
  }

  let contentTimeRows: ContentTimeRow[] = [];
  try {
    const { data, error } = await supabaseAny
      .from("student_content_block_time")
      .select("delivery_type_id, active_seconds")
      .eq("student_id", user.id);

    if (error) {
      throw error;
    }

    contentTimeRows = (data ?? []) as ContentTimeRow[];
  } catch (err) {
    console.error("[ProfilePage] Failed to load content time rows:", err);
    errorNotices.push("Content preference data is temporarily unavailable.");
  }

  const recentSubmissionIds = Array.from(
    new Set(recentVisitRows.map((row) => row.submission_id).filter((id): id is string => Boolean(id)))
  );

  const submissionById = new Map<string, SubmissionRow>();
  if (recentSubmissionIds.length > 0) {
    try {
      const { data, error } = await supabaseAny
        .from("teacher_lo_submission")
        .select("id, title, learning_object_id")
        .in("id", recentSubmissionIds);

      if (error) {
        throw error;
      }

      ((data ?? []) as SubmissionRow[]).forEach((row) => {
        submissionById.set(row.id, row);
      });
    } catch (err) {
      console.error("[ProfilePage] Failed to load submission titles:", err);
      errorNotices.push("Submission titles could not be resolved for recent visits.");
    }
  }

  const recentLoIds = new Set<string>();
  recentVisitRows.forEach((row) => {
    if (row.learning_object_id) {
      recentLoIds.add(row.learning_object_id);
    }

    const submission = row.submission_id ? submissionById.get(row.submission_id) : null;
    if (submission?.learning_object_id) {
      recentLoIds.add(submission.learning_object_id);
    }
  });

  const loById = new Map<string, LearningObjectRow>();
  if (recentLoIds.size > 0) {
    try {
      const { data, error } = await supabaseAny
        .from("learning_object")
        .select("id, title")
        .in("id", Array.from(recentLoIds));

      if (error) {
        throw error;
      }

      ((data ?? []) as LearningObjectRow[]).forEach((row) => {
        loById.set(row.id, row);
      });
    } catch (err) {
      console.error("[ProfilePage] Failed to load learning object titles:", err);
      errorNotices.push("Learning object titles could not be resolved.");
    }
  }

  const totalActiveSeconds = visitRows.reduce((sum, row) => sum + Number(row.active_seconds ?? 0), 0);
  const submissionCount = new Set(
    visitRows.map((row) => row.submission_id).filter((id): id is string => Boolean(id))
  ).size;
  const quizAttemptCount = quizAttemptRows.length;
  const quizScoredAttempts = quizAttemptRows
    .map((row) => (typeof row.score_percentage === "number" ? row.score_percentage : null))
    .filter((score): score is number => score !== null);
  const averageScore =
    quizScoredAttempts.length > 0
      ? quizScoredAttempts.reduce((sum, score) => sum + score, 0) / quizScoredAttempts.length
      : null;

  const recentlyVisited: RecentlyVisitedItem[] = recentVisitRows.map((row) => {
    const submission = row.submission_id ? submissionById.get(row.submission_id) : null;
    const fallbackLoId = submission?.learning_object_id ?? null;
    const loId = row.learning_object_id ?? fallbackLoId;
    const lo = loId ? loById.get(loId) : null;

    return {
      submissionTitle: submission?.title || "Untitled submission",
      loTitle: lo?.title || "Unknown learning object",
      lastVisitedAt: row.ended_at ?? row.started_at,
    };
  });

  const contentSecondsByType = new Map<string, number>();
  contentTimeRows.forEach((row) => {
    if (!row.delivery_type_id) {
      return;
    }

    const current = contentSecondsByType.get(row.delivery_type_id) ?? 0;
    contentSecondsByType.set(row.delivery_type_id, current + Number(row.active_seconds ?? 0));
  });

  const topDeliveryTypeIds = Array.from(contentSecondsByType.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([deliveryTypeId]) => deliveryTypeId);

  const deliveryTypeById = new Map<string, DeliveryTypeRow>();
  if (topDeliveryTypeIds.length > 0) {
    try {
      const { data, error } = await supabaseAny
        .from("delivery_type")
        .select("id, name")
        .in("id", topDeliveryTypeIds);

      if (error) {
        throw error;
      }

      ((data ?? []) as DeliveryTypeRow[]).forEach((row) => {
        deliveryTypeById.set(row.id, row);
      });
    } catch (err) {
      console.error("[ProfilePage] Failed to load delivery types:", err);
      errorNotices.push("Delivery type labels could not be loaded.");
    }
  }

  const topPreferences: TopPreferenceItem[] = topDeliveryTypeIds.map((deliveryTypeId) => ({
    name: deliveryTypeById.get(deliveryTypeId)?.name || "Unknown type",
    totalSeconds: contentSecondsByType.get(deliveryTypeId) ?? 0,
  }));

  const teacherSecondsById = new Map<string, number>();
  visitRows.forEach((row) => {
    if (!row.teacher_id) {
      return;
    }

    const current = teacherSecondsById.get(row.teacher_id) ?? 0;
    teacherSecondsById.set(row.teacher_id, current + Number(row.active_seconds ?? 0));
  });

  const topTeacherIds = Array.from(teacherSecondsById.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([teacherId]) => teacherId);

  const teacherNameById = new Map<string, string>();
  if (topTeacherIds.length > 0) {
    try {
      const { data, error } = await supabaseAny
        .from("user_profile")
        .select("id, full_name")
        .in("id", topTeacherIds);

      if (error) {
        throw error;
      }

      ((data ?? []) as UserProfileRow[]).forEach((row) => {
        teacherNameById.set(row.id, row.full_name || "Unknown teacher");
      });
    } catch (err) {
      console.error("[ProfilePage] Failed to load teacher names:", err);
      errorNotices.push("Teacher names could not be resolved.");
    }
  }

  const topTeachers: TopTeacherItem[] = topTeacherIds.map((teacherId) => ({
    name: teacherNameById.get(teacherId) || "Unknown teacher",
    totalSeconds: teacherSecondsById.get(teacherId) ?? 0,
  }));

  const quizSubmissionIds = Array.from(
    new Set(quizAttemptRows.map((row) => row.submission_id).filter((id): id is string => Boolean(id)))
  );

  if (quizSubmissionIds.length > 0) {
    const unresolvedSubmissionIds = quizSubmissionIds.filter((submissionId) => !submissionById.has(submissionId));

    if (unresolvedSubmissionIds.length > 0) {
      try {
        const { data, error } = await supabaseAny
          .from("teacher_lo_submission")
          .select("id, title, learning_object_id")
          .in("id", unresolvedSubmissionIds);

        if (error) {
          throw error;
        }

        ((data ?? []) as SubmissionRow[]).forEach((row) => {
          submissionById.set(row.id, row);
        });
      } catch (err) {
        console.error("[ProfilePage] Failed to load quiz submission titles:", err);
        errorNotices.push("Quiz submission titles could not be resolved.");
      }
    }

    const unresolvedQuizLoIds = Array.from(
      new Set(
        quizSubmissionIds
          .map((submissionId) => submissionById.get(submissionId)?.learning_object_id)
          .filter((id): id is string => Boolean(id))
          .filter((id) => !loById.has(id))
      )
    );

    if (unresolvedQuizLoIds.length > 0) {
      try {
        const { data, error } = await supabaseAny
          .from("learning_object")
          .select("id, title")
          .in("id", unresolvedQuizLoIds);

        if (error) {
          throw error;
        }

        ((data ?? []) as LearningObjectRow[]).forEach((row) => {
          loById.set(row.id, row);
        });
      } catch (err) {
        console.error("[ProfilePage] Failed to load quiz learning object titles:", err);
        errorNotices.push("Quiz learning object titles could not be resolved.");
      }
    }
  }

  const quizAttemptsBySubmission = new Map<string, QuizAttemptRow[]>();
  quizAttemptRows.forEach((attempt) => {
    if (!attempt.submission_id) {
      return;
    }

    const list = quizAttemptsBySubmission.get(attempt.submission_id) ?? [];
    list.push(attempt);
    quizAttemptsBySubmission.set(attempt.submission_id, list);
  });

  const quizSubmissionPerformance: QuizSubmissionPerformanceItem[] = Array.from(
    quizAttemptsBySubmission.entries()
  )
    .map(([submissionId, attempts]) => {
      const sortedAttempts = [...attempts].sort((a, b) => {
        return getAttemptTimeMs(b) - getAttemptTimeMs(a);
      });

      const latestAttempt = sortedAttempts[0] ?? null;
      const attemptScores = sortedAttempts
        .map((attempt) =>
          typeof attempt.score_percentage === "number" ? attempt.score_percentage : null
        )
        .filter((score): score is number => score !== null);

      const submission = submissionById.get(submissionId);
      const lo = submission?.learning_object_id ? loById.get(submission.learning_object_id) : null;

      return {
        submissionId,
        submissionTitle: submission?.title || "Untitled submission",
        loTitle: lo?.title || "Unknown learning object",
        latestAttemptScore:
          latestAttempt && typeof latestAttempt.score_percentage === "number"
            ? latestAttempt.score_percentage
            : null,
        bestScore: attemptScores.length > 0 ? Math.max(...attemptScores) : null,
        totalAttempts: sortedAttempts.length,
        latestAttemptAt: latestAttempt ? getAttemptTimestamp(latestAttempt) : null,
      };
    })
    .sort((a, b) => {
      const aTime = a.latestAttemptAt ? new Date(a.latestAttemptAt).getTime() : 0;
      const bTime = b.latestAttemptAt ? new Date(b.latestAttemptAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 3);

  const averageScoreForRing = Math.max(0, Math.min(100, Math.round(averageScore ?? 0)));
  const overallRingTheme = getOverallRingTheme(averageScore);

  const latestAttemptedSubmissionId = quizAttemptRows
    .filter((attempt): attempt is QuizAttemptRow & { submission_id: string } => Boolean(attempt.submission_id))
    .sort((a, b) => getAttemptTimeMs(b) - getAttemptTimeMs(a))[0]?.submission_id;

  const latestSubmissionTrendAttempts = latestAttemptedSubmissionId
    ? quizAttemptRows
        .filter((attempt) => attempt.submission_id === latestAttemptedSubmissionId)
        .sort((a, b) => getAttemptTimeMs(a) - getAttemptTimeMs(b))
    : [];

  const latestTrendSubmission = latestAttemptedSubmissionId
    ? submissionById.get(latestAttemptedSubmissionId)
    : null;

  const latestTrendLo = latestTrendSubmission?.learning_object_id
    ? loById.get(latestTrendSubmission.learning_object_id)
    : null;

  const latestTrendPoints = latestSubmissionTrendAttempts
    .map((attempt, index) => {
      if (typeof attempt.score_percentage !== "number") {
        return null;
      }

      return {
        label: `#${index + 1}`,
        value: Math.max(0, Math.min(100, attempt.score_percentage)),
      };
    })
    .filter((item): item is { label: string; value: number } => Boolean(item));

  const displayName = user.profile?.full_name || user.email?.split("@")[0] || user.email || "Student";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-label text-slate-600">Student Profile</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">{displayName}</h1>
          <p className="text-sm text-slate-500">Your read-only learning analytics summary.</p>
        </div>

        {errorNotices.length > 0 && (
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
            <p className="font-semibold">Some analytics are temporarily unavailable.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errorNotices.map((notice, index) => (
                <li key={`${notice}-${index}`}>{notice}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Total time spent" value={secondsToMinutesLabel(totalActiveSeconds)} />
          <SummaryCard label="Submissions visited" value={submissionCount.toLocaleString()} />
          <SummaryCard label="Quiz attempts" value={quizAttemptCount.toLocaleString()} />
          <SummaryCard label="Average score" value={formatPercent(averageScore)} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-5">
            <h2 className="text-sm font-semibold text-slate-100">Recently visited learning objects</h2>
            <div className="mt-4 space-y-3">
              {recentlyVisited.length === 0 && <EmptyState text="No submission visits yet." />}

              {recentlyVisited.map((item, index) => (
                <div key={`${item.submissionTitle}-${index}`} className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-3">
                  <p className="text-sm font-medium text-slate-200">{item.submissionTitle}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{item.loTitle}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Last visited: {formatDateTime(item.lastVisitedAt)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-5">
            <h2 className="text-sm font-semibold text-slate-100">Top content preferences</h2>
            <div className="mt-4 space-y-3">
              {topPreferences.length === 0 && <EmptyState text="No content timing data yet." />}

              {topPreferences.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2.5">
                  <span className="text-sm text-slate-200">{item.name}</span>
                  <span className="text-xs font-semibold text-slate-400">{secondsToMinutesLabel(item.totalSeconds)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-5">
            <h2 className="text-sm font-semibold text-slate-100">Most viewed teachers</h2>
            <div className="mt-4 space-y-3">
              {topTeachers.length === 0 && <EmptyState text="No teacher engagement data yet." />}

              {topTeachers.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2.5">
                  <span className="text-sm text-slate-200">{item.name}</span>
                  <span className="text-xs font-semibold text-slate-400">{secondsToMinutesLabel(item.totalSeconds)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-5">
            <h2 className="text-sm font-semibold text-slate-100">Quiz performance</h2>
            <div className="mt-4 space-y-3">
              {quizAttemptRows.length === 0 && <EmptyState text="No quiz attempts yet." />}

              {quizAttemptRows.length > 0 && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-label text-slate-500">Overall average</p>
                    <div className="mt-3 flex items-center gap-4">
                      <div
                        className="relative h-14 w-14 rounded-full"
                        style={{
                          background: `conic-gradient(${overallRingTheme.arc} ${averageScoreForRing}%, rgba(51, 65, 85, 0.75) ${averageScoreForRing}% 100%)`,
                        }}
                      >
                        <div className={`absolute inset-[6px] flex items-center justify-center rounded-full bg-slate-950 text-xs font-semibold ${overallRingTheme.textClass}`}>
                          {formatPercent(averageScore)}
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-slate-200">Average quiz score</p>
                        <p className="text-xs text-slate-500">Across {quizAttemptRows.length.toLocaleString()} attempts</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-label text-slate-500">
                      Percentage trend for latest attempted quiz module
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-200">
                      {latestTrendLo?.title || "Unknown learning object"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {latestTrendSubmission?.title || "Untitled submission"}
                    </p>

                    <div className="mt-3">
                      {latestTrendPoints.length >= 2 ? (
                        <QuizTrendSparkline points={latestTrendPoints} />
                      ) : (
                        <p className="rounded-md border border-dashed border-slate-800/80 bg-slate-900/30 px-3 py-3 text-xs text-slate-500">
                          Attempt the quiz again to see your trend.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {quizSubmissionPerformance.map((item) => (
                <div key={item.submissionId} className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-3">
                  <p className="text-sm font-medium text-slate-200">{item.loTitle}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{item.submissionTitle}</p>
                  <div className="mt-2 space-y-1">
                    <MetricLine label="Latest attempt" value={formatPercent(item.latestAttemptScore)} />
                    <MetricLine label="Best score" value={formatPercent(item.bestScore)} />
                    <MetricLine label="Total attempts" value={item.totalAttempts.toLocaleString()} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-label text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-100">{value}</p>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-800/80 bg-slate-900/30 px-3 py-4 text-sm text-slate-500">
      {text}
    </p>
  );
}

function QuizTrendSparkline({ points }: { points: Array<{ label: string; value: number }> }) {
  const width = 220;
  const height = 84;
  const paddingX = 14;
  const paddingY = 10;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;

  const chartPoints = points.map((point, index) => {
    const x =
      points.length === 1
        ? width / 2
        : paddingX + (index / (points.length - 1)) * usableWidth;
    const y = paddingY + (1 - point.value / 100) * usableHeight;
    return { ...point, x, y };
  });

  const polylinePoints = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="rounded-md border border-slate-800/70 bg-slate-900/30 p-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        role="img"
        aria-label="Quiz score trend"
      >
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="rgba(71,85,105,0.65)" strokeWidth="1" />
        <line x1={paddingX} y1={paddingY} x2={paddingX} y2={height - paddingY} stroke="rgba(71,85,105,0.65)" strokeWidth="1" />

        <polyline
          fill="none"
          stroke="rgba(74, 222, 128, 0.95)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polylinePoints}
        />

        {chartPoints.map((point) => (
          <circle
            key={`${point.label}-${point.x}`}
            cx={point.x}
            cy={point.y}
            r="3"
            fill="rgba(74, 222, 128, 1)"
          />
        ))}
      </svg>

      <div className="mt-1 flex items-center justify-between px-1">
        <span className="text-[10px] text-slate-500">Attempt #1</span>
        <span className="text-[10px] text-slate-500">Attempt #{points.length}</span>
      </div>
    </div>
  );
}
