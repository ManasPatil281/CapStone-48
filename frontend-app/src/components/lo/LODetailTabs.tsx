"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Assessment, AssessmentAttempt, ContentTabData } from "@/types/learning";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";
import { DeliveryTypeTabs } from "@/components/lo/DeliveryTypeTabs";
import { RoadmapTree } from "@/components/lo/RoadmapTree";
import { QuizSession } from "@/components/lo/QuizSession";

interface Props {
  content: ContentTabData;
  roadmap: {
    nodes: RoadmapNode[];
    edges: RoadmapEdge[];
  };
  assessment?: Assessment & { questions: any[] };
  attempts?: AssessmentAttempt[];
  recommendedTab?: string;
}

export function LODetailTabs({ content, roadmap, assessment, attempts, recommendedTab }: Props) {
  return (
    <Tabs defaultValue="content">
      <TabsList>
        <TabsTrigger value="content">Content</TabsTrigger>
        <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
        <TabsTrigger value="quiz">Quiz</TabsTrigger>
      </TabsList>
      <TabsContent value="content">
        <DeliveryTypeTabs data={content} recommended={recommendedTab} />
      </TabsContent>
      <TabsContent value="roadmap">
        <RoadmapTree nodes={roadmap.nodes} edges={roadmap.edges} />
      </TabsContent>
      <TabsContent value="quiz">
        <QuizSession assessment={assessment} attempts={attempts} />
      </TabsContent>
    </Tabs>
  );
}
