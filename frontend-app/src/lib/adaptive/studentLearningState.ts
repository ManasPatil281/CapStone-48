/**
 * Student Learning State builder.
 *
 * Read-only aggregation of everything the system currently knows about one
 * student for one teacher submission, assembled from existing tables using
 * existing query/derivation conventions already used elsewhere in the app
 * (recommendations page, quiz-weakness tool, submission detail page).
 *
 * This module:
 * - does NOT call an LLM;
 * - does NOT write to the database;
 * - does NOT recompute or alter mastery (`calculateMasteryScore.ts` is untouched;
 *   the persisted `student_submission_mastery` row is read as-is);
 * - does NOT invent new aggregation rules where none exist yet (e.g. prerequisite
 *   mastery is reported per-submission, not averaged/aggregated across submissions).
 *
 * Time-based fields (visits, content-block active/idle time) are exposure signals,
 * not proof of understanding, and must be treated as such by any consumer.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

// Mirrors the exact rule/threshold used in the "Active recall / revision
// reminders" section of src/app/recommendations/page.tsx. That page does not
// export this constant, so it is duplicated here rather than imported. If the
// active-recall rule in recommendations/page.tsx changes, update this too.
const ACTIVE_RECALL_DAYS = 0;
const ACTIVE_RECALL_MIN_SCORE = 70;

export type MasteryLevel = "Beginner" | "Developing" | "Proficient" | "Mastered";

export type QuizTrend = "improving" | "declining" | "stable" | "insufficient_data";

export interface StudentLearningState {
  generatedAt: string;
  studentId: string;
  submissionId: string;

  course: { id: string; title: string; slug: string } | null;

  learningObject: {
    id: string;
    title: string;
    slug: string;
    difficultyLevel: number | null;
  } | null;

  mastery: {
    score: number | null;
    level: MasteryLevel | null;
    lastCalculatedAt: string | null;
    metadata: Record<string, unknown> | null;
  } | null;

  /**
   * Derived, read-only aggregate mastery for the LO underlying this
   * submission, across all approved teacher submissions for that LO.
   * Distinct from `mastery` above, which is for THIS submission only.
   * The arithmetic mean is computed only over submissions where this
   * student actually has a mastery row — missing evidence is excluded,
   * never treated as 0.
   */
  loMastery: {
    loId: string;
    score: number | null;
    level: MasteryLevel | null;
    evidenceSubmissionCount: number;
    totalApprovedSubmissions: number;
    breakdown: Array<{
      submissionId: string;
      submissionTitle: string | null;
      teacherId: string | null;
      teacherName: string | null;
      score: number | null;
      level: MasteryLevel | null;
    }>;
  } | null;

  /** Derived purely from mastery.metadata_json feynman* keys. Not a separate table. */
  feynman: {
    score: number | null;
    feedback: string | null;
    lastAttemptAt: string | null;
    misconceptions: string[] | null;
    source: string | null;
  } | null;

  quiz: {
    attemptCount: number;
    bestScorePercentage: number | null;
    latestScorePercentage: number | null;
    latestAttemptAt: string | null;
    trend: QuizTrend;
    history: Array<{
      scorePercentage: number | null;
      correctCount: number | null;
      totalQuestions: number | null;
      submittedAt: string | null;
    }>;
  };

  visits: {
    totalVisits: number;
    firstVisitAt: string | null;
    lastVisitAt: string | null;
    totalActiveSeconds: number;
    totalIdleSeconds: number;
  };

  contentEngagement: {
    blocks: Array<{
      contentId: string;
      title: string | null;
      deliveryTypeId: string | null;
      deliveryTypeName: string | null;
      activeSeconds: number;
      idleSeconds: number;
      recommendedTimeSeconds: number | null;
      firstViewedAt: string | null;
      lastViewedAt: string | null;
    }>;
    totalActiveSeconds: number;
    totalIdleSeconds: number;
  };

  /**
   * Observed active-time breakdown by delivery/teaching method, scoped to THIS
   * submission only. This is an exposure/engagement signal, not a learning
   * style label — do not treat the highest value as a permanent preference
   * or as evidence of effectiveness.
   */
  deliveryTypeEngagement: Array<{
    deliveryTypeId: string;
    deliveryTypeName: string | null;
    activeSeconds: number;
  }>;

  prerequisites: {
    /** Submission-scoped edges for this submission's LO, per teacher_lo_submission_edge semantics. */
    submissionScoped: {
      prerequisiteLoIds: string[];
      postrequisiteLoIds: string[];
    };
    /**
     * For each prerequisite LO, this student's mastery on every teacher
     * submission that exists for that LO. Not aggregated/averaged — a LO can
     * have multiple submissions and no aggregation rule is defined.
     */
    prerequisiteDetails: Array<{
      loId: string;
      title: string | null;
      slug: string | null;
      masteryBySubmission: Array<{
        submissionId: string;
        submissionTitle: string | null;
        score: number | null;
        level: MasteryLevel | null;
      }>;
    }>;
  };

  revision: {
    /** Same rule as recommendations/page.tsx: latest attempt >= 70% and older than ACTIVE_RECALL_DAYS. */
    activeRecallEligible: boolean;
    latestQualifyingAttemptAt: string | null;
  };

  dataCompleteness: {
    hasMastery: boolean;
    hasQuizAttempts: boolean;
    hasVisits: boolean;
    hasContentEngagement: boolean;
    hasPrerequisiteEdges: boolean;
  };
}

function toMillis(value: string | null | undefined): number {
  if (!value) return -1;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : -1;
}

function toLevel(value: unknown): MasteryLevel | null {
  return value === "Beginner" || value === "Developing" || value === "Proficient" || value === "Mastered"
    ? value
    : null;
}

function scoreToLevel(score: number): MasteryLevel {
  if (score >= 85) return "Mastered";
  if (score >= 70) return "Proficient";
  if (score >= 40) return "Developing";
  return "Beginner";
}

// Same soft-delete convention as src/app/recommendations/page.tsx's
// isSoftDeletedSubmission(): a submission is only really "approved" if its
// status is approved AND it hasn't been marked soft-deleted via this notes prefix.
// Exported so other adaptive modules (e.g. plannerContext.ts) don't have to
// re-duplicate this convention a third time.
export function isSoftDeletedSubmission(notes: string | null | undefined): boolean {
  return (notes ?? "").startsWith("[SOFT_DELETED]");
}

function computeQuizTrend(
  attempts: Array<{ score_percentage: number | null; submitted_at: string | null; created_at: string | null }>
): QuizTrend {
  const valid = attempts
    .filter((a) => typeof a.score_percentage === "number" && Number.isFinite(a.score_percentage))
    .map((a) => ({
      score: a.score_percentage as number,
      ts: Math.max(toMillis(a.submitted_at), toMillis(a.created_at)),
    }))
    .filter((a) => a.ts > 0)
    .sort((a, b) => a.ts - b.ts);

  if (valid.length < 2) return "insufficient_data";

  const first = valid[0].score;
  const last = valid[valid.length - 1].score;

  if (last > first + 5) return "improving";
  if (last < first - 5) return "declining";
  return "stable";
}

/**
 * Builds a read-only Student Learning State for one student/submission pair
 * from existing tables. Returns null if the submission cannot be resolved.
 */
export async function buildStudentLearningState(
  studentId: string,
  submissionId: string
): Promise<StudentLearningState | null> {
  const supabase = createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const { data: submissionRow, error: submissionErr } = await supabaseAny
    .from("teacher_lo_submission")
    .select("id, learning_object_id, course_id, learning_object:learning_object_id(id, title, slug, difficulty_level)")
    .eq("id", submissionId)
    .maybeSingle();

  if (submissionErr) {
    console.error("[buildStudentLearningState] Failed to load submission:", submissionErr);
  }
  if (!submissionRow) {
    return null;
  }

  const lo = submissionRow.learning_object as
    | { id: string; title: string; slug: string; difficulty_level: number | null }
    | null;

  let course: StudentLearningState["course"] = null;
  if (submissionRow.course_id) {
    const { data: courseRow, error: courseErr } = await supabaseAny
      .from("course")
      .select("id, title, slug")
      .eq("id", submissionRow.course_id)
      .maybeSingle();
    if (courseErr) {
      console.error("[buildStudentLearningState] Failed to load course:", courseErr);
    }
    course = courseRow ? { id: courseRow.id, title: courseRow.title, slug: courseRow.slug } : null;
  }

  // --- Mastery + Feynman (derived from mastery.metadata_json) ---
  let mastery: StudentLearningState["mastery"] = null;
  let feynman: StudentLearningState["feynman"] = null;
  {
    const { data, error } = await supabaseAny
      .from("student_submission_mastery")
      .select("mastery_score, mastery_level, last_calculated_at, metadata_json")
      .eq("student_id", studentId)
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (error) {
      console.error("[buildStudentLearningState] Failed to load mastery:", error);
    }

    if (data) {
      const metadata =
        data.metadata_json && typeof data.metadata_json === "object" && !Array.isArray(data.metadata_json)
          ? (data.metadata_json as Record<string, unknown>)
          : null;

      mastery = {
        score: typeof data.mastery_score === "number" ? data.mastery_score : null,
        level: toLevel(data.mastery_level),
        lastCalculatedAt: data.last_calculated_at ?? null,
        metadata,
      };

      if (metadata && typeof metadata.feynmanScore === "number") {
        feynman = {
          score: metadata.feynmanScore as number,
          feedback: typeof metadata.feynmanFeedback === "string" ? (metadata.feynmanFeedback as string) : null,
          lastAttemptAt:
            typeof metadata.lastFeynmanAttemptAt === "string" ? (metadata.lastFeynmanAttemptAt as string) : null,
          misconceptions: Array.isArray(metadata.misconceptions) ? (metadata.misconceptions as string[]) : null,
          source: typeof metadata.masterySource === "string" ? (metadata.masterySource as string) : null,
        };
      }
    }
  }

  // --- LO-level aggregate mastery (derived, read-only, across approved submissions for this LO) ---
  let loMastery: StudentLearningState["loMastery"] = null;
  if (lo) {
    const { data: loSubmissionRows, error: loSubmissionErr } = await supabaseAny
      .from("teacher_lo_submission")
      .select("id, title, teacher_id, notes")
      .eq("learning_object_id", lo.id)
      .eq("status", "approved");

    if (loSubmissionErr) {
      console.error("[buildStudentLearningState] Failed to load LO submissions:", loSubmissionErr);
    }

    const approvedSubmissions = ((loSubmissionRows ?? []) as Array<{
      id: string;
      title: string | null;
      teacher_id: string | null;
      notes: string | null;
    }>).filter((row) => !isSoftDeletedSubmission(row.notes));

    const teacherIds = uniqueStrings(approvedSubmissions.map((s) => s.teacher_id));
    const teacherNameById = new Map<string, string | null>();
    if (teacherIds.length > 0) {
      const { data: teacherRows, error: teacherErr } = await supabaseAny
        .from("user_profile")
        .select("id, full_name")
        .in("id", teacherIds);
      if (teacherErr) {
        console.error("[buildStudentLearningState] Failed to load teacher profiles:", teacherErr);
      }
      ((teacherRows ?? []) as Array<{ id: string; full_name: string | null }>).forEach((r) => {
        teacherNameById.set(r.id, r.full_name ?? null);
      });
    }

    const approvedSubmissionIds = approvedSubmissions.map((s) => s.id);
    const loMasteryBySubId = new Map<string, number | null>();
    if (approvedSubmissionIds.length > 0) {
      const { data: loMasteryRows, error: loMasteryErr } = await supabaseAny
        .from("student_submission_mastery")
        .select("submission_id, mastery_score")
        .eq("student_id", studentId)
        .in("submission_id", approvedSubmissionIds);
      if (loMasteryErr) {
        console.error("[buildStudentLearningState] Failed to load LO-level mastery evidence:", loMasteryErr);
      }
      ((loMasteryRows ?? []) as Array<{ submission_id: string; mastery_score: number | null }>).forEach((r) => {
        if (typeof r.mastery_score === "number") {
          loMasteryBySubId.set(r.submission_id, r.mastery_score);
        }
      });
    }

    const evidenceScores = Array.from(loMasteryBySubId.values()).filter(
      (v): v is number => typeof v === "number"
    );
    const aggregateScore =
      evidenceScores.length > 0
        ? Math.round((evidenceScores.reduce((s, v) => s + v, 0) / evidenceScores.length) * 10) / 10
        : null;

    loMastery = {
      loId: lo.id,
      score: aggregateScore,
      level: aggregateScore !== null ? scoreToLevel(aggregateScore) : null,
      evidenceSubmissionCount: evidenceScores.length,
      totalApprovedSubmissions: approvedSubmissions.length,
      breakdown: approvedSubmissions.map((s) => {
        const score = loMasteryBySubId.get(s.id) ?? null;
        return {
          submissionId: s.id,
          submissionTitle: s.title,
          teacherId: s.teacher_id,
          teacherName: s.teacher_id ? teacherNameById.get(s.teacher_id) ?? null : null,
          score,
          level: score !== null ? scoreToLevel(score) : null,
        };
      }),
    };
  }

  // --- Quiz attempts (this submission only) ---
  let quiz: StudentLearningState["quiz"] = {
    attemptCount: 0,
    bestScorePercentage: null,
    latestScorePercentage: null,
    latestAttemptAt: null,
    trend: "insufficient_data",
    history: [],
  };
  {
    const { data, error } = await supabaseAny
      .from("student_quiz_attempt")
      .select("score_percentage, correct_count, total_questions, submitted_at, created_at")
      .eq("student_id", studentId)
      .eq("submission_id", submissionId)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      console.error("[buildStudentLearningState] Failed to load quiz attempts:", error);
    }

    const attempts = (data ?? []) as Array<{
      score_percentage: number | null;
      correct_count: number | null;
      total_questions: number | null;
      submitted_at: string | null;
      created_at: string | null;
    }>;

    if (attempts.length > 0) {
      const scored = attempts.filter((a) => typeof a.score_percentage === "number");
      const best = scored.length > 0 ? Math.max(...scored.map((a) => a.score_percentage as number)) : null;
      // attempts are already ordered latest-first
      const latest = attempts[0];

      quiz = {
        attemptCount: attempts.length,
        bestScorePercentage: best,
        latestScorePercentage: latest.score_percentage,
        latestAttemptAt: latest.submitted_at ?? latest.created_at ?? null,
        trend: computeQuizTrend(attempts),
        history: attempts.slice(0, 20).map((a) => ({
          scorePercentage: a.score_percentage,
          correctCount: a.correct_count,
          totalQuestions: a.total_questions,
          submittedAt: a.submitted_at ?? a.created_at ?? null,
        })),
      };
    }
  }

  // --- Visits (this submission only) ---
  let visits: StudentLearningState["visits"] = {
    totalVisits: 0,
    firstVisitAt: null,
    lastVisitAt: null,
    totalActiveSeconds: 0,
    totalIdleSeconds: 0,
  };
  {
    const { data, error } = await supabaseAny
      .from("student_submission_visit")
      .select("started_at, ended_at, active_seconds, idle_seconds")
      .eq("student_id", studentId)
      .eq("submission_id", submissionId)
      .order("started_at", { ascending: true });

    if (error) {
      console.error("[buildStudentLearningState] Failed to load visits:", error);
    }

    const rows = (data ?? []) as Array<{
      started_at: string | null;
      ended_at: string | null;
      active_seconds: number | null;
      idle_seconds: number | null;
    }>;

    if (rows.length > 0) {
      const totalActive = rows.reduce((s, r) => s + Number(r.active_seconds ?? 0), 0);
      const totalIdle = rows.reduce((s, r) => s + Number(r.idle_seconds ?? 0), 0);
      const first = rows[0]?.started_at ?? null;
      const last = rows.reduce<string | null>((acc, r) => {
        const candidate = r.ended_at ?? r.started_at;
        if (!candidate) return acc;
        return !acc || toMillis(candidate) > toMillis(acc) ? candidate : acc;
      }, null);

      visits = {
        totalVisits: rows.length,
        firstVisitAt: first,
        lastVisitAt: last,
        totalActiveSeconds: totalActive,
        totalIdleSeconds: totalIdle,
      };
    }
  }

  // --- Content-block engagement (this submission only) ---
  const contentEngagement: StudentLearningState["contentEngagement"] = {
    blocks: [],
    totalActiveSeconds: 0,
    totalIdleSeconds: 0,
  };
  const deliveryTypeEngagementMap = new Map<string, number>();
  {
    const [{ data: timeRows, error: timeErr }, { data: contentRows, error: contentErr }] = await Promise.all([
      supabaseAny
        .from("student_content_block_time")
        .select("content_id, delivery_type_id, active_seconds, idle_seconds, first_viewed_at, last_viewed_at")
        .eq("student_id", studentId)
        .eq("submission_id", submissionId),
      supabaseAny
        .from("teacher_lo_submission_content")
        .select("id, title, recommended_time_seconds")
        .eq("submission_id", submissionId),
    ]);

    if (timeErr) {
      console.error("[buildStudentLearningState] Failed to load content-block time:", timeErr);
    }
    if (contentErr) {
      console.error("[buildStudentLearningState] Failed to load content blocks:", contentErr);
    }

    const contentById = new Map(
      ((contentRows ?? []) as Array<{ id: string; title: string | null; recommended_time_seconds: number | null }>).map(
        (c) => [c.id, c]
      )
    );

    const deliveryTypeIds = uniqueStrings(
      ((timeRows ?? []) as Array<{ delivery_type_id: string | null }>).map((r) => r.delivery_type_id)
    );
    const deliveryTypeNameById = new Map<string, string | null>();
    if (deliveryTypeIds.length > 0) {
      const { data: dtRows, error: dtErr } = await supabaseAny
        .from("delivery_type")
        .select("id, name")
        .in("id", deliveryTypeIds);
      if (dtErr) {
        console.error("[buildStudentLearningState] Failed to load delivery types:", dtErr);
      }
      ((dtRows ?? []) as Array<{ id: string; name: string | null }>).forEach((r) => {
        deliveryTypeNameById.set(r.id, r.name ?? null);
      });
    }

    ((timeRows ?? []) as Array<{
      content_id: string;
      delivery_type_id: string | null;
      active_seconds: number | null;
      idle_seconds: number | null;
      first_viewed_at: string | null;
      last_viewed_at: string | null;
    }>).forEach((row) => {
      const contentMeta = contentById.get(row.content_id);
      const active = Number(row.active_seconds ?? 0);
      const idle = Number(row.idle_seconds ?? 0);

      contentEngagement.blocks.push({
        contentId: row.content_id,
        title: contentMeta?.title ?? null,
        deliveryTypeId: row.delivery_type_id,
        deliveryTypeName: row.delivery_type_id ? deliveryTypeNameById.get(row.delivery_type_id) ?? null : null,
        activeSeconds: active,
        idleSeconds: idle,
        recommendedTimeSeconds: contentMeta?.recommended_time_seconds ?? null,
        firstViewedAt: row.first_viewed_at,
        lastViewedAt: row.last_viewed_at,
      });

      contentEngagement.totalActiveSeconds += active;
      contentEngagement.totalIdleSeconds += idle;

      if (row.delivery_type_id) {
        deliveryTypeEngagementMap.set(
          row.delivery_type_id,
          (deliveryTypeEngagementMap.get(row.delivery_type_id) ?? 0) + active
        );
      }
    });
  }

  const deliveryTypeEngagement: StudentLearningState["deliveryTypeEngagement"] = [];
  if (deliveryTypeEngagementMap.size > 0) {
    const ids = Array.from(deliveryTypeEngagementMap.keys());
    const { data: dtRows, error: dtErr } = await supabaseAny.from("delivery_type").select("id, name").in("id", ids);
    if (dtErr) {
      console.error("[buildStudentLearningState] Failed to load delivery type names:", dtErr);
    }
    const nameById = new Map(((dtRows ?? []) as Array<{ id: string; name: string | null }>).map((r) => [r.id, r.name]));
    for (const [deliveryTypeId, activeSeconds] of deliveryTypeEngagementMap.entries()) {
      deliveryTypeEngagement.push({
        deliveryTypeId,
        deliveryTypeName: nameById.get(deliveryTypeId) ?? null,
        activeSeconds,
      });
    }
    deliveryTypeEngagement.sort((a, b) => b.activeSeconds - a.activeSeconds);
  }

  // --- Prerequisites (submission-scoped edges) ---
  const prerequisiteLoIds: string[] = [];
  const postrequisiteLoIds: string[] = [];
  if (lo) {
    const [{ data: prereqRows, error: prereqErr }, { data: postreqRows, error: postreqErr }] = await Promise.all([
      supabaseAny
        .from("teacher_lo_submission_edge")
        .select("source_lo_id")
        .eq("submission_id", submissionId)
        .eq("target_lo_id", lo.id),
      supabaseAny
        .from("teacher_lo_submission_edge")
        .select("target_lo_id")
        .eq("submission_id", submissionId)
        .eq("source_lo_id", lo.id),
    ]);

    if (prereqErr) {
      console.error("[buildStudentLearningState] Failed to load prerequisite edges:", prereqErr);
    }
    if (postreqErr) {
      console.error("[buildStudentLearningState] Failed to load postrequisite edges:", postreqErr);
    }

    prerequisiteLoIds.push(
      ...uniqueStrings(((prereqRows ?? []) as Array<{ source_lo_id: string | null }>).map((r) => r.source_lo_id))
    );
    postrequisiteLoIds.push(
      ...uniqueStrings(((postreqRows ?? []) as Array<{ target_lo_id: string | null }>).map((r) => r.target_lo_id))
    );
  }

  const prerequisiteDetails: StudentLearningState["prerequisites"]["prerequisiteDetails"] = [];
  if (prerequisiteLoIds.length > 0) {
    const { data: loRows, error: loErr } = await supabaseAny
      .from("learning_object")
      .select("id, title, slug")
      .in("id", prerequisiteLoIds);
    if (loErr) {
      console.error("[buildStudentLearningState] Failed to load prerequisite LOs:", loErr);
    }
    const loById = new Map(
      ((loRows ?? []) as Array<{ id: string; title: string; slug: string }>).map((r) => [r.id, r])
    );

    const { data: subRows, error: subErr } = await supabaseAny
      .from("teacher_lo_submission")
      .select("id, learning_object_id, title, notes")
      .in("learning_object_id", prerequisiteLoIds)
      .eq("status", "approved");
    if (subErr) {
      console.error("[buildStudentLearningState] Failed to load prerequisite submissions:", subErr);
    }
    // Bugfix: this query previously didn't exclude soft-deleted submissions
    // (unlike the loMastery computation above), which could have let a
    // downstream consumer treat an inaccessible submission as a valid target.
    const approvedPrereqSubs = ((subRows ?? []) as Array<{
      id: string;
      learning_object_id: string;
      title: string | null;
      notes: string | null;
    }>).filter((r) => !isSoftDeletedSubmission(r.notes));

    const submissionTitleById = new Map(approvedPrereqSubs.map((s) => [s.id, s.title]));
    const submissionsByLo = new Map<string, string[]>();
    approvedPrereqSubs.forEach((r) => {
      const list = submissionsByLo.get(r.learning_object_id) ?? [];
      list.push(r.id);
      submissionsByLo.set(r.learning_object_id, list);
    });

    const allPrereqSubmissionIds = Array.from(submissionsByLo.values()).flat();
    const masteryBySubId = new Map<string, { score: number | null; level: MasteryLevel | null }>();
    if (allPrereqSubmissionIds.length > 0) {
      const { data: masteryRows, error: masteryErr } = await supabaseAny
        .from("student_submission_mastery")
        .select("submission_id, mastery_score, mastery_level")
        .eq("student_id", studentId)
        .in("submission_id", allPrereqSubmissionIds);
      if (masteryErr) {
        console.error("[buildStudentLearningState] Failed to load prerequisite mastery:", masteryErr);
      }
      ((masteryRows ?? []) as Array<{
        submission_id: string;
        mastery_score: number | null;
        mastery_level: string | null;
      }>).forEach((r) => {
        masteryBySubId.set(r.submission_id, { score: r.mastery_score, level: toLevel(r.mastery_level) });
      });
    }

    for (const loId of prerequisiteLoIds) {
      const loMeta = loById.get(loId);
      const submissionIds = submissionsByLo.get(loId) ?? [];
      prerequisiteDetails.push({
        loId,
        title: loMeta?.title ?? null,
        slug: loMeta?.slug ?? null,
        masteryBySubmission: submissionIds.map((sid) => ({
          submissionId: sid,
          submissionTitle: submissionTitleById.get(sid) ?? null,
          score: masteryBySubId.get(sid)?.score ?? null,
          level: masteryBySubId.get(sid)?.level ?? null,
        })),
      });
    }
  }

  // --- Revision / active recall (this submission only, mirrors recommendations page rule) ---
  const thresholdMs = Date.now() - ACTIVE_RECALL_DAYS * 24 * 60 * 60 * 1000;
  const activeRecallEligible =
    typeof quiz.latestScorePercentage === "number" &&
    quiz.latestScorePercentage >= ACTIVE_RECALL_MIN_SCORE &&
    toMillis(quiz.latestAttemptAt) > 0 &&
    toMillis(quiz.latestAttemptAt) < thresholdMs;

  return {
    generatedAt: new Date().toISOString(),
    studentId,
    submissionId,
    course,
    learningObject: lo
      ? { id: lo.id, title: lo.title, slug: lo.slug, difficultyLevel: lo.difficulty_level ?? null }
      : null,
    mastery,
    loMastery,
    feynman,
    quiz,
    visits,
    contentEngagement,
    deliveryTypeEngagement,
    prerequisites: {
      submissionScoped: { prerequisiteLoIds, postrequisiteLoIds },
      prerequisiteDetails,
    },
    revision: {
      activeRecallEligible,
      latestQualifyingAttemptAt: activeRecallEligible ? quiz.latestAttemptAt : null,
    },
    dataCompleteness: {
      hasMastery: mastery !== null,
      hasQuizAttempts: quiz.attemptCount > 0,
      hasVisits: visits.totalVisits > 0,
      hasContentEngagement: contentEngagement.blocks.length > 0,
      hasPrerequisiteEdges: prerequisiteLoIds.length > 0 || postrequisiteLoIds.length > 0,
    },
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string" && v.length > 0)));
}
