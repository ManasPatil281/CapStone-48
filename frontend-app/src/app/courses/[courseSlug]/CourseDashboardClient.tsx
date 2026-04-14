"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Route } from "next";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseRoadmap } from "@/components/lo/CourseRoadmap";
import type { RoadmapEdge, RoadmapNode } from "@/components/lo/RoadmapTree";
import { ArrowLeft, BookOpen, GitBranch, ArrowRight, Search, User } from "lucide-react";

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
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900">
        <BookOpen className="h-5 w-5 text-slate-600" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-400">{message}</p>
        <p className="text-xs text-slate-600">{sub}</p>
      </div>
    </div>
  );
}

function SubmissionCard({ entry, courseSlug }: { entry: SubmissionTile; courseSlug: string }) {
  return (
    <Link
      href={`/courses/${courseSlug}/submission/${entry.submissionId}` as Route}
      className="group block cursor-pointer"
    >
      <div className="card-lift relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/60 p-5 shadow-card backdrop-blur-[1px] hover:border-brand/30 hover:bg-slate-900/80 hover:shadow-brand-glow">
        {/* Accent bar */}
        <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-xl bg-brand/0 transition-colors duration-200 group-hover:bg-brand/40" />

        {/* Icon */}
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-800/80 transition-colors group-hover:border-brand/25 group-hover:bg-brand/10">
          <BookOpen className="h-4 w-4 text-slate-500 transition-colors group-hover:text-brand" />
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-1.5">
          <h3 className="text-sm font-semibold leading-snug tracking-tight text-slate-100 transition-colors duration-150 group-hover:text-white">
            {entry.loTitle}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <User className="h-3 w-3 text-slate-600" />
            <span>{entry.teacherName}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-label text-slate-600">
            Learning Object
          </span>
          <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 opacity-0 transition-opacity duration-150 group-hover:text-brand group-hover:opacity-100">
            Open
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function CourseDashboardClient({
  courseSlug,
  courseTitle,
  submissions,
  roadmap
}: CourseDashboardClientProps) {
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
    <main className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">

        {/* ── Navigation + Header ── */}
        <div className="space-y-5">
          <Link
            href="/dashboard"
            className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 transition-colors hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Courses
          </Link>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-label text-slate-600">
              Course
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-50">
              {courseTitle}
            </h1>
            <p className="text-sm text-slate-500">
              {submissions.length} approved learning object{submissions.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="h-px w-full bg-slate-800/60" />

        {/* ── Tabs ── */}
        <Tabs defaultValue="all-los" className="w-full">
          <TabsList>
            <TabsTrigger value="all-los">
              <BookOpen className="h-3.5 w-3.5" />
              Learning Objects
            </TabsTrigger>
            <TabsTrigger value="master-roadmap">
              <GitBranch className="h-3.5 w-3.5" />
              Master Roadmap
            </TabsTrigger>
            <TabsTrigger value="more">More</TabsTrigger>
          </TabsList>

          {/* ── All LOs tab ── */}
          <TabsContent value="all-los" className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
              <Input
                type="text"
                placeholder="Search learning objects or instructors..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
              />
            </div>

            {filteredSubmissions.length === 0 ? (
              <EmptyState
                message="No approved submissions found"
                sub="Try a different search term or check back later."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSubmissions.map((entry) => (
                  <SubmissionCard
                    key={entry.submissionId}
                    entry={entry}
                    courseSlug={courseSlug}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Roadmap tab ── */}
          <TabsContent value="master-roadmap">
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-brand/20 bg-brand/10">
                  <GitBranch className="h-3.5 w-3.5 text-brand" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">Master Prerequisite Graph</p>
                  <p className="text-xs text-slate-500">
                    Visualises the dependency graph for all learning objects in {courseTitle}.
                  </p>
                </div>
              </div>
              <CourseRoadmap
                courseSlug={courseSlug}
                nodes={roadmap.nodes}
                edges={roadmap.edges}
              />
            </div>
          </TabsContent>

          {/* ── More tab ── */}
          <TabsContent value="more">
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900">
                <BookOpen className="h-5 w-5 text-slate-600" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-400">More course views coming soon</p>
                <p className="text-xs text-slate-600">
                  This tab is reserved for upcoming course-level insights.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
