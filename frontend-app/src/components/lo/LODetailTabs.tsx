"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Assessment, AssessmentAttempt, ContentTabData } from "@/types/learning";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";
import { DeliveryTypeTabs } from "@/components/lo/DeliveryTypeTabs";
import { RoadmapTree } from "@/components/lo/RoadmapTree";
import { CourseRoadmap } from "@/components/lo/CourseRoadmap";
import { LayoutList, GitBranch, Map as MapIcon } from "lucide-react";

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

export function LODetailTabs({
  content,
  courseSlug = "dsa",
  roadmap,
  courseRoadmap,
  assessment,
  attempts,
  recommendedTab
}: Props) {
  return (
    <Tabs defaultValue="content" className="w-full">
      <TabsList>
        <TabsTrigger value="content">
          <LayoutList className="h-3.5 w-3.5" />
          Content
        </TabsTrigger>
        <TabsTrigger value="roadmap">
          <GitBranch className="h-3.5 w-3.5" />
          Module Roadmap
        </TabsTrigger>
        {courseRoadmap && (
          <TabsTrigger value="courseRoadmap">
            <MapIcon className="h-3.5 w-3.5" />
            Course Roadmap
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="content">
        <DeliveryTypeTabs
          data={content}
          assessment={assessment}
          attempts={attempts}
          recommended={recommendedTab}
        />
      </TabsContent>

      <TabsContent value="roadmap">
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-1 backdrop-blur-[1px]">
          <RoadmapTree
            nodes={roadmap.nodes}
            edges={roadmap.edges}
            currentNodeId={roadmap.currentNodeId}
            mostTakenPathNodeIds={courseRoadmap?.mostTakenPathNodeIds}
          />
        </div>
      </TabsContent>

      {courseRoadmap && (
        <TabsContent value="courseRoadmap">
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-1 backdrop-blur-[1px]">
            <CourseRoadmap
              courseSlug={courseSlug}
              nodes={courseRoadmap.nodes}
              edges={courseRoadmap.edges}
              mostTakenPathNodeIds={courseRoadmap.mostTakenPathNodeIds}
            />
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
}
