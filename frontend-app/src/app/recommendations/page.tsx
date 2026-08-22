import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Route } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { requireAuth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gatherRankedCandidates } from "@/lib/adaptive/candidateSubmissions";
import { buildFocusResultFromState } from "@/lib/recommendations/buildFocusResult";
import {
  computeFocusFingerprint,
  parseCachedFocusView,
  FOCUS_CACHE_COOKIE,
  FOCUS_CACHE_SCHEMA_VERSION,
  type CachedFocusView,
} from "@/lib/recommendations/focusCache";
import { FocusCard } from "@/components/recommendations/FocusCard";
import { FocusCacheWriter } from "@/components/recommendations/FocusCacheWriter";
import { SecondaryRoadblockList, type SecondaryCandidateSummary } from "@/components/recommendations/SecondaryRoadblockList";

// Same demo threshold used by src/lib/adaptive/studentLearningState.ts's
// revision.activeRecallEligible (kept in sync, not duplicated as new logic).
// This is a same-day placeholder, NOT a real spaced-repetition interval —
// copy in this file must not imply otherwise.
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

              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Why this is here
                </p>
                <p className="text-xs leading-relaxed text-slate-300">{card.reason}</p>
              </div>
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
  const latestVisitBySubmission = new Map<string, VisitRow>();
  const latestAttemptBySubmission = new Map<string, QuizAttemptRow>();

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
      .select(
        "id, title, notes, course_id, learning_object_id, status, learning_object:learning_object_id(id,title), course:course_id(slug,title)"
      )
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

  // --- Primary adaptive pipeline: StudentLearningState -> RoadblockEvidence -> Diagnosis -> Pedagogical Planner ---
  // Candidate ranking is fully deterministic (see candidateSubmissions.ts). Only the single
  // highest-priority candidate is auto-analyzed by the LLM-based Diagnostic Agent + Planner;
  // everything else stays free until the student explicitly asks for it (SecondaryRoadblockList).
  const { candidates, recentVisitRows } = await gatherRankedCandidates(user.id);
  const focusCandidate = candidates[0] ?? null;

  // Session-level cache (see focusCache.ts): reuse the last computed Focus
  // card for this exact submission if nothing evidence-relevant changed,
  // instead of re-running the Diagnostic Agent + Planner on every revisit.
  let focusView: CachedFocusView | null = null;
  let focusIsFreshComputation = false;

  if (focusCandidate) {
    const fingerprint = computeFocusFingerprint(focusCandidate);
    const cached = parseCachedFocusView(cookies().get(FOCUS_CACHE_COOKIE)?.value);

    if (cached && cached.submissionId === focusCandidate.submissionId && cached.fingerprint === fingerprint) {
      focusView = cached;
    } else {
      try {
        const focusResult = await buildFocusResultFromState(focusCandidate.state, focusCandidate.evidence);
        focusView = {
          schemaVersion: FOCUS_CACHE_SCHEMA_VERSION,
          submissionId: focusResult.submissionId,
          fingerprint,
          submissionTitle: focusResult.submissionTitle,
          learningObjectId: focusResult.learningObjectId,
          learningObjectTitle: focusResult.learningObjectTitle,
          courseTitle: focusResult.courseTitle,
          masteryScore: focusResult.masteryScore,
          masteryLevel: focusResult.masteryLevel,
          hasRoadblock: focusResult.hasRoadblock,
          evidenceBullets: focusResult.evidenceBullets,
          evidenceDetails: focusResult.evidenceDetails,
          diagnosisType: focusResult.diagnosis.diagnosisType,
          // studentSummary/studentReason are already written in second
          // person by the Diagnostic Agent / Pedagogical Planner (schema-
          // native fields) — cached and rendered as-is, no transform step.
          // See focusCache.ts's v5 comment.
          studentSummary: focusResult.diagnosis.studentSummary,
          actionLabel: focusResult.actionLabel,
          actionDetail: focusResult.actionDetail,
          actionHref: focusResult.actionHref,
          opensRemediation: focusResult.opensRemediation,
          studentReason: focusResult.plan.studentReason,
          suppressedLoIds: focusResult.suppressedLoIds,
          focusTargetSubmissionId: focusResult.focusTargetSubmissionId,
          focusTargetLoId: focusResult.focusTargetLoId,
        };
        focusIsFreshComputation = true;
      } catch (error) {
        console.error("[RecommendationsPage] Focus analysis failed:", error);
        sectionErrors.push("Your personalised focus area is temporarily unavailable.");
      }
    }
  }

  const secondaryCandidates: SecondaryCandidateSummary[] = candidates
    .slice(1)
    .filter((c) => c.evidence.hasPotentialRoadblock)
    .slice(0, 3)
    .map((c) => ({
      submissionId: c.submissionId,
      learningObjectId: c.state.learningObject?.id ?? null,
      learningObjectTitle: c.state.learningObject?.title ?? "Untitled topic",
      courseTitle: c.state.course?.title ?? "",
    }));

  // --- Cross-section precedence/dedup (see docs §27.8, §27.11) ---
  // A submission or LO already surfaced by a higher-priority section is
  // excluded from every lower-priority section, so the page never shows
  // the same item twice or a recommendation that contradicts the primary
  // plan. Precedence: Focus (+ its actionable target) -> Other roadblock
  // areas -> Continue learning -> Might be worth revisiting -> Ready to
  // explore next -> Practice explaining.
  const usedSubmissionIds = new Set<string>();
  const usedLoIds = new Set<string>();
  if (focusCandidate) {
    usedSubmissionIds.add(focusCandidate.submissionId);
    if (focusView?.learningObjectId) usedLoIds.add(focusView.learningObjectId);
  }
  // Whatever the Focus card's planner action actually targets (e.g. the real
  // "Pointers and references" submission for REVISIT_PREREQUISITE, the
  // chosen alternative for TRY_DIFFERENT_METHOD, the postrequisite for
  // ADVANCE) is just as "claimed" as the focus submission itself — generic,
  // not action-specific, so no action needs to be hardcoded here. This is
  // what fixes a REVISIT_PREREQUISITE target reappearing under "Continue
  // learning" (root cause: only the postrequisite-suppression rule existed
  // before; the actual resolved target was never added to the used sets).
  if (focusView?.focusTargetSubmissionId) usedSubmissionIds.add(focusView.focusTargetSubmissionId);
  if (focusView?.focusTargetLoId) usedLoIds.add(focusView.focusTargetLoId);
  secondaryCandidates.forEach((c) => {
    usedSubmissionIds.add(c.submissionId);
    if (c.learningObjectId) usedLoIds.add(c.learningObjectId);
  });
  // LO ids the primary plan says are not appropriate to present as "ready to
  // explore next" yet (current LO + its postrequisites unless the plan is
  // actively ADVANCE — see translateForStudent.ts's computeSuppressedLoIds()).
  const suppressedLoIds = new Set(focusView?.suppressedLoIds ?? []);

  // Sections are computed AND rendered in strict precedence order (see the
  // usedSubmissionIds/usedLoIds comment above): Continue learning -> Might be
  // worth revisiting -> Ready to explore next -> Practice explaining a
  // concept. Each section excludes anything already claimed by a
  // higher-priority section, then adds its own picks before the next section
  // runs, so nothing appears twice and nothing contradicts the Focus card.

  // 1) Continue learning
  const continueLearning: SectionModel = {
    title: "Continue learning",
    emptyMessage: "No in-progress modules found yet. Start a module and it will appear here.",
    cards: [],
  };

  try {
    // Reuses the visit rows gatherRankedCandidates() already fetched
    // (identical table/columns/filter/order/limit) instead of re-querying —
    // issuing the exact same PostgREST GET request twice within one
    // server-render request previously triggered Next.js's fetch request
    // memoization to serve a `.clone()` of the first response, which
    // crashed with "Response.clone: Body has already been consumed".
    (recentVisitRows as VisitRow[]).forEach((row) => {
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

    // Eligible BEFORE cross-section dedup — used only to distinguish "no
    // candidates existed" from "candidates existed but were already covered
    // by a higher-priority section" for the empty-state copy below.
    const eligibleItems = candidateIds
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
      });

    const items = eligibleItems
      .filter((item) => !usedSubmissionIds.has(item.id) && !usedLoIds.has(item.detail.learningObjectId))
      .slice(0, 5);

    continueLearning.cards = items.map((item) => ({
      key: `continue-${item.id}`,
      title: item.detail.title,
      subtitle: item.detail.learningObjectTitle,
      meta: `${item.detail.courseTitle} • ${formatMastery(masteryBySubmissionId.get(item.id))}`,
      reason: "You opened this topic recently and haven't reached a strong mastery level on it yet.",
      ctaLabel: "Continue",
      href: buildSubmissionHref(item.detail.courseSlug, item.id),
    }));

    if (items.length === 0 && eligibleItems.length > 0) {
      continueLearning.emptyMessage = "The topics you've recently visited are already covered above.";
    }

    items.forEach((item) => {
      usedSubmissionIds.add(item.id);
      usedLoIds.add(item.detail.learningObjectId);
    });
  } catch (error) {
    console.error("[RecommendationsPage] Continue learning section failed:", error);
    sectionErrors.push("Continue learning could not be fully loaded.");
  }

  // 2) Might be worth revisiting (honest rework of the old "active recall" section —
  // reuses the same real quiz data, but copy no longer implies a timed/scientific
  // spaced-repetition schedule; ACTIVE_RECALL_DAYS is a same-day demo threshold).
  const revisitSection: SectionModel = {
    title: "Might be worth revisiting",
    emptyMessage: "Nothing flagged for revision right now.",
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

    // Eligible BEFORE cross-section dedup (see the "Continue learning" comment above).
    const eligibleCandidateIds = Array.from(latestAttemptBySubmission.entries())
      .filter(([, row]) => Number(row.score_percentage ?? 0) >= 70)
      .filter(([, row]) => {
        const ts = Math.max(toMillis(row.submitted_at), toMillis(row.created_at));
        return ts > 0 && ts < thresholdMs;
      })
      .map(([submissionId]) => submissionId);

    await loadSubmissionDetails(eligibleCandidateIds);

    const eligibleItems = eligibleCandidateIds
      .map((id) => ({ id, detail: submissionById.get(id), attempt: latestAttemptBySubmission.get(id) }))
      .filter((item): item is { id: string; detail: SubmissionDetail; attempt: QuizAttemptRow } =>
        Boolean(item.detail && item.attempt)
      );

    const revisitItems = eligibleItems
      .filter((item) => !usedSubmissionIds.has(item.id) && !usedLoIds.has(item.detail.learningObjectId))
      .slice(0, 5);

    revisitSection.cards = revisitItems.map((item) => ({
      key: `recall-${item.id}`,
      title: item.detail.title,
      subtitle: item.detail.learningObjectTitle,
      meta: `${item.detail.courseTitle} • ${formatQuizScore(item.attempt.score_percentage)}`,
      reason: "You scored well on this before — a quick recall check helps make sure it's still solid.",
      ctaLabel: "Quick recall check",
      href: buildSubmissionHref(item.detail.courseSlug, item.id),
    }));

    if (revisitItems.length === 0 && eligibleItems.length > 0) {
      revisitSection.emptyMessage = "Recent strong topics worth revisiting are already covered above.";
    }

    revisitItems.forEach((item) => {
      usedSubmissionIds.add(item.id);
      usedLoIds.add(item.detail.learningObjectId);
    });
  } catch (error) {
    console.error("[RecommendationsPage] Revisit section failed:", error);
    sectionErrors.push("Revision reminders are temporarily unavailable.");
  }

  // 3) Ready to explore next. Only shows topics the student is actually
  // reasonably ready to move toward: excludes the focus LO and (unless the
  // primary plan is actively ADVANCE) its postrequisites, via suppressedLoIds,
  // so this section can never contradict the primary recommendation (e.g.
  // "Review Pointers first" alongside "Start Stack").
  const readyToExploreNext: SectionModel = {
    title: "Ready to explore next",
    emptyMessage: "No path-based next modules found yet. Keep progressing and we will recommend the next steps.",
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

    // Eligible BEFORE cross-section dedup/suppression (see the "Continue
    // learning" comment above) — real, approved, resolvable candidates.
    const eligibleDetails = uniqueStrings(targetSubmissionIds)
      .map((id) => submissionById.get(id))
      .filter((item): item is SubmissionDetail => Boolean(item));

    const nextItems = eligibleDetails
      .filter((detail) => !usedSubmissionIds.has(detail.id) && !usedLoIds.has(detail.learningObjectId))
      .filter((detail) => !suppressedLoIds.has(detail.learningObjectId))
      .slice(0, 5);

    readyToExploreNext.cards = nextItems.map((detail) => ({
      key: `next-${detail.id}`,
      title: detail.learningObjectTitle,
      subtitle: detail.title,
      meta: detail.courseTitle,
      reason: usedPathSignal
        ? "You've shown strength in a related topic, and this usually follows it."
        : "A safe next step while the system learns more about your progress.",
      ctaLabel: "Start",
      href: buildLoHref(detail.courseSlug, detail.learningObjectId),
    }));

    if (nextItems.length === 0 && eligibleDetails.length > 0) {
      readyToExploreNext.emptyMessage =
        "The next steps we found are already covered above — check your focus area and other flagged topics first.";
    }

    nextItems.forEach((detail) => {
      usedSubmissionIds.add(detail.id);
      usedLoIds.add(detail.learningObjectId);
    });
  } catch (error) {
    console.error("[RecommendationsPage] Ready to explore next section failed:", error);
    sectionErrors.push("Next learning recommendations are temporarily unavailable.");
  }

  // 4) Practice explaining a concept (honest rework of the old "Feynman prototype"
  // section — Feynman evaluation is fully wired via /api/feynman/evaluate; this is
  // just an opt-in browse list for students who want to use it proactively, separate
  // from the roadblock-triggered FEYNMAN_CHECK action in the Focus card). Kept
  // small and deduplicated so it doesn't repeat concepts already prominent
  // elsewhere on the page.
  const practiceSection: SectionModel = {
    title: "Practice explaining a concept",
    emptyMessage: "No low-mastery topics right now for explanation practice.",
    cards: [],
  };

  try {
    const underMasteredIds = Array.from(masteryBySubmissionId.entries())
      .filter(([, score]) => typeof score === "number" && score < 70)
      .map(([submissionId]) => submissionId)
      .slice(0, 12);

    await loadSubmissionDetails(underMasteredIds);

    // Eligible BEFORE cross-section dedup (see the "Continue learning"
    // comment above) — real, approved, low-mastery candidates. This is what
    // distinguishes "this student genuinely has no low-mastery topics" from
    // "they do, but those topics are already covered by a higher-priority
    // section" for the empty-state copy below — the two are not the same
    // fact and must not use the same message.
    const eligibleDetails = underMasteredIds
      .map((id) => submissionById.get(id))
      .filter((item): item is SubmissionDetail => Boolean(item));

    const practiceItems = eligibleDetails
      .filter((detail) => !usedSubmissionIds.has(detail.id) && !usedLoIds.has(detail.learningObjectId))
      .slice(0, 2);

    practiceSection.cards = practiceItems.map((detail) => ({
      key: `feynman-${detail.id}`,
      title: "Explain this concept in your own words",
      subtitle: `${detail.title} • ${detail.learningObjectTitle}`,
      meta: detail.courseTitle,
      reason: "Explaining a topic simply is a quick way to spot the pieces you haven't fully nailed down yet.",
      ctaLabel: "Explain concept",
      href: `/recommendations/feynman/${detail.id}` as Route,
    }));

    if (practiceItems.length === 0 && eligibleDetails.length > 0) {
      practiceSection.emptyMessage = "Your priority topics are already covered in the recommendations above.";
    }
  } catch (error) {
    console.error("[RecommendationsPage] Practice section failed:", error);
    sectionErrors.push("Practice suggestions are temporarily unavailable.");
  }

  const sections = [continueLearning, revisitSection, readyToExploreNext, practiceSection];
  const hasAnyCards = Boolean(focusView) || sections.some((section) => section.cards.length > 0);

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
            reason: "We don't have enough of your activity yet to personalise this — here's a safe starting point.",
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
              Built from your recent activity, mastery, and quiz history — including a closer look
              whenever something looks like it might be a roadblock.
            </p>
          </div>
        </div>

        {sectionErrors.length > 0 && (
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
            {Array.from(new Set(sectionErrors)).join(" ")}
          </div>
        )}

        {focusView && (
          <>
            <FocusCard
              submissionTitle={focusView.submissionTitle}
              learningObjectTitle={focusView.learningObjectTitle}
              courseTitle={focusView.courseTitle}
              masteryScore={focusView.masteryScore}
              masteryLevel={focusView.masteryLevel}
              hasRoadblock={focusView.hasRoadblock}
              evidenceBullets={focusView.evidenceBullets}
              evidenceDetails={focusView.evidenceDetails}
              diagnosisType={focusView.diagnosisType}
              // Schema-native, already second-person text from the agents —
              // rendered directly, no post-hoc transform. See focusCache.ts's
              // v5 comment.
              studentSummary={focusView.studentSummary}
              studentReason={focusView.studentReason}
              actionLabel={focusView.actionLabel}
              actionDetail={focusView.actionDetail}
              actionHref={focusView.actionHref as Route | null}
              opensRemediation={focusView.opensRemediation}
            />
            {focusIsFreshComputation && (
              <FocusCacheWriter
                submissionId={focusView.submissionId}
                fingerprint={focusView.fingerprint}
                view={focusView}
              />
            )}
          </>
        )}

        {secondaryCandidates.length > 0 && <SecondaryRoadblockList candidates={secondaryCandidates} />}

        <RecommendationSection model={sections[0]} />
        <RecommendationSection model={sections[1]} />
        <RecommendationSection model={sections[2]} />
        <RecommendationSection model={sections[3]} />

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

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Why this is here
                      </p>
                      <p className="text-xs leading-relaxed text-slate-300">{card.reason}</p>
                    </div>

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
