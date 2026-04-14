import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AssessmentAttempt, ContentTabData, LearningObjectContent, LearningObjectDetail, LearningObject } from "@/types/learning";
import { LOHeader } from "@/components/lo/LOHeader";
import { LODetailTabs } from "@/components/lo/LODetailTabs";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";

interface PageProps {
  params: {
    loSlug: string;
  };
}

export default async function LODetailPage({ params }: PageProps) {
  const hasSupabaseEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const supabase = hasSupabaseEnv ? createSupabaseServerClient() : null;

  let userId: string | undefined;
  let loDetail: LearningObjectDetail | null = null;
  let attempts: AssessmentAttempt[] = [];
  let progressMap: Map<string, any> | null = null;

  if (supabase) {
    const { data: { user } = { user: null } } = await supabase.auth.getUser();
    userId = user?.id ?? undefined;

    const { data: learningObjectRow, error } = await supabase.from("learning_object").select("*").eq("slug", params.loSlug).maybeSingle();
    const learningObject = (learningObjectRow as LearningObject | null) ?? null;

    if (!error && learningObject) {
      // Fetch content from approved teacher submissions
      const contentRes = await supabase
        .from("teacher_lo_submission_content")
        .select("*, delivery_type:delivery_type_id(*), teacher_lo_submission!inner(learning_object_id, status)")
        .eq("teacher_lo_submission.learning_object_id", learningObject.id)
        .eq("teacher_lo_submission.status", "approved")
        .order("sequence_order", { ascending: true });

      // Fetch MASTER GRAPH edges for prerequisites (edges pointing TO this LO)
      const prerequisiteEdgesRes = await supabase
        .from("teacher_lo_submission_edge")
        .select("source_lo_id, teacher_lo_submission!inner(status)")
        .eq("target_lo_id", learningObject.id)
        .eq("teacher_lo_submission.status", "approved");

      // Fetch MASTER GRAPH edges for dependents (edges pointing FROM this LO)
      const dependentEdgesRes = await supabase
        .from("teacher_lo_submission_edge")
        .select("target_lo_id, teacher_lo_submission!inner(status)")
        .eq("source_lo_id", learningObject.id)
        .eq("teacher_lo_submission.status", "approved");

      // Deduplicate prerequisite and dependent LO IDs
      const prerequisiteLoIds = Array.from(new Set((prerequisiteEdgesRes.data ?? []).map((edge: any) => edge.source_lo_id).filter(Boolean)));
      const dependentLoIds = Array.from(new Set((dependentEdgesRes.data ?? []).map((edge: any) => edge.target_lo_id).filter(Boolean)));

      // Fetch the actual LO details for prerequisites and dependents
      const [prereqLosRes, dependentLosRes, assessmentRes, attemptsRes] = await Promise.all([
        prerequisiteLoIds.length > 0
          ? supabase.from("learning_object").select("*").in("id", prerequisiteLoIds)
          : Promise.resolve({ data: [], error: null }),
        dependentLoIds.length > 0
          ? supabase.from("learning_object").select("*").in("id", dependentLoIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("lo_assessment")
          .select("*, lo_question(*, lo_question_option(*))")
          .eq("learning_object_id", learningObject.id)
          .maybeSingle(),
        userId ? supabase.from("user_assessment_attempt").select("*").eq("user_id", userId).order("attempt_number", { ascending: false }) : Promise.resolve({ data: [], error: null })
      ]);

      if (contentRes.error) {
        throw contentRes.error;
      }

      // Transform teacher submission content to be compatible with LearningObjectContent
      const contents = (contentRes.data ?? []).map((item: any) => ({
        id: item.id,
        learning_object_id: learningObject.id,
        delivery_type_id: item.delivery_type_id,
        title: item.title,
        content_json: item.content_json,
        sequence_order: item.sequence_order,
        is_active: true,
        delivery_type: item.delivery_type
      }));

      loDetail = {
        ...learningObject,
        contents,
        deliveryTypes: {},
        prerequisites: (prereqLosRes.data as LearningObject[] | null) ?? [],
        dependents: (dependentLosRes.data as LearningObject[] | null) ?? [],
        assessment: assessmentRes.data
          ? {
              ...(assessmentRes.data as any),
              questions: ((assessmentRes.data as any).lo_question ?? []) as any[]
            }
          : undefined,
        progress: undefined
      };

      const prerequisiteLOs = loDetail.prerequisites;
      const dependentLOs = loDetail.dependents;

      const progressIds = [loDetail.id, ...prerequisiteLOs.map((pr) => pr.id), ...dependentLOs.map((dep) => dep.id)];
      const progressRes = userId && progressIds.length > 0 ? await supabase.from("user_learning_progress").select("*").eq("user_id", userId).in("learning_object_id", progressIds) : null;
      const progressEntries = (progressRes?.data?.map((row: any) => [row.learning_object_id, row] as [string, any]) ?? []) as Array<[string, any]>;
      progressMap = new Map<string, any>(progressEntries);
      loDetail.progress = progressMap.get(loDetail.id);
      attempts = attemptsRes.data ?? [];
    }
  }

  if (!loDetail) {
    notFound();
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

  let courseRoadmapData: { nodes: RoadmapNode[]; edges: RoadmapEdge[]; mostTakenPathNodeIds?: string[] } | undefined;

  if (supabase) {
    const { data: dsaCourseRow } = await supabase.from("course").select("id").eq("slug", "dsa").maybeSingle();
    const dsaCourseId = (dsaCourseRow as { id?: string } | null)?.id;

    if (dsaCourseId) {
      const { data: courseMembershipRows } = await supabase
        .from("course_learning_object")
        .select("learning_object_id")
        .eq("course_id", dsaCourseId);

      const courseLoIds = (courseMembershipRows ?? [])
        .map((row: any) => row.learning_object_id as string)
        .filter(Boolean);

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

        // Deduplicate edges across multiple teachers
        const edgeMap = new Map<string, { source: string; target: string }>();
        (approvedEdgesRes.data ?? []).forEach((edge: any) => {
          const sourceId = edge.source_lo_id as string;
          const targetId = edge.target_lo_id as string;
          // Only include edges where both nodes are in the course
          if (courseLoIdSet.has(sourceId) && courseLoIdSet.has(targetId)) {
            const edgeKey = `${sourceId}->${targetId}`;
            if (!edgeMap.has(edgeKey)) {
              edgeMap.set(edgeKey, { source: sourceId, target: targetId });
            }
          }
        });

        const edges: RoadmapEdge[] = Array.from(edgeMap.values());

        // TODO: Replace hardcoded/empty popular path with learner analytics-derived path.
        courseRoadmapData = { nodes, edges };
      }
    }
  }

  return (
    <div className="space-y-10 p-6">
      <LOHeader lo={loDetail} />
      <LODetailTabs
        content={contentTabs}
        roadmap={roadmap}
        courseRoadmap={courseRoadmapData}
        assessment={loDetail.assessment}
        attempts={attempts}
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
