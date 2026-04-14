import { requireRole } from "@/lib/auth/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, ClipboardList, FilePlus, MessageSquare, BarChart2 } from "lucide-react";

export default async function TeacherPage() {
  const user = await requireRole(["TEACHER", "ADMIN"]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Page header */}
        <div className="border-b border-slate-800 pb-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
            {user.role}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Teacher Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {user.profile?.full_name || user.email}
          </p>
        </div>

        {/* Action cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* My Submissions — coming soon */}
          <Card className="flex flex-col gap-4">
            <CardHeader>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800">
                <ClipboardList className="h-4.5 w-4.5 text-slate-400" />
              </div>
              <CardTitle>My Submissions</CardTitle>
              <CardDescription>View and manage your learning object submissions</CardDescription>
            </CardHeader>
            <p className="text-xs text-slate-600">Coming soon — submission management interface</p>
          </Card>

          {/* Create New Submission — active */}
          <Card className="flex flex-col gap-4 border-brand/20 bg-brand/5">
            <CardHeader>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand/30 bg-brand/15">
                <FilePlus className="h-4.5 w-4.5 text-brand" />
              </div>
              <CardTitle>Create New Submission</CardTitle>
              <CardDescription>Submit content for existing learning objects</CardDescription>
            </CardHeader>
            <div>
              <Button asChild>
                <Link href="/teacher/submissions/new">Create New Submission</Link>
              </Button>
            </div>
          </Card>

          {/* Review Submissions — coming soon */}
          <Card className="flex flex-col gap-4">
            <CardHeader>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800">
                <MessageSquare className="h-4.5 w-4.5 text-slate-400" />
              </div>
              <CardTitle>Review Submissions</CardTitle>
              <CardDescription>Review and provide feedback on student work</CardDescription>
            </CardHeader>
            <p className="text-xs text-slate-600">Coming soon — student work review interface</p>
          </Card>

          {/* Course Analytics — coming soon */}
          <Card className="flex flex-col gap-4">
            <CardHeader>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800">
                <BarChart2 className="h-4.5 w-4.5 text-slate-400" />
              </div>
              <CardTitle>Course Analytics</CardTitle>
              <CardDescription>View student engagement and performance metrics</CardDescription>
            </CardHeader>
            <p className="text-xs text-slate-600">Coming soon — analytics dashboard</p>
          </Card>
        </div>

        {/* Back link */}
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
