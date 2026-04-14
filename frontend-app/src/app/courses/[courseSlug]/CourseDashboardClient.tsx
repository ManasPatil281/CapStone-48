"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Route } from "next";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CourseRoadmap } from "@/components/lo/CourseRoadmap";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";
import { ArrowLeft, BookOpen, GitBranch } from "lucide-react";

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

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800">
        <BookOpen className="h-5 w-5 text-slate-500" />
      </div>
      <p className="text-sm font-medium text-slate-300">{message}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
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
    <main className="min-h-screen bg-slate-950 px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Back link + page header */}
        <div className="space-y-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Courses
          </Link>

          <div className="border-b border-slate-800 pb-5">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Course</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{courseTitle}</h1>
          </div>
        </div>

        <Tabs defaultValue="all-los" className="w-full">
          <TabsList>
            <TabsTrigger value="all-los">
              <BookOpen className="h-3.5 w-3.5" />
              All available LOs
            </TabsTrigger>
            <TabsTrigger value="master-roadmap">
              <GitBranch className="h-3.5 w-3.5" />
              Master roadmap
            </TabsTrigger>
            <TabsTrigger value="more">More</TabsTrigger>
          </TabsList>

          {/* ── All LOs tab ── */}
          <TabsContent value="all-los" className="space-y-4">
            <Input
              type="text"
              placeholder="Search learning objects or teacher names..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />

            {filteredSubmissions.length === 0 ? (
              <EmptyState
                message="No approved submissions found"
                sub="Try a different search term or check back later."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSubmissions.map((entry) => (
                  <Link
                    key={entry.submissionId}
                    href={`/courses/${courseSlug}/submission/${entry.submissionId}` as Route}
                    className="group block cursor-pointer"
                  >
                    <Card className="h-full transition-all duration-200 hover:border-brand/40 hover:shadow-md hover:shadow-brand/5">
                      <CardHeader>
                        <CardTitle className="group-hover:text-brand transition-colors duration-150">
                          {entry.loTitle}
                        </CardTitle>
                        <CardDescription>Instructor: {entry.teacherName}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Roadmap tab ── */}
          <TabsContent value="master-roadmap">
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
                <GitBranch className="h-4 w-4 flex-shrink-0 text-brand" />
                <div>
                  <p className="text-sm font-medium text-slate-200">Master Roadmap</p>
                  <p className="text-xs text-slate-500">
                    Visualises the prerequisite graph for all learning objects in {courseTitle}.
                  </p>
                </div>
              </div>
              <CourseRoadmap courseSlug={courseSlug} nodes={roadmap.nodes} edges={roadmap.edges} />
            </div>
          </TabsContent>

          {/* ── More tab ── */}
          <TabsContent value="more">
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 py-14 text-center">
              <p className="text-sm font-medium text-slate-400">More course views coming soon</p>
              <p className="text-xs text-slate-500">
                This tab is reserved for upcoming course-level insights.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
