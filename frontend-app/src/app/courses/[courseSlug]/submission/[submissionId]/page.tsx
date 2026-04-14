import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LOHeader } from "@/components/lo/LOHeader";
import { LODetailTabs } from "@/components/lo/LODetailTabs";
import type { ContentTabData, LearningObject, LearningObjectContent, LearningObjectDetail } from "@/types/learning";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";

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

  return (
    <div className="space-y-10 p-6">
      <div>
        <Link
          href={`/courses/${params.courseSlug}`}
          className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200 hover:underline"
        >
          {"<- Back to "}
          {course.title || course.slug.toUpperCase()}
        </Link>
      </div>
      <LOHeader lo={loDetail} />
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-300">
        <p>
          Submission: <span className="font-semibold text-slate-100">{submission.id}</span>
        </p>
        <p>
          Instructor: <span className="font-semibold text-slate-100">{teacherName}</span>
        </p>
      </div>
      <LODetailTabs
        content={contentTabs}
        roadmap={roadmap}
        courseSlug={params.courseSlug}
        courseRoadmap={courseRoadmapData}
        assessment={loDetail.assessment}
        recommendedTab={recommendedTab}
      />
    </div>
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
