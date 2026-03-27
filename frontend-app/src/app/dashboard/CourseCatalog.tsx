"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <Input
          type="text"
          placeholder="Search courses by title..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />

        <select
          className="h-11 rounded-lg border border-slate-700 bg-slate-800/50 px-3 text-sm text-slate-100 outline-none focus:border-brand"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as SortOption)}
          aria-label="Sort courses"
        >
          <option value="title-asc">Sort: A-Z</option>
          <option value="title-desc">Sort: Z-A</option>
        </select>
      </div>

      <Tabs defaultValue="featured" className="w-full">
        <TabsList>
          <TabsTrigger value="featured">Featured</TabsTrigger>
          <TabsTrigger value="all">All Courses</TabsTrigger>
        </TabsList>

        <TabsContent value="featured">
          {sortedFeaturedCourses.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No featured courses yet</CardTitle>
                <CardDescription>Courses will appear here once available.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sortedFeaturedCourses.map((course) => (
                <Link key={course.id} href={`/courses/${course.slug}`} className="block">
                  <Card className="h-full transition hover:-translate-y-0.5 hover:border-brand/40">
                    <CardHeader>
                      <CardTitle>{course.title}</CardTitle>
                      <CardDescription>{course.description ?? "Explore this course and continue your learning path."}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all">
          {filteredAndSortedCourses.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No courses found</CardTitle>
                <CardDescription>Try a different search query.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAndSortedCourses.map((course) => (
                <Link key={course.id} href={`/courses/${course.slug}`} className="block">
                  <Card className="h-full transition hover:-translate-y-0.5 hover:border-brand/40">
                    <CardHeader>
                      <CardTitle>{course.title}</CardTitle>
                      <CardDescription>{course.description ?? "Open course"}</CardDescription>
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
