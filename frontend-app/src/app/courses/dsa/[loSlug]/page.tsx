import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AssessmentAttempt, ContentTabData, LearningObjectDetail, LearningObject } from "@/types/learning";
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

    const { data: learningObject, error } = await supabase.from("learning_object").select("*").eq("slug", params.loSlug).maybeSingle();

    if (!error && learningObject) {
      const [contentRes, prereqRes, dependentsRes, assessmentRes, attemptsRes] = await Promise.all([
        supabase.from("learning_object_content").select("*, delivery_type:delivery_type_id(*)").eq("learning_object_id", learningObject.id).eq("is_active", true).order("sequence_order", { ascending: true }),
        supabase
          .from("learning_object_prerequisite")
          .select("prerequisite:learning_object!learning_object_prerequisite_prerequisite_lo_id_fkey (*)")
          .eq("learning_object_id", learningObject.id),
        supabase
          .from("learning_object_prerequisite")
          .select("dependent:learning_object!learning_object_prerequisite_learning_object_id_fkey (*)")
          .eq("prerequisite_lo_id", learningObject.id),
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

      loDetail = {
        ...learningObject,
        contents: contentRes.data ?? [],
        deliveryTypes: {},
        prerequisites: (prereqRes.data?.map((row: any) => row.prerequisite as LearningObject) ?? []).filter(Boolean),
        dependents: (dependentsRes.data?.map((row: any) => row.dependent as LearningObject) ?? []).filter(Boolean),
        assessment: assessmentRes.data
          ? {
              ...assessmentRes.data,
              questions: assessmentRes.data.lo_question ?? []
            }
          : undefined,
        progress: undefined
      };

      const prerequisiteLOs = loDetail.prerequisites;
      const dependentLOs = loDetail.dependents;

      const progressIds = [loDetail.id, ...prerequisiteLOs.map((pr) => pr.id), ...dependentLOs.map((dep) => dep.id)];
      const progressRes = userId && progressIds.length > 0 ? await supabase.from("user_learning_progress").select("*").eq("user_id", userId).in("learning_object_id", progressIds) : null;
      const progressEntries = progressRes?.data?.map((row) => [row.learning_object_id, row]) ?? [];
      progressMap = new Map(progressEntries);
      loDetail.progress = progressMap.get(loDetail.id);
      attempts = attemptsRes.data ?? [];
    }
  }

  if (!loDetail && params.loSlug === "linked-list") {
    loDetail = buildMockLinkedListDetail();
    progressMap = buildMockProgressMap(loDetail);
    attempts = [];
  }

  if (!loDetail) {
    notFound();
  }

  const contentTabs = mapContentTabs(loDetail.contents);
  const recommendedTab = pickRecommendedTab(loDetail.contents);
  const roadmap = buildRoadmap({
    lo: loDetail,
    prerequisites: loDetail.prerequisites,
    dependents: loDetail.dependents,
    progressMap
  });

  return (
    <div className="space-y-10 p-6">
      <LOHeader lo={loDetail} />
      <LODetailTabs content={contentTabs} roadmap={roadmap} assessment={loDetail.assessment} attempts={attempts} recommendedTab={recommendedTab} />
    </div>
  );
}

function mapContentTabs(contents: LearningObjectDetail["contents"]): ContentTabData {
  return contents.reduce<ContentTabData>((acc, item) => {
    const code = item.delivery_type?.code;
    const assign = (key: keyof ContentTabData) => {
      acc[key] = acc[key] ?? [];
      acc[key]!.push(item);
    };

    switch (code) {
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
        assign("flashcards");
        break;
      default:
        break;
    }
    return acc;
  }, {} as ContentTabData);
}

function pickRecommendedTab(contents: LearningObjectDetail["contents"]) {
  const priority = ["PLAYGROUND", "VIDEO", "READING_NOTES", "READING_PDF"];
  for (const code of priority) {
    if (contents.some((content) => content.delivery_type?.code === code)) {
      switch (code) {
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
}): { nodes: RoadmapNode[]; edges: RoadmapEdge[] } {
  const nodes: RoadmapNode[] = [
    ...prerequisites.map((pr) => ({
      id: pr.id,
      title: pr.title,
      difficulty: pr.difficulty_level,
      estimatedTime: pr.estimated_time_minutes,
      status: (progressMap?.get(pr.id)?.status as RoadmapNode["status"]) ?? "NOT_STARTED"
    })),
    {
      id: lo.id,
      title: lo.title,
      difficulty: lo.difficulty_level,
      estimatedTime: lo.estimated_time_minutes,
      status: (progressMap?.get(lo.id)?.status as RoadmapNode["status"]) ?? (lo.progress?.status as RoadmapNode["status"]) ?? "IN_PROGRESS"
    },
    ...dependents.map((dep) => ({
      id: dep.id,
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

  return { nodes, edges };
}

function buildMockLinkedListDetail(): LearningObjectDetail {
  const loId = "mock-linked-list";
  const prerequisites: LearningObject[] = [
    {
      id: "mock-arrays",
      title: "Arrays",
      slug: "arrays",
      description: "Understand contiguous memory structures and indexing.",
      difficulty_level: 1,
      estimated_time_minutes: 30,
      status: "published"
    },
    {
      id: "mock-pointers",
      title: "Pointers & References",
      slug: "pointers-references",
      description: "Work with memory addresses and references.",
      difficulty_level: 2,
      estimated_time_minutes: 25,
      status: "published"
    }
  ];

  const dependents: LearningObject[] = [
    {
      id: "mock-stack",
      title: "Stack",
      slug: "stack",
      description: "Last-in-first-out data structure built atop linked lists.",
      difficulty_level: 3,
      estimated_time_minutes: 30,
      status: "published"
    },
    {
      id: "mock-queue",
      title: "Queue",
      slug: "queue",
      description: "First-in-first-out structure and variations.",
      difficulty_level: 3,
      estimated_time_minutes: 30,
      status: "published"
    }
  ];

  const videoLinks = [
    { title: "Linked List Crash Course", url: "https://youtu.be/LyuuqCVkP5I?si=1lYGokGPCmOVYT4k" },
    { title: "Pointers + Linked Lists Visualized", url: "https://youtu.be/R-CKBYnOv1U?si=RR6miKw3wLAqN7WU" },
    { title: "Linked List Problem Walkthroughs", url: "https://youtu.be/nzaHG0dme4g?si=w0zzdtPNWyBtbEkJ" },
    { title: "Insertion & Deletion Mastery", url: "https://youtu.be/-1E8ZMS0gSs?si=anNHW0u1eON-Xtwc" },
    { title: "Live Linked List Debugging", url: "https://youtu.be/-1E8ZMS0gSs?si=aMP24_kARTc_hmCV" },
    { title: "Reverse Linked Lists Step-by-Step", url: "https://youtu.be/f8RPIb-0DDE?si=hhLEtUJax-PtaDhL" },
    { title: "Linked List Interview Prep", url: "https://youtu.be/8ze7Zopdsaw?si=JizO7_Zw5KNcOhP-" },
    { title: "Cycle Detection Patterns", url: "https://youtu.be/bO5DasTsaRQ?si=-C6aVPOYq5phXpfq" },
    { title: "Doubly Linked Lists Explained", url: "https://youtu.be/e6lZY5Yha8U?si=L_XTz0Rtf7UoAXcA" },
    { title: "Linked List + Stack Hybrids", url: "https://youtu.be/-swgIiMIlJo?si=JGSd-SIwnv6lDzOJ" },
    { title: "Queue via Linked List", url: "https://youtu.be/wwbTMNVlFHQ?si=cmVpewZh24klUk4O" },
    { title: "Mastering Edge Cases", url: "https://youtu.be/GsY6y0iPaHw?si=gthSZ96IYi0-sP-H" }
  ];

  const videoContents = videoLinks.map((video, index) => ({
    id: `mock-video-${index + 1}`,
    learning_object_id: loId,
    delivery_type_id: "VIDEO",
    title: video.title,
    content_json: {
      url: video.url
    },
    sequence_order: index + 1,
    is_active: true,
    delivery_type: { id: "VIDEO", code: "VIDEO", name: "Video Lecture" }
  }));

  let sequenceOrder = videoContents.length + 1;

  const contents = [
    ...videoContents,
    {
      id: "mock-notes",
      learning_object_id: loId,
      delivery_type_id: "READING_NOTES",
      title: "Linked List Notes",
      content_json: {
        markdown: "## Linked List Essentials\n- Nodes store `data` and `next`\n- Head points to the first node\n- Common ops: insert, delete, reverse"
      },
      sequence_order: sequenceOrder++,
      is_active: true,
      delivery_type: { id: "READING_NOTES", code: "READING_NOTES", name: "Markdown Notes" }
    },
    {
      id: "mock-pdf",
      learning_object_id: loId,
      delivery_type_id: "READING_PDF",
      title: "Linked List Reference PDF",
      content_json: {
        pdf_url: "https://example.com/linked-list.pdf",
        page_count: 12
      },
      sequence_order: sequenceOrder++,
      is_active: true,
      delivery_type: { id: "READING_PDF", code: "READING_PDF", name: "PDF" }
    },
    {
      id: "mock-playground",
      learning_object_id: loId,
      delivery_type_id: "PLAYGROUND",
      title: "Linked List Playground",
      content_json: {
        language: "python",
        starter_code: "class Node:\n    def __init__(self, data, next=None):\n        self.data = data\n        self.next = next\n",
        practices: [
          {
            id: 1,
            title: "Insert at head",
            description: "Add a node to the beginning of the list",
            expected_output: "3 -> 2 -> 1",
            hint: "Update head pointer"
          }
        ]
      },
      sequence_order: sequenceOrder++,
      is_active: true,
      delivery_type: { id: "PLAYGROUND", code: "PLAYGROUND", name: "Code Playground" }
    },
    {
      id: "mock-flashcards",
      learning_object_id: loId,
      delivery_type_id: "FLASHCARD",
      title: "Linked List Flashcards",
      content_json: {
        cards: [
          { front: "What does the head pointer store?", back: "Reference to the first node" },
          { front: "Time to insert at head?", back: "O(1)" }
        ]
      },
      sequence_order: sequenceOrder++,
      is_active: true,
      delivery_type: { id: "FLASHCARD", code: "FLASHCARD", name: "Flashcards" }
    }
  ];

  return {
    id: loId,
    title: "Linked List",
    slug: "linked-list",
    description: "Learn traversal, insertion, deletion, and reversal of singly/doubly linked lists.",
    difficulty_level: 3,
    estimated_time_minutes: 45,
    status: "published",
    contents,
    deliveryTypes: {},
    prerequisites,
    dependents,
    assessment: {
      id: "mock-assessment",
      learning_object_id: loId,
      title: "Linked List Fundamentals",
      pass_percentage: 80,
      max_attempts: 3,
      questions: [
        {
          id: "mock-q1",
          assessment_id: "mock-assessment",
          question_type: "MCQ",
          question_text: "What is the time complexity to insert at the head?",
          metadata_json: null,
          marks: 5,
          options: [
            { id: "mock-q1-a", question_id: "mock-q1", option_text: "O(1)", is_correct: true },
            { id: "mock-q1-b", question_id: "mock-q1", option_text: "O(n)", is_correct: false }
          ]
        }
      ]
    },
    progress: {
      id: "mock-progress",
      user_id: "mock-user",
      learning_object_id: loId,
      status: "IN_PROGRESS",
      completion_percentage: 60,
      mastery_score: 62
    }
  };
}

function buildMockProgressMap(lo: LearningObjectDetail) {
  const map = new Map<string, { status: RoadmapNode["status"] }>();
  if (lo.progress) {
    map.set(lo.id, { status: lo.progress.status as RoadmapNode["status"] });
  }
  lo.prerequisites.forEach((pr) => {
    map.set(pr.id, { status: "COMPLETED" });
  });
  lo.dependents.forEach((dep) => {
    map.set(dep.id, { status: "NOT_STARTED" });
  });
  return map;
}
