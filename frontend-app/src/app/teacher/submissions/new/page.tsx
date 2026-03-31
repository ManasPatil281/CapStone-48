"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/hooks";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardTitle } from "@/components/ui/card";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type Course = { id: string; title: string };
type LO = { id: string; title: string; slug: string };
type DeliveryType = { id: string; code: string; name: string };

type ContentItem = {
  deliveryTypeId: string;
  deliveryTypeCode: string;
  title: string;
  url: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewSubmissionPage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();

  // ── Remote data
  const [courses, setCourses] = useState<Course[]>([]);
  const [learningObjects, setLearningObjects] = useState<LO[]>([]);
  const [deliveryTypes, setDeliveryTypes] = useState<DeliveryType[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // ── UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── Submission form
  const [courseId, setCourseId] = useState("");
  const [selectedLoId, setSelectedLoId] = useState("");
  const [submissionTitle, setSubmissionTitle] = useState("");
  const [notes, setNotes] = useState("");

  // ── New LO inline form
  const [newLoTitle, setNewLoTitle] = useState("");
  const [newLoDescription, setNewLoDescription] = useState("");
  const [newLoDifficulty, setNewLoDifficulty] = useState("");
  const [newLoTime, setNewLoTime] = useState("");

  // ── Edges
  const [prerequisites, setPrerequisites] = useState<string[]>([]);
  const [postrequisites, setPostrequisites] = useState<string[]>([]);

  // ── Content
  const [contentItems, setContentItems] = useState<ContentItem[]>([
    { deliveryTypeId: "", deliveryTypeCode: "", title: "", url: "" },
  ]);

  // ── Load remote data once
  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowserClient();
      const [coursesRes, losRes, dtRes] = await Promise.all([
        supabase.from("course").select("id, title").order("title"),
        supabase
          .from("learning_object")
          .select("id, title, slug")
          .eq("status", "published")
          .order("title"),
        supabase
          .from("delivery_type")
          .select("id, code, name")
          .in("code", ["VIDEO", "READING_PDF"]),
      ]);

      if (coursesRes.error) console.error("[NewSubmission] courses:", coursesRes.error);
      if (losRes.error) console.error("[NewSubmission] LOs:", losRes.error);
      if (dtRes.error) console.error("[NewSubmission] delivery_types:", dtRes.error);

      setCourses(coursesRes.data ?? []);
      setLearningObjects(losRes.data ?? []);
      setDeliveryTypes(dtRes.data ?? []);
      setDataLoading(false);
    }
    load();
  }, []);

  // ── Helpers

  function toggleCheck(
    id: string,
    current: string[],
    setter: (v: string[]) => void
  ) {
    setter(
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  function updateContentItem(
    index: number,
    field: keyof ContentItem,
    value: string
  ) {
    setContentItems((prev) => {
      const next = [...prev];
      if (field === "deliveryTypeId") {
        const dt = deliveryTypes.find((d) => d.id === value);
        next[index] = {
          ...next[index],
          deliveryTypeId: value,
          deliveryTypeCode: dt?.code ?? "",
          url: "", // reset URL when type changes
        };
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  }

  // ── Submit

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();

    try {
      // 1. Optionally create new LO
      let loId = selectedLoId;
      let loTitle = submissionTitle.trim();

      if (selectedLoId === "NEW") {
        const trimmedTitle = newLoTitle.trim();
        if (!trimmedTitle) throw new Error("New LO title is required");

        const slug = generateSlug(trimmedTitle);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newLo, error: loErr } = await (supabase as any)
          .from("learning_object")
          .insert({
            title: trimmedTitle,
            slug,
            description: newLoDescription.trim() || null,
            difficulty_level: newLoDifficulty ? parseInt(newLoDifficulty, 10) : 1,
            estimated_time_minutes: newLoTime ? parseInt(newLoTime, 10) : 30,
            status: "published",
          })
          .select("id")
          .single();

        if (loErr) throw loErr;
        loId = newLo!.id;
        if (!loTitle) loTitle = trimmedTitle;

        // Make the new LO available in future edge dropdowns
        setLearningObjects((prev) => [
          ...prev,
          { id: loId, title: trimmedTitle, slug },
        ]);
      } else {
        const existingLo = learningObjects.find((l) => l.id === selectedLoId);
        if (!loTitle && existingLo) loTitle = existingLo.title;
      }

      if (!loId || !courseId) {
        throw new Error("Course and Learning Object are required");
      }

      // 2. Create teacher_lo_submission (status: "draft")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: submission, error: subErr } = await (supabase as any)
        .from("teacher_lo_submission")
        .insert({
          teacher_id: user.id,
          course_id: courseId,
          learning_object_id: loId,
          title: loTitle || "Untitled",
          notes: notes.trim() || null,
          status: "approved",
        })
        .select("id")
        .single();

      if (subErr) throw subErr;
      const submissionId = submission!.id;

      // 3. Create content rows (skip items with no type or URL)
      const validContent = contentItems.filter(
        (c) => c.deliveryTypeId && c.url.trim()
      );

      for (let i = 0; i < validContent.length; i++) {
        const item = validContent[i];
        const content_json =
          item.deliveryTypeCode === "VIDEO"
            ? { url: item.url.trim() }
            : { pdf_url: item.url.trim() };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: contentErr } = await (supabase as any)
          .from("teacher_lo_submission_content")
          .insert({
            submission_id: submissionId,
            delivery_type_id: item.deliveryTypeId,
            title: item.title.trim() || (item.deliveryTypeCode === "VIDEO" ? "Video" : "PDF"),
            content_json,
            sequence_order: i + 1,
            is_active: true,
          });

        if (contentErr) throw contentErr;
      }

      // 4. Create prerequisite edges: prereq_lo → current_lo
      for (const prereqId of prerequisites) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: edgeErr } = await (supabase as any)
          .from("teacher_lo_submission_edge")
          .insert({
            submission_id: submissionId,
            source_lo_id: prereqId,
            target_lo_id: loId,
          });
        if (edgeErr) throw edgeErr;
      }

      // 5. Create post-requisite edges: current_lo → postreq_lo
      for (const postreqId of postrequisites) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: edgeErr } = await (supabase as any)
          .from("teacher_lo_submission_edge")
          .insert({
            submission_id: submissionId,
            source_lo_id: loId,
            target_lo_id: postreqId,
          });
        if (edgeErr) throw edgeErr;
      }

      setSuccess(true);
      setTimeout(() => router.push("/teacher"), 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading / success states ─────────────────────────────────────────────

  if (userLoading || dataLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-indigo-500/20 via-slate-950 to-slate-900 p-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-slate-400">Loading…</p>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-indigo-500/20 via-slate-950 to-slate-900 p-6 flex items-center justify-center">
        <Card className="p-8 text-center space-y-4 bg-slate-900 border-slate-700">
          <div className="text-5xl">✓</div>
          <CardTitle className="text-green-400">Submission Created</CardTitle>
          <p className="text-slate-400">
            Saved as a draft. Redirecting to your dashboard…
          </p>
        </Card>
      </main>
    );
  }

  // ─── Shared style tokens ──────────────────────────────────────────────────

  const selectCls =
    "w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const labelCls = "block text-sm font-medium text-slate-300 mb-1";
  const sectionCls =
    "space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-5";

  // LOs available for edge selection — exclude the currently selected LO
  const edgeLOs = learningObjects.filter((lo) => lo.id !== selectedLoId);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-500/20 via-slate-950 to-slate-900 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create New Submission</h1>
          <p className="text-slate-400">
            Submit content for a learning object — saved as a draft for review
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Submission Details ── */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-slate-100">Submission Details</h2>

            <div>
              <label className={labelCls}>Course *</label>
              <select
                className={selectCls}
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                required
              >
                <option value="">Select a course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Submission Title</label>
              <Input
                placeholder="Defaults to the LO title if left blank"
                value={submissionTitle}
                onChange={(e) => setSubmissionTitle(e.target.value)}
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div>
              <label className={labelCls}>Notes (optional)</label>
              <textarea
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px] resize-y"
                placeholder="Any notes about this submission…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* ── Learning Object ── */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-slate-100">Learning Object</h2>

            <div>
              <label className={labelCls}>Select LO *</label>
              <select
                className={selectCls}
                value={selectedLoId}
                onChange={(e) => {
                  setSelectedLoId(e.target.value);
                  // Clear edge selections when LO changes
                  setPrerequisites([]);
                  setPostrequisites([]);
                }}
                required
              >
                <option value="">Select a learning object…</option>
                <option value="NEW">+ Add new LO</option>
                {learningObjects.map((lo) => (
                  <option key={lo.id} value={lo.id}>
                    {lo.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Inline new LO form */}
            {selectedLoId === "NEW" && (
              <div className="space-y-3 rounded-md border border-indigo-700/50 bg-indigo-950/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-indigo-300">
                  New Learning Object
                </p>

                <div>
                  <label className={labelCls}>Title *</label>
                  <Input
                    placeholder="e.g. Introduction to Recursion"
                    value={newLoTitle}
                    onChange={(e) => setNewLoTitle(e.target.value)}
                    className="bg-slate-800 border-slate-700"
                  />
                  {newLoTitle && (
                    <p className="mt-1 text-xs text-slate-500">
                      Slug: {generateSlug(newLoTitle)}
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Description (optional)</label>
                  <textarea
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[60px] resize-y"
                    placeholder="Brief description of this LO…"
                    value={newLoDescription}
                    onChange={(e) => setNewLoDescription(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Difficulty (1–5)</label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      placeholder="e.g. 2"
                      value={newLoDifficulty}
                      onChange={(e) => setNewLoDifficulty(e.target.value)}
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Est. Time (minutes)</label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="e.g. 30"
                      value={newLoTime}
                      onChange={(e) => setNewLoTime(e.target.value)}
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Prerequisites ── */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-slate-100">Prerequisites</h2>
            <p className="text-xs text-slate-500">
              LOs the student should complete before this one — creates an incoming edge
              (prerequisite → this LO)
            </p>
            {edgeLOs.length === 0 ? (
              <p className="text-sm text-slate-500">No other LOs available</p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border border-slate-700 bg-slate-800/50 p-3">
                {edgeLOs.map((lo) => (
                  <label
                    key={lo.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-700/40"
                  >
                    <input
                      type="checkbox"
                      className="accent-indigo-500"
                      checked={prerequisites.includes(lo.id)}
                      onChange={() =>
                        toggleCheck(lo.id, prerequisites, setPrerequisites)
                      }
                    />
                    <span className="text-sm text-slate-200">{lo.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ── Post-requisites ── */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-slate-100">Post-requisites</h2>
            <p className="text-xs text-slate-500">
              LOs that should come after this one — creates an outgoing edge
              (this LO → post-requisite)
            </p>
            {edgeLOs.length === 0 ? (
              <p className="text-sm text-slate-500">No other LOs available</p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border border-slate-700 bg-slate-800/50 p-3">
                {edgeLOs.map((lo) => (
                  <label
                    key={lo.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-700/40"
                  >
                    <input
                      type="checkbox"
                      className="accent-indigo-500"
                      checked={postrequisites.includes(lo.id)}
                      onChange={() =>
                        toggleCheck(lo.id, postrequisites, setPostrequisites)
                      }
                    />
                    <span className="text-sm text-slate-200">{lo.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ── Content ── */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-slate-100">Content</h2>

            {contentItems.map((item, index) => (
              <div
                key={index}
                className="space-y-3 rounded-md border border-slate-700/60 bg-slate-800/30 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-300">
                    Content item {index + 1}
                  </p>
                  {contentItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setContentItems((prev) =>
                          prev.filter((_, i) => i !== index)
                        )
                      }
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Type *</label>
                  <select
                    className={selectCls}
                    value={item.deliveryTypeId}
                    onChange={(e) =>
                      updateContentItem(index, "deliveryTypeId", e.target.value)
                    }
                  >
                    <option value="">Select type…</option>
                    {deliveryTypes.map((dt) => (
                      <option key={dt.id} value={dt.id}>
                        {dt.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Title</label>
                  <Input
                    placeholder={
                      item.deliveryTypeCode === "VIDEO"
                        ? "e.g. Lecture Video"
                        : item.deliveryTypeCode === "READING_PDF"
                        ? "e.g. Reference Material"
                        : "Content title…"
                    }
                    value={item.title}
                    onChange={(e) =>
                      updateContentItem(index, "title", e.target.value)
                    }
                    className="bg-slate-800 border-slate-700"
                  />
                </div>

                {item.deliveryTypeCode === "VIDEO" && (
                  <div>
                    <label className={labelCls}>YouTube URL *</label>
                    <Input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=…"
                      value={item.url}
                      onChange={(e) =>
                        updateContentItem(index, "url", e.target.value)
                      }
                      className="bg-slate-800 border-slate-700"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Supports youtube.com/watch, youtu.be, and /shorts links
                    </p>
                  </div>
                )}

                {item.deliveryTypeCode === "READING_PDF" && (
                  <div>
                    <label className={labelCls}>PDF URL *</label>
                    <Input
                      type="url"
                      placeholder="https://…/document.pdf"
                      value={item.url}
                      onChange={(e) =>
                        updateContentItem(index, "url", e.target.value)
                      }
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setContentItems((prev) => [
                  ...prev,
                  { deliveryTypeId: "", deliveryTypeCode: "", title: "", url: "" },
                ])
              }
              className="w-full border border-dashed border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300"
            >
              + Add another content item
            </Button>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="rounded-md border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              {submitting ? "Creating…" : "Create Submission"}
            </Button>
            <Button asChild variant="ghost">
              <Link href="/teacher">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
