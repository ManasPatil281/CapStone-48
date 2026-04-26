import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { requireAuth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ACTIVE_RECALL_DAYS = 0;

type SubmissionDetail = {
  id: string;
  title: string;
  learningObjectId: string;
  learningObjectTitle: string;
  courseTitle: string;
  courseSlug: string;
};

type SectionCard = {
  key: string;
  title: string;
  subtitle?: string;
  meta?: string;
  reason: string;
  helperText?: string;
  ctaLabel: string;
  href: Route;
};

type SectionModel = {
  title: string;
  emptyMessage: string;
  cards: SectionCard[];
};

type VisitRow = {
  submission_id: string | null;
  started_at: string | null;
  ended_at: string | null;
};

type MasteryRow = {
  submission_id: string;
  mastery_score: number | null;
};

type ContentTimeRow = {
  delivery_type_id: string | null;
  active_seconds: number | null;
};

type QuizAttemptRow = {
  submission_id: string | null;
  score_percentage: number | null;
  submitted_at: string | null;
  created_at: string | null;
};

function toMillis(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function buildSubmissionHref(courseSlug: string, submissionId: string): Route {
  return `/courses/${courseSlug}/submission/${submissionId}` as Route;
}

function buildLoHref(courseSlug: string, learningObjectId: string): Route {
  return `/courses/${courseSlug}?lo=${learningObjectId}` as Route;
}

function normalizeSubmissionTitle(raw: string | null | undefined): string {
  const title = raw?.trim();
  return title ? title : "Untitled submission";
}

function normalizeLoTitle(raw: string | null | undefined): string {
  const title = raw?.trim();
  return title ? title : "Untitled learning object";
}

function normalizeCourseTitle(raw: string | null | undefined): string {
  const title = raw?.trim();
  return title ? title : "Untitled course";
}

function formatMastery(score: number | null | undefined): string {
  if (score === null || typeof score === "undefined" || Number.isNaN(score)) {
    return "Not calculated yet";
  }

  return `${Math.round(score)}% mastery`;
}

function formatQuizScore(score: number | null | undefined): string {
  if (score === null || typeof score === "undefined" || Number.isNaN(score)) {
    return "Latest score: -";
  }

  return `Latest score: ${Math.round(score)}%`;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v))));
}

function isSoftDeletedSubmission(notes: string | null | undefined): boolean {
  return (notes ?? "").startsWith("[SOFT_DELETED]");
}

function RecommendationSection({ model }: { model: SectionModel }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{model.title}</h2>

      {model.cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-4 py-5 text-sm text-slate-500">
          {model.emptyMessage}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {model.cards.map((card) => (
            <article
              key={card.key}
              className="flex h-full flex-col gap-3 rounded-lg border border-slate-800/70 bg-slate-950/50 p-4"
            >
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-100">{card.title}</h3>
                {card.subtitle && <p className="text-xs text-slate-400">{card.subtitle}</p>}
                {card.meta && <p className="text-[11px] text-slate-500">{card.meta}</p>}
              </div>

              <p className="text-xs leading-relaxed text-slate-400">{card.reason}</p>
              {card.helperText && <p className="text-xs leading-relaxed text-slate-500">{card.helperText}</p>}

              <Link
                href={card.href}
                className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-colors hover:text-brand/80"
              >
                {card.ctaLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function RecommendationsPage() {
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

  const sectionErrors: string[] = [];

  const submissionById = new Map<string, SubmissionDetail>();
  const masteryBySubmissionId = new Map<string, number | null>();
  const masteredSubmissionIds = new Set<string>();

  const loadSubmissionDetails = async (submissionIds: string[]) => {
    const missing = submissionIds.filter((id) => !submissionById.has(id));
    if (missing.length === 0) {
      return;
    }

    const { data, error } = await supabaseAny
      .from("teacher_lo_submission")
      .select("id, title, notes, course_id, learning_object_id, status, learning_object:learning_object_id(id,title), course:course_id(slug,title)")
      .in("id", missing);

    if (error) {
      throw error;
    }

    (data ?? []).forEach((row: any) => {
      const submissionId = row.id as string;
      const courseSlug = String(row.course?.slug ?? "").trim();
      const loId = String(row.learning_object_id ?? "").trim();

      if (!submissionId || !courseSlug || !loId) {
        return;
      }

      if (row.status !== "approved") {
        return;
      }

      if (isSoftDeletedSubmission(row.notes as string | null | undefined)) {
        return;
      }

      submissionById.set(submissionId, {
        id: submissionId,
        title: normalizeSubmissionTitle(row.title),
        learningObjectId: loId,
        learningObjectTitle: normalizeLoTitle(row.learning_object?.title),
        courseTitle: normalizeCourseTitle(row.course?.title),
        courseSlug,
      });
    });
  };

  // Prime mastery map for section reuse.
  try {
    const { data, error } = await supabaseAny
      .from("student_submission_mastery")
      .select("submission_id, mastery_score")
      .eq("student_id", user.id);

    if (error) throw error;

    ((data ?? []) as MasteryRow[]).forEach((row) => {
      masteryBySubmissionId.set(row.submission_id, row.mastery_score);
      if (typeof row.mastery_score === "number" && row.mastery_score >= 70) {
        masteredSubmissionIds.add(row.submission_id);
      }
    });
  } catch (error) {
    console.error("[RecommendationsPage] Failed to load mastery rows:", error);
    sectionErrors.push("Some mastery-based recommendations are temporarily unavailable.");
  }

  // 1) Continue learning
  const continueLearning: SectionModel = {
    title: "Continue learning",
    emptyMessage: "No in-progress modules found yet. Start a module and it will appear here.",
    cards: [],
  };

  try {
    const { data, error } = await supabaseAny
      .from("student_submission_visit")
      .select("submission_id, started_at, ended_at")
      .eq("student_id", user.id)
      .order("started_at", { ascending: false })
      .limit(40);

    if (error) throw error;

    const latestVisitBySubmission = new Map<string, VisitRow>();
    ((data ?? []) as VisitRow[]).forEach((row) => {
      if (!row.submission_id) return;
      const current = latestVisitBySubmission.get(row.submission_id);
      const rowTs = Math.max(toMillis(row.ended_at), toMillis(row.started_at));
      const currentTs = current
        ? Math.max(toMillis(current.ended_at), toMillis(current.started_at))
        : -1;
      if (rowTs > currentTs) {
        latestVisitBySubmission.set(row.submission_id, row);
      }
    });

    const candidateIds = Array.from(latestVisitBySubmission.keys());
    await loadSubmissionDetails(candidateIds);

    const items = candidateIds
      .map((id) => ({ id, detail: submissionById.get(id), visit: latestVisitBySubmission.get(id) }))
      .filter((item): item is { id: string; detail: SubmissionDetail; visit: VisitRow } =>
        Boolean(item.detail && item.visit)
      )
      .filter((item) => {
        const mastery = masteryBySubmissionId.get(item.id);
        return typeof mastery !== "number" || mastery < 70;
      })
      .sort((a, b) => {
        const aTs = Math.max(toMillis(a.visit.ended_at), toMillis(a.visit.started_at));
        const bTs = Math.max(toMillis(b.visit.ended_at), toMillis(b.visit.started_at));
        return bTs - aTs;
      })
      .slice(0, 5);

    continueLearning.cards = items.map((item) => ({
      key: `continue-${item.id}`,
      title: item.detail.title,
      subtitle: item.detail.learningObjectTitle,
      meta: `${item.detail.courseTitle} • ${formatMastery(masteryBySubmissionId.get(item.id))}`,
      reason: "You started this module but mastery is still developing.",
      ctaLabel: "Continue",
      href: buildSubmissionHref(item.detail.courseSlug, item.id),
    }));
  } catch (error) {
    console.error("[RecommendationsPage] Continue learning section failed:", error);
    sectionErrors.push("Continue learning could not be fully loaded.");
  }

  // 2) Recommended next LOs
  const recommendedNext: SectionModel = {
    title: "Recommended next LOs",
    emptyMessage:
      "No path-based next modules found yet. Keep progressing and we will recommend the next steps.",
    cards: [],
  };

  try {
    const masteredSubmissionIdList = Array.from(masteredSubmissionIds);
    let usedPathSignal = false;

    let targetSubmissionIds: string[] = [];
    if (masteredSubmissionIdList.length > 0) {
      await loadSubmissionDetails(masteredSubmissionIdList);
      const masteredLoIds = uniqueStrings(
        masteredSubmissionIdList.map((id) => submissionById.get(id)?.learningObjectId)
      );

      if (masteredLoIds.length > 0) {
        const { data: edgeRows, error: edgeErr } = await supabaseAny
          .from("teacher_lo_submission_edge")
          .select("source_lo_id, target_lo_id")
          .in("source_lo_id", masteredLoIds);

        if (edgeErr) throw edgeErr;

        const targetLoIds = uniqueStrings((edgeRows ?? []).map((r: any) => r.target_lo_id as string));

        if (targetLoIds.length > 0) {
          usedPathSignal = true;
          const { data: targetRows, error: targetErr } = await supabaseAny
            .from("teacher_lo_submission")
            .select("id, status, notes")
            .eq("status", "approved")
            .in("learning_object_id", targetLoIds)
            .order("updated_at", { ascending: false });

          if (targetErr) throw targetErr;

          targetSubmissionIds = (targetRows ?? [])
            .filter((row: any) => !isSoftDeletedSubmission(row.notes as string | null | undefined))
            .map((row: any) => row.id as string)
            .filter((id: string) => !masteredSubmissionIds.has(id));
        }
      }
    }

    if (targetSubmissionIds.length === 0) {
      // Fallback: recent approved submissions when path data is missing.
      const { data: fallbackRows, error: fallbackErr } = await supabaseAny
        .from("teacher_lo_submission")
        .select("id, status, notes")
        .eq("status", "approved")
        .order("updated_at", { ascending: false })
        .limit(20);

      if (fallbackErr) throw fallbackErr;

      targetSubmissionIds = (fallbackRows ?? [])
        .filter((row: any) => !isSoftDeletedSubmission(row.notes as string | null | undefined))
        .map((row: any) => row.id as string)
        .filter((id: string) => !masteredSubmissionIds.has(id));
    }

    await loadSubmissionDetails(targetSubmissionIds);

    const uniqueCards = uniqueStrings(targetSubmissionIds)
      .map((id) => submissionById.get(id))
      .filter((item): item is SubmissionDetail => Boolean(item))
      .slice(0, 5)
      .map((detail) => ({
        key: `next-${detail.id}`,
        title: detail.learningObjectTitle,
        subtitle: detail.title,
        meta: detail.courseTitle,
        reason: usedPathSignal
          ? "This follows a module where you are already proficient."
          : "Suggested from recently active approved modules while we build your path signal.",
        ctaLabel: "Start",
        href: buildLoHref(detail.courseSlug, detail.learningObjectId),
      }));

    recommendedNext.cards = uniqueCards;
  } catch (error) {
    console.error("[RecommendationsPage] Recommended next LOs section failed:", error);
    sectionErrors.push("Next learning recommendations are temporarily unavailable.");
  }

  // 3) Based on your preferred content style
  const preferredStyle: SectionModel = {
    title: "Based on your preferred content style",
    emptyMessage: "No clear content-style preference yet. Spend more focused time in modules to build this signal.",
    cards: [],
  };

  try {
    const { data: styleRows, error: styleErr } = await supabaseAny
      .from("student_content_block_time")
      .select("delivery_type_id, active_seconds")
      .eq("student_id", user.id);

    if (styleErr) throw styleErr;

    const totalByType = new Map<string, number>();
    ((styleRows ?? []) as ContentTimeRow[]).forEach((row) => {
      if (!row.delivery_type_id) return;
      const current = totalByType.get(row.delivery_type_id) ?? 0;
      totalByType.set(row.delivery_type_id, current + Number(row.active_seconds ?? 0));
    });

    const topType = Array.from(totalByType.entries()).sort((a, b) => b[1] - a[1])[0];

    if (topType) {
      const [deliveryTypeId, _seconds] = topType;

      const [{ data: typeRows, error: typeErr }, { data: contentRows, error: contentErr }] =
        await Promise.all([
          supabaseAny.from("delivery_type").select("id, name").eq("id", deliveryTypeId).maybeSingle(),
          supabaseAny
            .from("teacher_lo_submission_content")
            .select("submission_id")
            .eq("delivery_type_id", deliveryTypeId)
            .eq("is_active", true),
        ]);

      if (typeErr) throw typeErr;
      if (contentErr) throw contentErr;

      const typeName = normalizeCourseTitle((typeRows as { name?: string | null } | null)?.name ?? "Content style");
      const submissionIds = uniqueStrings((contentRows ?? []).map((r: any) => r.submission_id as string)).filter(
        (id) => !masteredSubmissionIds.has(id)
      );

      await loadSubmissionDetails(submissionIds);

      preferredStyle.cards = submissionIds
        .map((id) => submissionById.get(id))
        .filter((item): item is SubmissionDetail => Boolean(item))
        .slice(0, 3)
        .map((detail) => ({
          key: `style-${detail.id}`,
          title: detail.title,
          subtitle: detail.learningObjectTitle,
          meta: `${detail.courseTitle} • ${typeName}`,
          reason: `You spend more focused time with ${typeName}.`,
          ctaLabel: "Try similar content",
          href: buildSubmissionHref(detail.courseSlug, detail.id),
        }));
    }
  } catch (error) {
    console.error("[RecommendationsPage] Preferred content style section failed:", error);
    sectionErrors.push("Content-style recommendations are temporarily unavailable.");
  }

  // 4) Active recall / revision reminders
  const activeRecall: SectionModel = {
    title: "Active recall / revision reminders",
    emptyMessage: "No revision reminders yet. This appears after strong quiz attempts age for a couple of days.",
    cards: [],
  };

  try {
    const { data: attempts, error: attemptErr } = await supabaseAny
      .from("student_quiz_attempt")
      .select("submission_id, score_percentage, submitted_at, created_at")
      .eq("student_id", user.id)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(200);

    if (attemptErr) throw attemptErr;

    const latestAttemptBySubmission = new Map<string, QuizAttemptRow>();
    ((attempts ?? []) as QuizAttemptRow[]).forEach((row) => {
      if (!row.submission_id) return;
      const current = latestAttemptBySubmission.get(row.submission_id);
      const rowTs = Math.max(toMillis(row.submitted_at), toMillis(row.created_at));
      const currentTs = current
        ? Math.max(toMillis(current.submitted_at), toMillis(current.created_at))
        : -1;
      if (rowTs > currentTs) {
        latestAttemptBySubmission.set(row.submission_id, row);
      }
    });

    const thresholdMs = Date.now() - ACTIVE_RECALL_DAYS * 24 * 60 * 60 * 1000;

    const candidateIds = Array.from(latestAttemptBySubmission.entries())
      .filter(([, row]) => Number(row.score_percentage ?? 0) >= 70)
      .filter(([, row]) => {
        const ts = Math.max(toMillis(row.submitted_at), toMillis(row.created_at));
        return ts > 0 && ts < thresholdMs;
      })
      .map(([submissionId]) => submissionId);

    await loadSubmissionDetails(candidateIds);

    activeRecall.cards = candidateIds
      .map((id) => ({ id, detail: submissionById.get(id), attempt: latestAttemptBySubmission.get(id) }))
      .filter((item): item is { id: string; detail: SubmissionDetail; attempt: QuizAttemptRow } =>
        Boolean(item.detail && item.attempt)
      )
      .slice(0, 5)
      .map((item) => ({
        key: `recall-${item.id}`,
        title: item.detail.title,
        subtitle: item.detail.learningObjectTitle,
        meta: `${item.detail.courseTitle} • ${formatQuizScore(item.attempt.score_percentage)}`,
        reason: "You did well earlier. Revisit it to strengthen retention.",
        ctaLabel: "Revise quiz",
        href: buildSubmissionHref(item.detail.courseSlug, item.id),
      }));
  } catch (error) {
    console.error("[RecommendationsPage] Active recall section failed:", error);
    sectionErrors.push("Revision reminders are temporarily unavailable.");
  }

  // 5) Feynman technique prototype
  const feynmanPrototype: SectionModel = {
    title: "Feynman technique prototype",
    emptyMessage: "No low-mastery submissions yet for explanation practice.",
    cards: [],
  };

  try {
    const underMasteredIds = Array.from(masteryBySubmissionId.entries())
      .filter(([, score]) => typeof score === "number" && score < 70)
      .map(([submissionId]) => submissionId)
      .slice(0, 12);

    await loadSubmissionDetails(underMasteredIds);

    feynmanPrototype.cards = underMasteredIds
      .map((id) => submissionById.get(id))
      .filter((item): item is SubmissionDetail => Boolean(item))
      .slice(0, 3)
      .map((detail) => ({
        key: `feynman-${detail.id}`,
        title: "Explain this concept in your own words",
        subtitle: `${detail.title} • ${detail.learningObjectTitle}`,
        meta: detail.courseTitle,
        reason: "Explaining the concept can reveal gaps in understanding.",
        helperText:
          "Feynman explanation scoring can be connected to the existing AI tutor in the next phase.",
        ctaLabel: "Explain concept",
        href: `/recommendations/feynman/${detail.id}` as Route,
      }));
  } catch (error) {
    console.error("[RecommendationsPage] Feynman section failed:", error);
    sectionErrors.push("Feynman prototype suggestions are temporarily unavailable.");
  }

  const sections = [
    continueLearning,
    recommendedNext,
    preferredStyle,
    activeRecall,
    feynmanPrototype,
  ];

  const hasAnyCards = sections.some((section) => section.cards.length > 0);

  const starterRecommendations: SectionCard[] = [];
  if (!hasAnyCards) {
    try {
      const { data, error } = await supabaseAny
        .from("teacher_lo_submission")
        .select("id, status, notes")
        .eq("status", "approved")
        .order("updated_at", { ascending: false })
        .limit(12);

      if (error) throw error;

      const ids = (data ?? [])
        .filter((row: any) => !isSoftDeletedSubmission(row.notes as string | null | undefined))
        .map((row: any) => row.id as string)
        .slice(0, 6);

      await loadSubmissionDetails(ids);

      starterRecommendations.push(
        ...ids
          .map((id: string) => submissionById.get(id))
          .filter((item: SubmissionDetail | undefined): item is SubmissionDetail => Boolean(item))
          .slice(0, 5)
          .map((detail: SubmissionDetail) => ({
            key: `starter-${detail.id}`,
            title: detail.title,
            subtitle: detail.learningObjectTitle,
            meta: detail.courseTitle,
            reason: "A good place to continue your progress while we gather more learning signals.",
            ctaLabel: "Start",
            href: buildSubmissionHref(detail.courseSlug, detail.id),
          }))
      );
    } catch (error) {
      console.error("[RecommendationsPage] Starter recommendations failed:", error);
      sectionErrors.push("Starter recommendations are temporarily unavailable.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Link>

          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-50">Recommendations</h1>
            <p className="mt-1 text-sm text-slate-500">
              Personalised suggestions based on your learning activity, quiz performance, and content
              preferences.
            </p>
          </div>
        </div>

        {sectionErrors.length > 0 && (
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
            {Array.from(new Set(sectionErrors)).join(" ")}
          </div>
        )}

        <RecommendationSection model={continueLearning} />
        <RecommendationSection model={recommendedNext} />
        <RecommendationSection model={preferredStyle} />
        <RecommendationSection model={activeRecall} />
        <RecommendationSection model={feynmanPrototype} />

        {!hasAnyCards && (
          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Starter recommendations
            </h2>

            {starterRecommendations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-4 py-5 text-sm text-slate-500">
                No approved submissions are available right now.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {starterRecommendations.map((card) => (
                  <article
                    key={card.key}
                    className="flex h-full flex-col gap-3 rounded-lg border border-slate-800/70 bg-slate-950/50 p-4"
                  >
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-slate-100">{card.title}</h3>
                      {card.subtitle && <p className="text-xs text-slate-400">{card.subtitle}</p>}
                      {card.meta && <p className="text-[11px] text-slate-500">{card.meta}</p>}
                    </div>

                    <p className="text-xs leading-relaxed text-slate-400">{card.reason}</p>

                    <Link
                      href={card.href}
                      className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-colors hover:text-brand/80"
                    >
                      {card.ctaLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
