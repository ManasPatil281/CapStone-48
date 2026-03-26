import { requireAuth } from "@/lib/auth/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await requireAuth();

  if (user.role === "TEACHER" || user.role === "ADMIN") {
    redirect("/teacher");
  }

  const roleDisplay = user.role || "No Role Assigned";
  const showRoleWarning = !user.role;

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-500/20 via-slate-950 to-slate-900 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {user.profile?.full_name || user.email}</h1>
          <p className="text-slate-400">Role: {roleDisplay}</p>
          {showRoleWarning && (
            <p className="mt-2 text-sm text-amber-400">
              ⚠ No user profile found. Please contact an administrator to set up your account.
            </p>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>DSA Course</CardTitle>
              <CardDescription>Explore data structures and algorithms with adaptive learning</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <Button asChild>
                <Link href="/courses/dsa/linked-list">Start with Linked List</Link>
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My Progress</CardTitle>
              <CardDescription>Track your learning journey and achievements</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <p className="text-sm text-slate-400">Coming soon: Progress tracking and analytics</p>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Learning Path</CardTitle>
              <CardDescription>View your personalized learning roadmap</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <p className="text-sm text-slate-400">Coming soon: AI-powered learning recommendations</p>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
