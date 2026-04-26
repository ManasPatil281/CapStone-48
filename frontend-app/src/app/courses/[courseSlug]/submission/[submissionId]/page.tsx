import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LOHeader } from "@/components/lo/LOHeader";
import { LODetailTabs } from "@/components/lo/LODetailTabs";
import type { ContentTabData, LearningObject, LearningObjectContent, LearningObjectDetail } from "@/types/learning";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";
import { buildSubmissionChatContext } from "@/lib/ai/context";
import { ArrowLeft, User } from "lucide-react";
import type { SubmissionStats, StatContentBlock } from "@/components/lo/StatisticsTab";
import { calculateMasteryScore } from "@/lib/mastery/calculateMasteryScore";

interface PageProps {
  params: {
    courseSlug: string;
    submissionId: string;
  };
}

export default async function SubmissionDetailPage({ params }: PageProps) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user } = { user: null }
  } = await supabase.auth.getUser();

  const userId = user?.id;
  const { data: viewerProfileRow } = userId
    ? await supabase.from("user_profile").select("role").eq("id", userId).maybeSingle()
    : { data: null };

  const viewerProfile = viewerProfileRow as { role: string | null } | null;

  const { data: courseRow } = await supabase.from("course").select("id,slug,title").eq("slug", params.courseSlug).maybeSingle();
  const course = courseRow as { id: string; slug: string; title: string } | null;

  if (!course) {
    notFound();
  }

  const { data: submissionRow, error: submissionError } = await supabase
    .from("teacher_lo_submission")
    .select("id, learning_object_id, teacher_id, status, learning_object:learning_object_id(*)")
    .eq("id", params.submissionId)
    .eq("status", "approved")
    .maybeSingle();

  if (submissionError) {
    console.error("[SubmissionDetailPage] Failed to fetch submission:", submissionError);
  }

  const submission = submissionRow as {
    id: string;
    learning_object_id: string;
    teacher_id: string;
    status: "draft" | "submitted" | "approved" | "rejected";
    learning_object: LearningObject | null;
  } | null;

  if (!submission || !submission.learning_object) {
    notFound();
  }

  const { data: membershipRow } = await supabase
    .from("course_learning_object")
    .select("id")
    .eq("course_id", course.id)
    .eq("learning_object_id", submission.learning_object_id)
    .maybeSingle();

  if (!membershipRow) {
    notFound();
  }

  const { data: teacherProfileRow } = await supabase
    .from("user_profile")
    .select("full_name")
    .eq("id", submission.teacher_id)
    .maybeSingle();

  const teacherProfile = teacherProfileRow as { full_name: string | null } | null;
  const teacherName = teacherProfile?.full_name ?? "Unknown Teacher";

  const { data: submissionContentRows, error: contentError } = await supabase
    .from("teacher_lo_submission_content")
    .select("*, delivery_type:delivery_type_id(*)")
    .eq("submission_id", submission.id)
    .order("sequence_order", { ascending: true });

  if (contentError) {
    console.error("[SubmissionDetailPage] Failed to fetch submission content:", contentError);
  }

  const contents = (submissionContentRows ?? []).map((item: any) => ({
    id: item.id,
    learning_object_id: submission.learning_object_id,
    delivery_type_id: item.delivery_type_id,
    title: item.title,
    content_json: item.content_json,
    sequence_order: item.sequence_order,
    is_active: true,
    delivery_type: item.delivery_type
  }));

  const lo = submission.learning_object;

  const [prerequisiteEdgesRes, dependentEdgesRes, submissionAssessmentRes] = await Promise.all([
    supabase
      .from("teacher_lo_submission_edge")
      .select("source_lo_id, teacher_lo_submission!inner(status)")
      .eq("target_lo_id", lo.id)
      .eq("teacher_lo_submission.status", "approved"),
    supabase
      .from("teacher_lo_submission_edge")
      .select("target_lo_id, teacher_lo_submission!inner(status)")
      .eq("source_lo_id", lo.id)
      .eq("teacher_lo_submission.status", "approved"),
    supabase.from("teacher_lo_submission_assessment").select("*").eq("submission_id", submission.id).maybeSingle()
  ]);

  if (submissionAssessmentRes.error) {
    console.error("[SubmissionDetailPage] Failed to fetch submission assessment:", submissionAssessmentRes.error);
  }

  let submissionAssessment: (LearningObjectDetail["assessment"] & { questions: any[] }) | undefined;

  if (submissionAssessmentRes.data) {
    const assessmentRow = submissionAssessmentRes.data as { id: string; title: string; pass_percentage: number; max_attempts: number };
    const { data: questionRows, error: questionError } = await supabase
      .from("teacher_lo_submission_question")
      .select("*")
      .eq("assessment_id", assessmentRow.id);

    if (questionError) {
      console.error("[SubmissionDetailPage] Failed to fetch submission assessment questions:", questionError);
    }

    const questions = (questionRows ?? []) as Array<{ id: string; question_text: string; question_type: string; marks: number }>;
    const questionIds = questions.map((question) => question.id);

    let optionRows: Array<{ id: string; question_id: string; option_text: string; is_correct: boolean }> = [];

    if (questionIds.length > 0) {
      const { data: optionsData, error: optionError } = await supabase
        .from("teacher_lo_submission_question_option")
        .select("*")
        .in("question_id", questionIds);

      if (optionError) {
        console.error("[SubmissionDetailPage] Failed to fetch submission assessment options:", optionError);
      }

      optionRows = (optionsData ?? []) as Array<{ id: string; question_id: string; option_text: string; is_correct: boolean }>;
    }

    const optionsByQuestionId = new Map<string, Array<{ id: string; option_text: string; is_correct: boolean }>>();
    optionRows.forEach((option) => {
      const list = optionsByQuestionId.get(option.question_id) ?? [];
      list.push({ id: option.id, option_text: option.option_text, is_correct: option.is_correct });
      optionsByQuestionId.set(option.question_id, list);
    });

    submissionAssessment = {
      ...(assessmentRow as any),
      questions: questions.map((question) => ({
        ...question,
        options: optionsByQuestionId.get(question.id) ?? []
      }))
    } as LearningObjectDetail["assessment"] & { questions: any[] };
  }

  const prerequisiteLoIds = Array.from(new Set((prerequisiteEdgesRes.data ?? []).map((edge: any) => edge.source_lo_id).filter(Boolean)));
  const dependentLoIds = Array.from(new Set((dependentEdgesRes.data ?? []).map((edge: any) => edge.target_lo_id).filter(Boolean)));

  const [prereqLosRes, dependentLosRes] = await Promise.all([
    prerequisiteLoIds.length > 0 ? supabase.from("learning_object").select("*").in("id", prerequisiteLoIds) : Promise.resolve({ data: [], error: null }),
    dependentLoIds.length > 0 ? supabase.from("learning_object").select("*").in("id", dependentLoIds) : Promise.resolve({ data: [], error: null })
  ]);

  const loDetail: LearningObjectDetail = {
    ...lo,
    contents,
    deliveryTypes: {},
    prerequisites: (prereqLosRes.data as LearningObject[] | null) ?? [],
    dependents: (dependentLosRes.data as LearningObject[] | null) ?? [],
    assessment: submissionAssessment,
    progress: undefined
  };

  let progressMap: Map<string, any> | null = null;

  const prerequisiteLOs = loDetail.prerequisites;
  const dependentLOs = loDetail.dependents;

  const progressIds = [loDetail.id, ...prerequisiteLOs.map((pr) => pr.id), ...dependentLOs.map((dep) => dep.id)];

  if (userId && progressIds.length > 0) {
    const progressRes = await supabase.from("user_learning_progress").select("*").eq("user_id", userId).in("learning_object_id", progressIds);
    const progressEntries = ((progressRes.data ?? []).map((row: any) => [row.learning_object_id, row] as [string, any])) as Array<[string, any]>;
    progressMap = new Map(progressEntries);
    loDetail.progress = progressMap.get(loDetail.id);
  }

  const contentBlocks = withQuizBlock(loDetail.contents, loDetail.assessment, loDetail.id);
  const contentTabs = mapContentTabs(contentBlocks);
  const recommendedTab = pickRecommendedTab(contentBlocks);

  const roadmap = buildRoadmap({
    lo: loDetail,
    prerequisites: loDetail.prerequisites,
    dependents: loDetail.dependents,
    progressMap
  });

  const chatContext = buildSubmissionChatContext({
    courseTitle: course.title,
    loTitle: loDetail.title,
    submissionId: submission.id,
    submissionTitle: `Submission ${submission.id.slice(0, 8)}`,
    teacherName,
    loDescription: loDetail.description,
    contents: loDetail.contents
  });

  const { data: courseMembershipRows } = await supabase.from("course_learning_object").select("learning_object_id").eq("course_id", course.id);

  const courseLoIds = (courseMembershipRows ?? []).map((row: any) => row.learning_object_id as string).filter(Boolean);

  let courseRoadmapData: { nodes: RoadmapNode[]; edges: RoadmapEdge[]; mostTakenPathNodeIds?: string[] } | undefined;

  if (courseLoIds.length > 0) {
    const [courseLearningObjectsRes, approvedEdgesRes] = await Promise.all([
      supabase.from("learning_object").select("*").in("id", courseLoIds),
      supabase
        .from("teacher_lo_submission_edge")
        .select("source_lo_id, target_lo_id, teacher_lo_submission!inner(status)")
        .eq("teacher_lo_submission.status", "approved")
        .in("source_lo_id", courseLoIds)
        .in("target_lo_id", courseLoIds)
    ]);

    const courseLearningObjects = (courseLearningObjectsRes.data as LearningObject[] | null) ?? [];
    const courseLoIdSet = new Set(courseLearningObjects.map((item) => item.id));

    const nodes: RoadmapNode[] = courseLearningObjects.map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      difficulty: item.difficulty_level,
      estimatedTime: item.estimated_time_minutes,
      status: "NOT_STARTED"
    }));

    const edgeMap = new Map<string, { source: string; target: string }>();
    (approvedEdgesRes.data ?? []).forEach((edge: any) => {
      const sourceId = edge.source_lo_id as string;
      const targetId = edge.target_lo_id as string;

      if (courseLoIdSet.has(sourceId) && courseLoIdSet.has(targetId)) {
        const edgeKey = `${sourceId}->${targetId}`;
        if (!edgeMap.has(edgeKey)) {
          edgeMap.set(edgeKey, { source: sourceId, target: targetId });
        }
      }
    });

    const edges: RoadmapEdge[] = Array.from(edgeMap.values());
    courseRoadmapData = { nodes, edges };
  }

  // ── Statistics data (STUDENT only) ────────────────────────────────────────
  // Fetched server-side so the tab renders immediately without a client query.
  // Scoped strictly to this student + this submission.
  let submissionStats: SubmissionStats | null = null;

  if (userId && viewerProfile?.role === "STUDENT") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;

    const [visitRes, blockTimeRes, quizRes] = await Promise.all([
      supabaseAny
        .from("student_submission_visit")
        .select("active_seconds, idle_seconds")
        .eq("student_id", userId)
        .eq("submission_id", submission.id),
      supabaseAny
        .from("student_content_block_time")
        .select("content_id, active_seconds, idle_seconds")
        .eq("student_id", userId)
        .eq("submission_id", submission.id),
      supabaseAny
        .from("student_quiz_attempt")
        .select("id, score_percentage, correct_count, total_questions, submitted_at, created_at, randomization_mode, sample_percentage")
        .eq("student_id", userId)
        .eq("submission_id", submission.id)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false }),
    ]);

    const visitRows = (visitRes.data ?? []) as Array<{
      active_seconds: number | null;
      idle_seconds: number | null;
    }>;
    const totalActiveSeconds = visitRows.reduce((sum, r) => sum + Number(r.active_seconds ?? 0), 0);
    const totalIdleSeconds = visitRows.reduce((sum, r) => sum + Number(r.idle_seconds ?? 0), 0);

    const blockTimeRows = (blockTimeRes.data ?? []) as Array<{
      content_id: string;
      active_seconds: number | null;
      idle_seconds: number | null;
    }>;

    const quizRows = (quizRes.data ?? []) as Array<{
      id: string;
      score_percentage: number | null;
      correct_count: number | null;
      total_questions: number | null;
      submitted_at: string | null;
      created_at: string | null;
      randomization_mode: number | null;
      sample_percentage: number | null;
    }>;

    // Build content block list from the raw rows (which include recommended_time_seconds
    // via the "*" selector even though it's excluded from the typed contents mapping).
    const statContentBlocks: StatContentBlock[] = (submissionContentRows ?? []).map((item: any) => ({
      id: item.id,
      title: item.title ?? "Untitled block",
      deliveryTypeCode: item.delivery_type?.code ?? null,
      deliveryTypeName: item.delivery_type?.name ?? null,
      recommendedTimeSeconds:
        typeof item.recommended_time_seconds === "number" ? item.recommended_time_seconds : null,
    }));

    const contentBlockTimes = blockTimeRows.map((r) => ({
      contentId: r.content_id,
      activeSeconds: Number(r.active_seconds ?? 0),
      idleSeconds: Number(r.idle_seconds ?? 0),
    }));

    const quizAttempts = quizRows.map((r) => ({
      id: r.id,
      scorePercentage: r.score_percentage,
      correctCount: r.correct_count,
      totalQuestions: r.total_questions,
      timestamp: r.submitted_at ?? r.created_at,
      randomizationMode: r.randomization_mode,
      samplePercentage: r.sample_percentage,
    }));

    const masteryResult = calculateMasteryScore({
      contentBlocks: statContentBlocks,
      contentBlockTimes,
      quizAttempts,
    });

    try {
      await supabaseAny
        .from("student_submission_mastery")
        .upsert(
          {
            student_id: userId,
            submission_id: submission.id,
            mastery_score: masteryResult.score,
            mastery_level: masteryResult.level,
            last_calculated_at: new Date().toISOString(),
            metadata_json: masteryResult.metadata,
          },
          { onConflict: "student_id,submission_id" }
        );
    } catch (masteryErr) {
      console.error("[SubmissionDetailPage] Failed to upsert mastery:", masteryErr);
    }

    submissionStats = {
      totalActiveSeconds,
      totalIdleSeconds,
      contentBlocks: statContentBlocks,
      contentBlockTimes,
      quizAttempts,
      masteryResult,
    };
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Back navigation */}
        <Link
          href={`/courses/${params.courseSlug}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {course.title || course.slug.toUpperCase()}
        </Link>

        {/* LO header */}
        <LOHeader lo={loDetail} />

        {/* Submission metadata */}
        <div className="flex flex-wrap gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submission</span>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
              {submission.id.slice(0, 8)}…
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <User className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instructor</span>
            <span className="text-sm font-medium text-slate-200">{teacherName}</span>
          </div>
        </div>

        {/* Content tabs */}
        <LODetailTabs
          content={contentTabs}
          roadmap={roadmap}
          courseSlug={params.courseSlug}
          courseRoadmap={courseRoadmapData}
          assessment={loDetail.assessment}
          recommendedTab={recommendedTab}
          chatContext={chatContext}
          trackingContext={{
            enabled: Boolean(userId && viewerProfile?.role === "STUDENT"),
            studentId: userId ?? null,
            submissionId: submission.id,
            courseId: course.id,
            learningObjectId: loDetail.id,
            teacherId: submission.teacher_id,
          }}
          submissionStats={submissionStats}
        />
      </div>
    </main>
  );
}

function withQuizBlock(
  contents: LearningObjectDetail["contents"],
  assessment: LearningObjectDetail["assessment"],
  learningObjectId: string
): LearningObjectContent[] {
  if (!assessment) {
    return contents;
  }

  const maxSequence = contents.reduce((max, item) => Math.max(max, item.sequence_order ?? 0), 0);
  const quizBlock: LearningObjectContent = {
    id: `quiz-${assessment.id}`,
    learning_object_id: learningObjectId,
    delivery_type_id: "QUIZ",
    title: assessment.title || "Quiz",
    content_json: {},
    sequence_order: maxSequence + 1,
    is_active: true,
    delivery_type: { id: "QUIZ", code: "QUIZ", name: "Quiz" }
  };

  return [...contents, quizBlock];
}

function mapContentTabs(contents: LearningObjectContent[]): ContentTabData {
  return contents.reduce<ContentTabData>((acc, item) => {
    const code = item.delivery_type?.code;
    acc.blocks = acc.blocks ?? [];
    acc.blocks.push(item);
    const assign = (key: keyof ContentTabData) => {
      acc[key] = acc[key] ?? [];
      acc[key]!.push(item);
    };

    switch (code) {
      case "CONCEPT_NOTES":
        assign("conceptNotes");
        break;
      case "FLOWCHART":
        assign("flowchart");
        break;
      case "VISUAL_EXPLANATION":
        assign("visualExplanation");
        break;
      case "WORKED_EXAMPLE":
        assign("workedExample");
        break;
      case "PRACTICE_SET":
        assign("practiceSet");
        break;
      case "REVISION_SHEET":
        assign("revisionSheet");
        break;
      case "VIDEO":
        assign("video");
        break;
      case "READING_NOTES":
        assign("notes");
        break;
      case "READING_PDF":
        assign("pdf");
        break;
      case "PLAYGROUND":
        assign("playground");
        break;
      case "FLASHCARD":
      case "FLASHCARDS":
        assign("flashcards");
        break;
      default:
        break;
    }
    return acc;
  }, {} as ContentTabData);
}

function pickRecommendedTab(contents: LearningObjectContent[]) {
  const priority = [
    "CONCEPT_NOTES",
    "WORKED_EXAMPLE",
    "PRACTICE_SET",
    "REVISION_SHEET",
    "FLOWCHART",
    "VISUAL_EXPLANATION",
    "PLAYGROUND",
    "VIDEO",
    "READING_NOTES",
    "READING_PDF"
  ];
  for (const code of priority) {
    if (contents.some((content) => content.delivery_type?.code === code)) {
      switch (code) {
        case "CONCEPT_NOTES":
          return "conceptNotes";
        case "WORKED_EXAMPLE":
          return "workedExample";
        case "PRACTICE_SET":
          return "practiceSet";
        case "REVISION_SHEET":
          return "revisionSheet";
        case "FLOWCHART":
          return "flowchart";
        case "VISUAL_EXPLANATION":
          return "visualExplanation";
        case "PLAYGROUND":
          return "playground";
        case "VIDEO":
          return "video";
        case "READING_NOTES":
          return "notes";
        case "READING_PDF":
          return "pdf";
        default:
          break;
      }
    }
  }
  return undefined;
}

function buildRoadmap({
  lo,
  prerequisites,
  dependents,
  progressMap
}: {
  lo: LearningObjectDetail;
  prerequisites: LearningObject[];
  dependents: LearningObject[];
  progressMap: Map<string, any> | null;
}): { nodes: RoadmapNode[]; edges: RoadmapEdge[]; currentNodeId: string } {
  const nodes: RoadmapNode[] = [
    ...prerequisites.map((pr) => ({
      id: pr.id,
      slug: pr.slug,
      title: pr.title,
      difficulty: pr.difficulty_level,
      estimatedTime: pr.estimated_time_minutes,
      status: (progressMap?.get(pr.id)?.status as RoadmapNode["status"]) ?? "NOT_STARTED"
    })),
    {
      id: lo.id,
      slug: lo.slug,
      title: lo.title,
      difficulty: lo.difficulty_level,
      estimatedTime: lo.estimated_time_minutes,
      status: (progressMap?.get(lo.id)?.status as RoadmapNode["status"]) ?? (lo.progress?.status as RoadmapNode["status"]) ?? "IN_PROGRESS"
    },
    ...dependents.map((dep) => ({
      id: dep.id,
      slug: dep.slug,
      title: dep.title,
      difficulty: dep.difficulty_level,
      estimatedTime: dep.estimated_time_minutes,
      status: (progressMap?.get(dep.id)?.status as RoadmapNode["status"]) ?? "NOT_STARTED"
    }))
  ];

  const edges: RoadmapEdge[] = [
    ...prerequisites.map((pr) => ({ source: pr.id, target: lo.id })),
    ...dependents.map((dep) => ({ source: lo.id, target: dep.id }))
  ];

  return { nodes, edges, currentNodeId: lo.id };
}
