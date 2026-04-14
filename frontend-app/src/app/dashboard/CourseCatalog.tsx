"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen } from "lucide-react";
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800">
        <BookOpen className="h-5 w-5 text-slate-500" />
      </div>
      <p className="text-sm font-medium text-slate-300">{message}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

export function CourseCatalog({ courses }: CourseCatalogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("title-asc");

  const filteredAndSortedCourses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = query
      ? courses.filter((course) => course.title.toLowerCase().includes(query) || course.slug.toLowerCase().includes(query))
      : courses;

    return sortCourses(filtered, sortBy);
  }, [courses, searchQuery, sortBy]);

  const featuredCourses = useMemo(() => {
    if (courses.length === 0) return [];
    return [courses[0]];
  }, [courses]);

  const sortedFeaturedCourses = useMemo(() => sortCourses(featuredCourses, sortBy), [featuredCourses, sortBy]);

  return (
    <div className="space-y-6">
      {/* Search + sort bar */}
      <div className="grid gap-3 md:grid-cols-[1fr_200px]">
        <Input
          type="text"
          placeholder="Search courses by title..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />

        <select
          className="h-11 rounded-lg border border-slate-700 bg-slate-800/50 px-3 text-sm text-slate-100 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as SortOption)}
          aria-label="Sort courses"
        >
          <option value="title-asc">Sort: A–Z</option>
          <option value="title-desc">Sort: Z–A</option>
        </select>
      </div>

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
                <Link key={course.id} href={`/courses/${course.slug}`} className="group block cursor-pointer">
                  <Card className="h-full border-slate-800 transition-all duration-200 hover:border-brand/40 hover:shadow-md hover:shadow-brand/5">
                    <CardHeader>
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-brand/20">
                        <BookOpen className="h-4 w-4 text-brand" />
                      </div>
                      <CardTitle className="group-hover:text-brand transition-colors duration-150">
                        {course.title}
                      </CardTitle>
                      <CardDescription>
                        {course.description ?? "Explore this course and continue your learning path."}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
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
                <Link key={course.id} href={`/courses/${course.slug}`} className="group block cursor-pointer">
                  <Card className="h-full border-slate-800 transition-all duration-200 hover:border-brand/40 hover:shadow-md hover:shadow-brand/5">
                    <CardHeader>
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-brand/20">
                        <BookOpen className="h-4 w-4 text-brand" />
                      </div>
                      <CardTitle className="group-hover:text-brand transition-colors duration-150">
                        {course.title}
                      </CardTitle>
                      <CardDescription>
                        {course.description ?? "Open course"}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
