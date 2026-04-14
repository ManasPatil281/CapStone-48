"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Assessment, AssessmentAttempt, ContentTabData } from "@/types/learning";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";
import { DeliveryTypeTabs } from "@/components/lo/DeliveryTypeTabs";
import { RoadmapTree } from "@/components/lo/RoadmapTree";
import { CourseRoadmap } from "@/components/lo/CourseRoadmap";

interface Props {
  content: ContentTabData;
  courseSlug?: string;
  roadmap: {
    nodes: RoadmapNode[];
    edges: RoadmapEdge[];
    currentNodeId?: string;
  };
  courseRoadmap?: {
    nodes: RoadmapNode[];
    edges: RoadmapEdge[];
    mostTakenPathNodeIds?: string[];
  };
  assessment?: Assessment & { questions: any[] };
  attempts?: AssessmentAttempt[];
  recommendedTab?: string;
}

export function LODetailTabs({ content, courseSlug = "dsa", roadmap, courseRoadmap, assessment, attempts, recommendedTab }: Props) {
  return (
    <Tabs defaultValue="content">
      <TabsList>
        <TabsTrigger value="content">Content</TabsTrigger>
        <TabsTrigger value="roadmap">Module Roadmap</TabsTrigger>
        {courseRoadmap && <TabsTrigger value="courseRoadmap">📚 Course Roadmap</TabsTrigger>}
      </TabsList>
      <TabsContent value="content">
        <DeliveryTypeTabs data={content} assessment={assessment} attempts={attempts} recommended={recommendedTab} />
      </TabsContent>
      <TabsContent value="roadmap">
        <RoadmapTree
          nodes={roadmap.nodes}
          edges={roadmap.edges}
          currentNodeId={roadmap.currentNodeId}
          mostTakenPathNodeIds={courseRoadmap?.mostTakenPathNodeIds}
        />
      </TabsContent>
      {courseRoadmap && (
        <TabsContent value="courseRoadmap">
          <CourseRoadmap courseSlug={courseSlug} nodes={courseRoadmap.nodes} edges={courseRoadmap.edges} mostTakenPathNodeIds={courseRoadmap.mostTakenPathNodeIds} />
        </TabsContent>
      )}
    </Tabs>
  );
}
