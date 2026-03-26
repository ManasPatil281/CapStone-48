import { requireRole } from "@/lib/auth/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function TeacherPage() {
  const user = await requireRole(["TEACHER", "ADMIN"]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-500/20 via-slate-950 to-slate-900 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
          <p className="text-slate-400">
            Welcome, {user.profile?.full_name || user.email} ({user.role})
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>My Submissions</CardTitle>
              <CardDescription>View and manage your learning object submissions</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <p className="text-sm text-slate-400">Coming soon: Submission management interface</p>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create New Submission</CardTitle>
              <CardDescription>Submit content for existing learning objects</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <p className="text-sm text-slate-400">Coming soon: Content creation workflow</p>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Review Submissions</CardTitle>
              <CardDescription>Review and provide feedback on student work</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <p className="text-sm text-slate-400">Coming soon: Student work review interface</p>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Course Analytics</CardTitle>
              <CardDescription>View student engagement and performance metrics</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <p className="text-sm text-slate-400">Coming soon: Analytics dashboard</p>
            </div>
          </Card>
        </div>

        <div className="pt-4">
          <Button asChild variant="ghost">
            <Link href="/dashboard">← Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
