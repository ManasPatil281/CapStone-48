"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/hooks";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Course = { id: string; title: string };
type LO = { id: string; title: string; slug: string };
type DeliveryType = { id: string; code: string; name: string };

type FlashcardPair = {
  front: string;
  back: string;
};

type QuizQuestionDraft = {
  questionText: string;
  options: [string, string, string, string];
  correctOptionIndex: number | null;
};

type ContentItem = {
  deliveryTypeId: string;
  deliveryTypeCode: string;
  title: string;
  text: string;
  imageUrl: string;
  caption: string;
  problem: string;
  solution: string;
  explanation: string;
  questionsText: string;
  language: string;
  starterCode: string;
  rawJson: string;
  flashcards: FlashcardPair[];
  quizQuestions: QuizQuestionDraft[];
};

const EMPTY_QUIZ_QUESTION: QuizQuestionDraft = {
  questionText: "",
  options: ["", "", "", ""],
  correctOptionIndex: null,
};

const EMPTY_CONTENT_ITEM: ContentItem = {
  deliveryTypeId: "",
  deliveryTypeCode: "",
  title: "",
  text: "",
  imageUrl: "",
  caption: "",
  problem: "",
  solution: "",
  explanation: "",
  questionsText: "",
  language: "javascript",
  starterCode: "",
  rawJson: "",
  flashcards: [{ front: "", back: "" }],
  quizQuestions: [{ ...EMPTY_QUIZ_QUESTION }],
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
    { ...EMPTY_CONTENT_ITEM },
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
          .order("name"),
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
          ...EMPTY_CONTENT_ITEM,
          title: next[index].title,
          deliveryTypeId: value,
          deliveryTypeCode: dt?.code ?? "",
        };
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  }

  function updateFlashcard(index: number, cardIndex: number, field: keyof FlashcardPair, value: string) {
    setContentItems((prev) => {
      const next = [...prev];
      const cards = [...next[index].flashcards];
      cards[cardIndex] = { ...cards[cardIndex], [field]: value };
      next[index] = { ...next[index], flashcards: cards };
      return next;
    });
  }

  function addFlashcard(index: number) {
    setContentItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        flashcards: [...next[index].flashcards, { front: "", back: "" }],
      };
      return next;
    });
  }

  function removeFlashcard(index: number, cardIndex: number) {
    setContentItems((prev) => {
      const next = [...prev];
      const cards = next[index].flashcards.filter((_, idx) => idx !== cardIndex);
      next[index] = {
        ...next[index],
        flashcards: cards.length > 0 ? cards : [{ front: "", back: "" }],
      };
      return next;
    });
  }

  function updateQuizQuestion(index: number, questionIndex: number, value: string) {
    setContentItems((prev) => {
      const next = [...prev];
      const questions = [...next[index].quizQuestions];
      questions[questionIndex] = { ...questions[questionIndex], questionText: value };
      next[index] = { ...next[index], quizQuestions: questions };
      return next;
    });
  }

  function updateQuizOption(index: number, questionIndex: number, optionIndex: number, value: string) {
    setContentItems((prev) => {
      const next = [...prev];
      const questions = [...next[index].quizQuestions];
      const options = [...questions[questionIndex].options] as [string, string, string, string];
      options[optionIndex] = value;
      questions[questionIndex] = { ...questions[questionIndex], options };
      next[index] = { ...next[index], quizQuestions: questions };
      return next;
    });
  }

  function setQuizCorrectOption(index: number, questionIndex: number, optionIndex: number) {
    setContentItems((prev) => {
      const next = [...prev];
      const questions = [...next[index].quizQuestions];
      questions[questionIndex] = { ...questions[questionIndex], correctOptionIndex: optionIndex };
      next[index] = { ...next[index], quizQuestions: questions };
      return next;
    });
  }

  function addQuizQuestion(index: number) {
    setContentItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        quizQuestions: [...next[index].quizQuestions, { ...EMPTY_QUIZ_QUESTION }],
      };
      return next;
    });
  }

  function removeQuizQuestion(index: number, questionIndex: number) {
    setContentItems((prev) => {
      const next = [...prev];
      const questions = next[index].quizQuestions.filter((_, idx) => idx !== questionIndex);
      next[index] = {
        ...next[index],
        quizQuestions: questions.length > 0 ? questions : [{ ...EMPTY_QUIZ_QUESTION }],
      };
      return next;
    });
  }

  function buildContentJson(item: ContentItem) {
    const code = item.deliveryTypeCode;
    const parsedQuestions = item.questionsText
      .split(/\r?\n/)
      .map((q) => q.trim())
      .filter(Boolean);

    switch (code) {
      case "CONCEPT_NOTES":
        return { content_json: { markdown: item.text }, defaultTitle: "Concept Notes" };
      case "FLOWCHART":
        return { content_json: { image_url: item.imageUrl, caption: item.caption || undefined }, defaultTitle: "Flowchart" };
      case "VISUAL_EXPLANATION":
        return {
          content_json: { image_url: item.imageUrl, caption: item.caption || undefined, text: item.text || undefined },
          defaultTitle: "Visual Explanation",
        };
      case "WORKED_EXAMPLE":
        return {
          content_json: { problem: item.problem, solution: item.solution, explanation: item.explanation },
          defaultTitle: "Worked Example",
        };
      case "PRACTICE_SET":
        return { content_json: { questions: parsedQuestions }, defaultTitle: "Practice Set" };
      case "FLASHCARDS":
      case "FLASHCARD": {
        const cards = item.flashcards
          .map((card) => ({ front: card.front.trim(), back: card.back.trim() }))
          .filter((card) => card.front || card.back);
        return { content_json: { cards }, defaultTitle: "Flashcards" };
      }
      case "REVISION_SHEET":
        return { content_json: { summary: item.text }, defaultTitle: "Revision Sheet" };
      case "VIDEO":
        return { content_json: { url: item.imageUrl }, defaultTitle: "Video" };
      case "READING_PDF":
        return { content_json: { pdf_url: item.imageUrl }, defaultTitle: "PDF" };
      case "READING_NOTES":
        return { content_json: { markdown: item.text }, defaultTitle: "Reading Notes" };
      case "PLAYGROUND":
        return {
          content_json: {
            language: item.language || "javascript",
            starter_code: item.starterCode,
            practices: parsedQuestions.map((question, idx) => ({
              id: `${idx + 1}`,
              title: `Practice ${idx + 1}`,
              description: question,
            })),
          },
          defaultTitle: "Playground",
        };
      default:
        if (!item.rawJson.trim()) return null;
        try {
          return { content_json: JSON.parse(item.rawJson), defaultTitle: item.deliveryTypeCode || "Content" };
        } catch {
          throw new Error(`Invalid JSON for content type ${item.deliveryTypeCode || "unknown"}`);
        }
    }
  }

  function validateQuizContent(items: ContentItem[]) {
    const quizItems = items.filter((item) => item.deliveryTypeCode === "QUIZ");

    if (quizItems.length === 0) {
      return null;
    }

    if (quizItems.length > 1) {
      throw new Error("Please keep only one QUIZ content block per submission.");
    }

    const quizItem = quizItems[0];
    const questions = quizItem.quizQuestions.filter((question) => question.questionText.trim() || question.options.some((option) => option.trim()));

    if (questions.length === 0) {
      throw new Error("QUIZ requires at least one question.");
    }

    questions.forEach((question, questionIndex) => {
      if (!question.questionText.trim()) {
        throw new Error(`Quiz question ${questionIndex + 1} is missing question text.`);
      }
      if (question.options.length !== 4) {
        throw new Error(`Quiz question ${questionIndex + 1} must have exactly 4 options.`);
      }
      if (question.options.some((option) => !option.trim())) {
        throw new Error(`Quiz question ${questionIndex + 1} has empty options. Fill all 4 options.`);
      }
      if (question.correctOptionIndex === null || question.correctOptionIndex < 0 || question.correctOptionIndex > 3) {
        throw new Error(`Quiz question ${questionIndex + 1} must have one correct option selected.`);
      }
    });

    return {
      item: quizItem,
      questions,
    };
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

      // 3. Create content rows for non-quiz types
      const quizPayload = validateQuizContent(contentItems);

      const nonQuizItems = contentItems.filter(
        (item) => item.deliveryTypeId && item.deliveryTypeCode !== "QUIZ"
      );

      let sequenceOrder = 1;
      for (const item of nonQuizItems) {
        const built = buildContentJson(item);
        if (!built) {
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: contentErr } = await (supabase as any)
          .from("teacher_lo_submission_content")
          .insert({
            submission_id: submissionId,
            delivery_type_id: item.deliveryTypeId,
            title: item.title.trim() || built.defaultTitle,
            content_json: built.content_json,
            sequence_order: sequenceOrder,
            is_active: true,
          });

        if (contentErr) throw contentErr;
        sequenceOrder += 1;
      }

      // 4. Create quiz assessment rows (if QUIZ block is present)
      if (quizPayload) {
        const assessmentTitle = `${(submissionTitle || loTitle || "Submission").trim()} Quiz`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: assessmentRow, error: assessmentErr } = await (supabase as any)
          .from("teacher_lo_submission_assessment")
          .insert({
            submission_id: submissionId,
            title: assessmentTitle,
            pass_percentage: 70,
            max_attempts: 3,
          })
          .select("id")
          .single();

        if (assessmentErr) throw assessmentErr;

        for (const question of quizPayload.questions) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: questionRow, error: questionErr } = await (supabase as any)
            .from("teacher_lo_submission_question")
            .insert({
              assessment_id: assessmentRow.id,
              question_type: "MCQ",
              question_text: question.questionText.trim(),
              metadata_json: {},
              marks: 1,
            })
            .select("id")
            .single();

          if (questionErr) throw questionErr;

          const optionRows = question.options.map((optionText, optionIndex) => ({
            question_id: questionRow.id,
            option_text: optionText.trim(),
            is_correct: question.correctOptionIndex === optionIndex,
          }));

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: optionErr } = await (supabase as any)
            .from("teacher_lo_submission_question_option")
            .insert(optionRows);

          if (optionErr) throw optionErr;
        }
      }

      // 5. Create prerequisite edges: prereq_lo → current_lo
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

      // 6. Create post-requisite edges: current_lo → postreq_lo
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
      console.error("[NewSubmission] failed to create submission:", err);
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading / success states ─────────────────────────────────────────────

  if (userLoading || dataLoading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-8">
        <div className="mx-auto flex max-w-3xl items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
        <Card className="w-full max-w-sm space-y-4 p-8 text-center">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
            </div>
          </div>
          <CardTitle className="text-emerald-400">Submission Created</CardTitle>
          <p className="text-sm text-slate-400">
            Saved as a draft. Redirecting to your dashboard…
          </p>
        </Card>
      </main>
    );
  }

  // ─── Shared style tokens ──────────────────────────────────────────────────

  const selectCls =
    "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";
  const labelCls = "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5";
  const sectionCls =
    "space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6";

  // LOs available for edge selection — exclude the currently selected LO
  const edgeLOs = learningObjects.filter((lo) => lo.id !== selectedLoId);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Page header */}
        <div className="space-y-3">
          <Link
            href="/teacher"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Teacher Dashboard
          </Link>
          <div className="border-b border-slate-800 pb-5">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Create New Submission</h1>
            <p className="mt-1 text-sm text-slate-500">
              Submit content for a learning object — saved as approved for students
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Submission Details ── */}
          <div className={sectionCls}>
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <div className="h-4 w-0.5 rounded-full bg-brand" />
              <h2 className="text-sm font-semibold text-slate-200">Submission Details</h2>
            </div>

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
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[80px] resize-y"
                placeholder="Any notes about this submission…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* ── Learning Object ── */}
          <div className={sectionCls}>
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <div className="h-4 w-0.5 rounded-full bg-brand" />
              <h2 className="text-sm font-semibold text-slate-200">Learning Object</h2>
            </div>

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
              <div className="space-y-3 rounded-xl border border-brand/30 bg-brand/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">
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
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[60px] resize-y"
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
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <div className="h-4 w-0.5 rounded-full bg-brand" />
              <h2 className="text-sm font-semibold text-slate-200">Prerequisites</h2>
            </div>
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
                      className="accent-brand"
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
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <div className="h-4 w-0.5 rounded-full bg-brand" />
              <h2 className="text-sm font-semibold text-slate-200">Post-requisites</h2>
            </div>
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
                      className="accent-brand"
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
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <div className="h-4 w-0.5 rounded-full bg-brand" />
              <h2 className="text-sm font-semibold text-slate-200">Content</h2>
            </div>

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
                      item.deliveryTypeCode === "QUIZ"
                        ? "e.g. Unit Quiz"
                        : "Content title…"
                    }
                    value={item.title}
                    onChange={(e) =>
                      updateContentItem(index, "title", e.target.value)
                    }
                    className="bg-slate-800 border-slate-700"
                  />
                </div>

                {(item.deliveryTypeCode === "CONCEPT_NOTES" || item.deliveryTypeCode === "READING_NOTES" || item.deliveryTypeCode === "REVISION_SHEET") && (
                  <div>
                    <label className={labelCls}>
                      {item.deliveryTypeCode === "REVISION_SHEET" ? "Summary" : "Text"}
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[160px] resize-y"
                      placeholder="Write content here..."
                      value={item.text}
                      onChange={(e) => updateContentItem(index, "text", e.target.value)}
                    />
                  </div>
                )}

                {(item.deliveryTypeCode === "FLOWCHART" || item.deliveryTypeCode === "VISUAL_EXPLANATION") && (
                  <>
                    <div>
                      <label className={labelCls}>Image URL</label>
                      <Input
                        type="url"
                        placeholder="https://..."
                        value={item.imageUrl}
                        onChange={(e) => updateContentItem(index, "imageUrl", e.target.value)}
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Caption (optional)</label>
                      <Input
                        placeholder="Optional caption"
                        value={item.caption}
                        onChange={(e) => updateContentItem(index, "caption", e.target.value)}
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                    {item.deliveryTypeCode === "VISUAL_EXPLANATION" && (
                      <div>
                        <label className={labelCls}>Explanation text (optional)</label>
                        <textarea
                          className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[120px] resize-y"
                          placeholder="Describe the visual"
                          value={item.text}
                          onChange={(e) => updateContentItem(index, "text", e.target.value)}
                        />
                      </div>
                    )}
                  </>
                )}

                {item.deliveryTypeCode === "WORKED_EXAMPLE" && (
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>Problem</label>
                      <textarea
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[90px] resize-y"
                        value={item.problem}
                        onChange={(e) => updateContentItem(index, "problem", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Solution</label>
                      <textarea
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[90px] resize-y"
                        value={item.solution}
                        onChange={(e) => updateContentItem(index, "solution", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Explanation</label>
                      <textarea
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[90px] resize-y"
                        value={item.explanation}
                        onChange={(e) => updateContentItem(index, "explanation", e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {(item.deliveryTypeCode === "PRACTICE_SET" || item.deliveryTypeCode === "PLAYGROUND") && (
                  <div>
                    <label className={labelCls}>Questions (one per line)</label>
                    <textarea
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[140px] resize-y"
                      placeholder="Question 1&#10;Question 2&#10;Question 3"
                      value={item.questionsText}
                      onChange={(e) => updateContentItem(index, "questionsText", e.target.value)}
                    />
                  </div>
                )}

                {item.deliveryTypeCode === "PLAYGROUND" && (
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>Language</label>
                      <Input
                        placeholder="javascript"
                        value={item.language}
                        onChange={(e) => updateContentItem(index, "language", e.target.value)}
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Starter Code</label>
                      <textarea
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[160px] resize-y font-mono"
                        value={item.starterCode}
                        onChange={(e) => updateContentItem(index, "starterCode", e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {(item.deliveryTypeCode === "FLASHCARDS" || item.deliveryTypeCode === "FLASHCARD") && (
                  <div className="space-y-3">
                    <label className={labelCls}>Flashcard Pairs</label>
                    {item.flashcards.map((card, cardIndex) => (
                      <div key={cardIndex} className="rounded-md border border-slate-700 bg-slate-900/40 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-400">Card {cardIndex + 1}</p>
                          {item.flashcards.length > 1 && (
                            <button
                              type="button"
                              className="text-xs text-red-400 hover:text-red-300"
                              onClick={() => removeFlashcard(index, cardIndex)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <Input
                          placeholder="Question / Front"
                          value={card.front}
                          onChange={(e) => updateFlashcard(index, cardIndex, "front", e.target.value)}
                          className="bg-slate-800 border-slate-700"
                        />
                        <Input
                          placeholder="Answer / Back"
                          value={card.back}
                          onChange={(e) => updateFlashcard(index, cardIndex, "back", e.target.value)}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                    ))}
                    <Button type="button" variant="ghost" onClick={() => addFlashcard(index)}>
                      + Add flashcard
                    </Button>
                  </div>
                )}

                {item.deliveryTypeCode === "QUIZ" && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400">MCQ Builder (4 options per question)</p>
                    {item.quizQuestions.map((question, questionIndex) => (
                      <div key={questionIndex} className="rounded-md border border-slate-700 bg-slate-900/40 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-300">Question {questionIndex + 1}</p>
                          {item.quizQuestions.length > 1 && (
                            <button
                              type="button"
                              className="text-xs text-red-400 hover:text-red-300"
                              onClick={() => removeQuizQuestion(index, questionIndex)}
                            >
                              Delete question
                            </button>
                          )}
                        </div>
                        <textarea
                          className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[80px] resize-y"
                          placeholder="Question text"
                          value={question.questionText}
                          onChange={(e) => updateQuizQuestion(index, questionIndex, e.target.value)}
                        />

                        {question.options.map((option, optionIndex) => (
                          <label key={optionIndex} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`quiz-correct-${index}-${questionIndex}`}
                              checked={question.correctOptionIndex === optionIndex}
                              onChange={() => setQuizCorrectOption(index, questionIndex, optionIndex)}
                              className="accent-brand"
                            />
                            <Input
                              placeholder={`Option ${optionIndex + 1}`}
                              value={option}
                              onChange={(e) => updateQuizOption(index, questionIndex, optionIndex, e.target.value)}
                              className="bg-slate-800 border-slate-700"
                            />
                          </label>
                        ))}
                      </div>
                    ))}
                    <Button type="button" variant="ghost" onClick={() => addQuizQuestion(index)}>
                      + Add question
                    </Button>
                  </div>
                )}

                {item.deliveryTypeCode === "VIDEO" && (
                  <div>
                    <label className={labelCls}>YouTube URL</label>
                    <Input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={item.imageUrl}
                      onChange={(e) =>
                        updateContentItem(index, "imageUrl", e.target.value)
                      }
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                )}

                {item.deliveryTypeCode === "READING_PDF" && (
                  <div>
                    <label className={labelCls}>PDF URL</label>
                    <Input
                      type="url"
                      placeholder="https://.../document.pdf"
                      value={item.imageUrl}
                      onChange={(e) =>
                        updateContentItem(index, "imageUrl", e.target.value)
                      }
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                )}

                {item.deliveryTypeCode &&
                  ![
                    "CONCEPT_NOTES",
                    "READING_NOTES",
                    "REVISION_SHEET",
                    "FLOWCHART",
                    "VISUAL_EXPLANATION",
                    "WORKED_EXAMPLE",
                    "PRACTICE_SET",
                    "PLAYGROUND",
                    "FLASHCARDS",
                    "FLASHCARD",
                    "QUIZ",
                    "VIDEO",
                    "READING_PDF",
                  ].includes(item.deliveryTypeCode) && (
                    <div>
                      <label className={labelCls}>Raw JSON (fallback)</label>
                      <textarea
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[120px] resize-y font-mono"
                        placeholder='{"key":"value"}'
                        value={item.rawJson}
                        onChange={(e) => updateContentItem(index, "rawJson", e.target.value)}
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
                  { ...EMPTY_CONTENT_ITEM },
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
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </span>
              ) : (
                "Create Submission"
              )}
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
