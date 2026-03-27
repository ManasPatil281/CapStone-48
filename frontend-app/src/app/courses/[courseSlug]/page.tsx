import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";
import type { LearningObject } from "@/types/learning";
import { CourseDashboardClient } from "./CourseDashboardClient";

interface PageProps {
  params: {
    courseSlug: string;
  };
}

export default async function CourseLandingPage({ params }: PageProps) {
  const supabase = createSupabaseServerClient();

  const { data: courseRow } = await supabase.from("course").select("id,slug").eq("slug", params.courseSlug).maybeSingle();
  const course = courseRow as { id: string; slug: string; title?: string | null } | null;

  if (!course) {
    notFound();
  }

  const { data: membershipRows } = await supabase
    .from("course_learning_object")
    .select("learning_object_id")
    .eq("course_id", course.id)
    .order("id", { ascending: true });

  const loIds = (membershipRows ?? [])
    .map((row: any) => row.learning_object_id as string)
    .filter(Boolean);

  const [submissionRes, learningObjectRes, edgeRes] = loIds.length
    ? await Promise.all([
        supabase
          .from("teacher_lo_submission")
          .select("id, learning_object_id, teacher_id, status, updated_at, learning_object:learning_object_id(id,title,slug)")
          .eq("status", "approved")
          .in("learning_object_id", loIds)
          .order("updated_at", { ascending: false }),
        supabase.from("learning_object").select("*").in("id", loIds),
        supabase
          .from("teacher_lo_submission_edge")
          .select("source_lo_id, target_lo_id, teacher_lo_submission!inner(status)")
          .eq("teacher_lo_submission.status", "approved")
          .in("source_lo_id", loIds)
          .in("target_lo_id", loIds)
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null }
      ];

  if (submissionRes.error) {
    console.error("[CourseLandingPage] Failed to fetch approved submissions:", submissionRes.error);
  }

  if (learningObjectRes.error) {
    console.error("[CourseLandingPage] Failed to fetch course learning objects:", learningObjectRes.error);
  }

  if (edgeRes.error) {
    console.error("[CourseLandingPage] Failed to fetch course roadmap edges:", edgeRes.error);
  }

  const submissions = (submissionRes.data ?? []) as Array<{
    id: string;
    learning_object_id: string;
    teacher_id: string;
    learning_object: { id: string; title: string; slug: string } | null;
  }>;

  const teacherIds = Array.from(new Set(submissions.map((item) => item.teacher_id).filter(Boolean)));

  const { data: teacherRows, error: teacherError } = teacherIds.length
    ? await supabase.from("user_profile").select("id, full_name").in("id", teacherIds)
    : { data: [], error: null };

  if (teacherError) {
    console.error("[CourseLandingPage] Failed to fetch teacher names:", teacherError);
  }

  const teacherNameById = new Map<string, string>();
  (teacherRows ?? []).forEach((row: any) => {
    teacherNameById.set(row.id as string, (row.full_name as string | null) ?? "Unknown Teacher");
  });

  const submissionTiles = submissions
    .filter((item) => item.learning_object?.slug)
    .map((item) => ({
      submissionId: item.id,
      loTitle: item.learning_object?.title ?? "Untitled LO",
      teacherName: teacherNameById.get(item.teacher_id) ?? "Unknown Teacher"
    }));

  const learningObjects = (learningObjectRes.data as LearningObject[] | null) ?? [];

  const nodes: RoadmapNode[] = learningObjects.map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    difficulty: item.difficulty_level,
    estimatedTime: item.estimated_time_minutes,
    status: "NOT_STARTED"
  }));

  const loIdSet = new Set(learningObjects.map((item) => item.id));
  const edgeMap = new Map<string, RoadmapEdge>();
  (edgeRes.data ?? []).forEach((edge: any) => {
    const sourceId = edge.source_lo_id as string;
    const targetId = edge.target_lo_id as string;

    if (!loIdSet.has(sourceId) || !loIdSet.has(targetId)) {
      return;
    }

    const key = `${sourceId}->${targetId}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, { source: sourceId, target: targetId });
    }
  });

  const edges = Array.from(edgeMap.values());

  return (
    <CourseDashboardClient
      courseSlug={course.slug}
      courseTitle={course.title ?? course.slug.toUpperCase()}
      submissions={submissionTiles}
      roadmap={{ nodes, edges }}
    />
  );
}
