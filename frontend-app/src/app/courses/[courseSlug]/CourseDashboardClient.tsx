"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Route } from "next";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CourseRoadmap } from "@/components/lo/CourseRoadmap";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";

interface SubmissionTile {
  submissionId: string;
  loTitle: string;
  teacherName: string;
}

interface CourseDashboardClientProps {
  courseSlug: string;
  courseTitle: string;
  submissions: SubmissionTile[];
  roadmap: {
    nodes: RoadmapNode[];
    edges: RoadmapEdge[];
  };
}

export function CourseDashboardClient({ courseSlug, courseTitle, submissions, roadmap }: CourseDashboardClientProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSubmissions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return submissions;
    }

    return submissions.filter((entry) => {
      const loMatch = entry.loTitle.toLowerCase().includes(query);
      const teacherMatch = entry.teacherName.toLowerCase().includes(query);
      return loMatch || teacherMatch;
    });
  }, [submissions, searchQuery]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-500/20 via-slate-950 to-slate-900 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{courseTitle}</h1>
          <p className="text-slate-400">Course dashboard</p>
        </div>

        <Tabs defaultValue="all-los" className="w-full">
          <TabsList>
            <TabsTrigger value="all-los">All available LOs</TabsTrigger>
            <TabsTrigger value="master-roadmap">Master roadmap</TabsTrigger>
            <TabsTrigger value="more">More</TabsTrigger>
          </TabsList>

          <TabsContent value="all-los" className="space-y-4">
            <Input
              type="text"
              placeholder="Search learning objects or teacher names..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />

            {filteredSubmissions.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>No approved submissions found</CardTitle>
                  <CardDescription>Try a different search term or check back later.</CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSubmissions.map((entry) => (
                  <Link key={entry.submissionId} href={`/courses/${courseSlug}/submission/${entry.submissionId}` as Route} className="block">
                    <Card className="h-full transition hover:-translate-y-0.5 hover:border-brand/40">
                      <CardHeader>
                        <CardTitle>{entry.loTitle}</CardTitle>
                        <CardDescription>Teacher: {entry.teacherName}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="master-roadmap">
            <CourseRoadmap courseSlug={courseSlug} nodes={roadmap.nodes} edges={roadmap.edges} />
          </TabsContent>

          <TabsContent value="more">
            <Card>
              <CardHeader>
                <CardTitle>More course views coming soon</CardTitle>
                <CardDescription>This tab is reserved for upcoming course-level insights.</CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
