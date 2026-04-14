"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, ArrowRight, Search } from "lucide-react";
import type { Database } from "@/types/database";

type Course = Database["public"]["Tables"]["course"]["Row"];
type SortOption = "title-asc" | "title-desc";

interface CourseCatalogProps {
  courses: Course[];
}

function sortCourses(courses: Course[], sortBy: SortOption): Course[] {
  const sorted = [...courses];

  if (sortBy === "title-desc") {
    return sorted.sort((a, b) => b.title.localeCompare(a.title));
  }

  return sorted.sort((a, b) => a.title.localeCompare(b.title));
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900">
        <BookOpen className="h-5 w-5 text-slate-600" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-300">{message}</p>
        <p className="text-xs text-slate-600">{sub}</p>
      </div>
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <Link href={`/courses/${course.slug}`} className="group block cursor-pointer">
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
            {course.title}
          </h3>
          <p className="text-xs leading-relaxed text-slate-500">
            {course.description ?? "Explore this course and continue your learning path."}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-label text-slate-600">
            {course.slug.toUpperCase()}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 opacity-0 transition-opacity duration-150 group-hover:text-brand group-hover:opacity-100">
            Enter
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function CourseCatalog({ courses }: CourseCatalogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("title-asc");

  const filteredAndSortedCourses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = query
      ? courses.filter(
          (course) =>
            course.title.toLowerCase().includes(query) ||
            course.slug.toLowerCase().includes(query)
        )
      : courses;

    return sortCourses(filtered, sortBy);
  }, [courses, searchQuery, sortBy]);

  const featuredCourses = useMemo(() => {
    if (courses.length === 0) return [];
    return [courses[0]];
  }, [courses]);

  const sortedFeaturedCourses = useMemo(
    () => sortCourses(featuredCourses, sortBy),
    [featuredCourses, sortBy]
  );

  return (
    <div className="space-y-6">
      {/* ── Search + sort ── */}
      <div className="grid gap-2.5 md:grid-cols-[1fr_180px]">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
          <Input
            type="text"
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>

        <select
          className="h-10 rounded-lg border border-slate-800 bg-slate-900/60 px-3 text-sm text-slate-400 outline-none backdrop-blur-[1px] transition-colors focus:border-brand/50 focus:ring-1 focus:ring-brand/30"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as SortOption)}
          aria-label="Sort courses"
        >
          <option value="title-asc">Sort: A–Z</option>
          <option value="title-desc">Sort: Z–A</option>
        </select>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="featured" className="w-full">
        <TabsList>
          <TabsTrigger value="featured">Featured</TabsTrigger>
          <TabsTrigger value="all">All Courses</TabsTrigger>
        </TabsList>

        <TabsContent value="featured">
          {sortedFeaturedCourses.length === 0 ? (
            <EmptyState
              message="No featured courses yet"
              sub="Courses will appear here once available."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedFeaturedCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all">
          {filteredAndSortedCourses.length === 0 ? (
            <EmptyState
              message="No courses found"
              sub="Try a different search query."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAndSortedCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
