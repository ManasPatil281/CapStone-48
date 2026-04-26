"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDisplayDate } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Edit3, Loader2, Plus, Trash2 } from "lucide-react";

type SubmissionCard = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  course_title: string;
  lo_title: string;
};

type MySubmissionsClientProps = {
  teacherId: string;
  initialSubmissions: SubmissionCard[];
};

const SOFT_DELETE_NOTE_PREFIX = "[SOFT_DELETED]";

export function MySubmissionsClient({ teacherId, initialSubmissions }: MySubmissionsClientProps) {
  const [submissions, setSubmissions] = useState<SubmissionCard[]>(initialSubmissions);
  const [error, setError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeDelete, setActiveDelete] = useState<SubmissionCard | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  const normalizedDeleteText = deleteConfirmationText.trim();
  const canConfirmDelete =
    !!activeDelete && normalizedDeleteText === activeDelete.title;

  const sortedSubmissions = useMemo(
    () =>
      [...submissions].sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      }),
    [submissions]
  );

  function openDeleteModal(item: SubmissionCard) {
    setError(null);
    setDeleteConfirmationText("");
    setActiveDelete(item);
  }

  function closeDeleteModal() {
    if (deleteLoading) {
      return;
    }
    setDeleteConfirmationText("");
    setActiveDelete(null);
  }

  async function handleDeleteSubmission() {
    if (!activeDelete) {
      return;
    }

    setDeleteLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();

    try {
      const { data: ownedSubmission, error: submissionLookupErr } = await supabase
        .from("teacher_lo_submission")
        .select("id")
        .eq("id", activeDelete.id)
        .eq("teacher_id", teacherId)
        .maybeSingle();

      if (submissionLookupErr) {
        throw submissionLookupErr;
      }

      if (!ownedSubmission) {
        throw new Error("Submission not found or you do not have permission to delete it.");
      }

      const { error: submissionDeleteErr } = await supabase
        .from("teacher_lo_submission")
        .delete()
        .eq("id", activeDelete.id)
        .eq("teacher_id", teacherId);

      if (submissionDeleteErr) {
        const pgCode = String((submissionDeleteErr as { code?: unknown }).code ?? "");

        // FK conflicts mean tracking history references this submission.
        // Use a soft delete status transition instead of deleting linked rows.
        if (pgCode === "23503") {
          const existingNotes = (activeDelete.notes ?? "").trim();
          const softDeletedNotes = `${SOFT_DELETE_NOTE_PREFIX} ${new Date().toISOString()}${
            existingNotes ? ` | ${existingNotes}` : ""
          }`;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: softDeleteErr } = await (supabase as any)
            .from("teacher_lo_submission")
            .update({ status: "rejected", notes: softDeletedNotes })
            .eq("id", activeDelete.id)
            .eq("teacher_id", teacherId);

          if (softDeleteErr) {
            throw softDeleteErr;
          }
        } else {
          throw submissionDeleteErr;
        }
      }

      setSubmissions((prev) => prev.filter((item) => item.id !== activeDelete.id));
      setDeleteConfirmationText("");
      setActiveDelete(null);
    } catch (deleteErr: unknown) {
      const pgMsg =
        deleteErr !== null &&
        typeof deleteErr === "object" &&
        "message" in (deleteErr as object) &&
        typeof (deleteErr as { message?: unknown }).message === "string"
          ? (deleteErr as { message: string }).message
          : null;
      const pgCode =
        deleteErr !== null &&
        typeof deleteErr === "object" &&
        "code" in (deleteErr as object)
          ? String((deleteErr as { code?: unknown }).code)
          : null;
      const pgDetails =
        deleteErr !== null &&
        typeof deleteErr === "object" &&
        "details" in (deleteErr as object) &&
        typeof (deleteErr as { details?: unknown }).details === "string"
          ? (deleteErr as { details: string }).details
          : null;

      console.error("[MySubmissionsClient] Failed to delete submission:", {
        error: deleteErr,
        submissionId: activeDelete.id,
        teacherId,
      });

      if (pgMsg || pgCode) {
        console.error(
          `[MySubmissionsClient] Delete DB error [${pgCode ?? "?"}]: ${pgMsg}${
            pgDetails ? ` — ${pgDetails}` : ""
          }`
        );
      }

      const msg =
        pgMsg ??
        (deleteErr instanceof Error
          ? deleteErr.message
          : "Failed to delete submission. Please try again.");
      setError(msg);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-3">
          <Link
            href="/teacher"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Teacher Dashboard
          </Link>

          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-50">My Submissions</h1>
              <p className="mt-1 text-sm text-slate-500">
                View, edit, and delete your learning-object submissions.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/teacher/submissions/new">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Submission
              </Link>
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {sortedSubmissions.length === 0 ? (
          <Card className="space-y-4 p-8 text-center">
            <CardTitle>No submissions yet</CardTitle>
            <CardDescription>
              Create your first learning-object submission to start building course content.
            </CardDescription>
            <div>
              <Button asChild>
                <Link href="/teacher/submissions/new">Create Submission</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sortedSubmissions.map((submission) => {
              const activityDate = submission.updated_at || submission.created_at;
              const dateText = formatDisplayDate(activityDate);
              const noteText = submission.notes?.trim() ?? "";

              return (
                <Card key={submission.id} className="space-y-4 p-5">
                  <div className="space-y-1">
                    <CardTitle className="text-lg text-slate-100">{submission.title}</CardTitle>
                  </div>

                  <div className="space-y-1 text-sm text-slate-400">
                    <p>Learning Object: {submission.lo_title}</p>
                    <p>Course: {submission.course_title}</p>
                    <p>Updated: {dateText}</p>
                  </div>

                  {noteText && (
                    <p className="rounded-md border border-slate-800/80 bg-slate-900/50 px-3 py-2 text-xs leading-relaxed text-slate-400">
                      {noteText}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/teacher/submissions/${submission.id}/edit`}>
                        <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-300 hover:bg-red-950/40 hover:text-red-200"
                      onClick={() => openDeleteModal(submission)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {activeDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">Delete submission</h2>
            <p className="mt-2 text-sm text-slate-400">
              This removes the submission from your list. If tracking history references it,
              the app will safely archive it instead of hard deleting linked data.
            </p>
            <p className="mt-2 text-sm text-slate-400">
              This will not delete the master learning object or the course mapping.
            </p>

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Type the submission title to confirm
              </label>
              <p className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
                {activeDelete.title}
              </p>
              <Input
                value={deleteConfirmationText}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setDeleteConfirmationText(e.target.value)
                }
                placeholder="Enter exact title"
                className="border-slate-700 bg-slate-800"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeDeleteModal} disabled={deleteLoading}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDeleteSubmission}
                disabled={!canConfirmDelete || deleteLoading}
                className="bg-red-600 text-white hover:bg-red-500"
              >
                {deleteLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  "Delete Submission"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
