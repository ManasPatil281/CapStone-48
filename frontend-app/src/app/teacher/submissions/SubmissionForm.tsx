"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/auth/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";

export type Course = { id: string; title: string };
export type LO = { id: string; title: string; slug: string };
export type DeliveryType = { id: string; code: string; name: string };

export type FlashcardPair = {
  front: string;
  back: string;
};

export type QuizQuestionDraft = {
  questionText: string;
  options: [string, string, string, string];
  correctOptionIndex: number | null;
};

export type ContentItem = {
  deliveryTypeId: string;
  deliveryTypeCode: string;
  title: string;
  recommendedTimeSeconds: string;
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
  quizRandomizationMode: string;
  quizSamplePercentage: string;
};

export type SubmissionFormInitialData = {
  submissionId?: string;
  courseId: string;
  selectedLoId: string;
  submissionTitle: string;
  notes: string;
  prerequisites: string[];
  postrequisites: string[];
  contentItems: ContentItem[];
};

export type SubmissionFormMode = "create" | "edit";

type SubmissionFormProps = {
  mode: SubmissionFormMode;
  initialData?: SubmissionFormInitialData;
  successRedirect: string;
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
  recommendedTimeSeconds: "",
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
  quizRandomizationMode: "0",
  quizSamplePercentage: "",
};

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeInitialContentItems(items: ContentItem[] | undefined): ContentItem[] {
  if (!items || items.length === 0) {
    return [{ ...EMPTY_CONTENT_ITEM }];
  }

  return items.map((item) => ({
    ...EMPTY_CONTENT_ITEM,
    ...item,
    flashcards:
      item.flashcards && item.flashcards.length > 0
        ? item.flashcards
        : [{ front: "", back: "" }],
    quizQuestions:
      item.quizQuestions && item.quizQuestions.length > 0
        ? item.quizQuestions
        : [{ ...EMPTY_QUIZ_QUESTION }],
  }));
}

function parsePositiveIntegerOrNull(raw: string, label: string): number | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a positive integer.`);
  }

  const value = Number(trimmed);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

export function SubmissionForm({ mode, initialData, successRedirect }: SubmissionFormProps) {
  const router = useRouter();
  const { user, isLoading: userLoading, authError, retry, clearLocalState } = useUser();

  const [courses, setCourses] = useState<Course[]>([]);
  const [learningObjects, setLearningObjects] = useState<LO[]>([]);
  const [deliveryTypes, setDeliveryTypes] = useState<DeliveryType[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [courseId, setCourseId] = useState(initialData?.courseId ?? "");
  const [selectedLoId, setSelectedLoId] = useState(initialData?.selectedLoId ?? "");
  const [submissionTitle, setSubmissionTitle] = useState(initialData?.submissionTitle ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  const [newLoTitle, setNewLoTitle] = useState("");
  const [newLoDescription, setNewLoDescription] = useState("");
  const [newLoDifficulty, setNewLoDifficulty] = useState("");
  const [newLoTime, setNewLoTime] = useState("");

  const [prerequisites, setPrerequisites] = useState<string[]>(initialData?.prerequisites ?? []);
  const [postrequisites, setPostrequisites] = useState<string[]>(initialData?.postrequisites ?? []);
  const [contentItems, setContentItems] = useState<ContentItem[]>(
    normalizeInitialContentItems(initialData?.contentItems)
  );

  const isEditMode = mode === "edit";
  const submissionId = initialData?.submissionId ?? "";

  useEffect(() => {
    async function load() {
      setDataLoading(true);
      const supabase = createSupabaseBrowserClient();

      try {
        const [coursesRes, losRes, dtRes] = await Promise.all([
          supabase.from("course").select("id, title").order("title"),
          supabase
            .from("learning_object")
            .select("id, title, slug")
            .eq("status", "published")
            .order("title"),
          supabase.from("delivery_type").select("id, code, name").order("name"),
        ]);

        if (coursesRes.error) throw coursesRes.error;
        if (losRes.error) throw losRes.error;
        if (dtRes.error) throw dtRes.error;

        const loadedLOs: LO[] = (losRes.data ?? []) as LO[];

        if (
          selectedLoId &&
          selectedLoId !== "NEW" &&
          !loadedLOs.some((lo) => lo.id === selectedLoId)
        ) {
          const { data: selectedLo, error: selectedLoErr } = await supabase
            .from("learning_object")
            .select("id, title, slug")
            .eq("id", selectedLoId)
            .maybeSingle();

          if (selectedLoErr) {
            console.error("[SubmissionForm] Failed to load selected LO:", selectedLoErr);
          }

          if (selectedLo) {
            loadedLOs.push(selectedLo);
          }
        }

        setCourses(coursesRes.data ?? []);
        setLearningObjects(loadedLOs);
        setDeliveryTypes(dtRes.data ?? []);
      } catch (loadErr: unknown) {
        console.error("[SubmissionForm] Failed to load form data:", loadErr);
        const msg =
          loadErr instanceof Error
            ? loadErr.message
            : "Failed to load form data. Please refresh and try again.";
        setError(msg);
      } finally {
        setDataLoading(false);
      }
    }

    load();
  }, [selectedLoId]);

  function toggleCheck(id: string, current: string[], setter: (v: string[]) => void) {
    setter(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  function updateContentItem(index: number, field: keyof ContentItem, value: string) {
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

  function updateFlashcard(
    index: number,
    cardIndex: number,
    field: keyof FlashcardPair,
    value: string
  ) {
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

  function updateQuizOption(
    index: number,
    questionIndex: number,
    optionIndex: number,
    value: string
  ) {
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
      questions[questionIndex] = {
        ...questions[questionIndex],
        correctOptionIndex: optionIndex,
      };
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
        return {
          content_json: { image_url: item.imageUrl, caption: item.caption || undefined },
          defaultTitle: "Flowchart",
        };
      case "VISUAL_EXPLANATION":
        return {
          content_json: {
            image_url: item.imageUrl,
            caption: item.caption || undefined,
            text: item.text || undefined,
          },
          defaultTitle: "Visual Explanation",
        };
      case "WORKED_EXAMPLE":
        return {
          content_json: {
            problem: item.problem,
            solution: item.solution,
            explanation: item.explanation,
          },
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
          return {
            content_json: JSON.parse(item.rawJson),
            defaultTitle: item.deliveryTypeCode || "Content",
          };
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
    const questions = quizItem.quizQuestions.filter(
      (question) =>
        question.questionText.trim() ||
        question.options.some((option) => option.trim())
    );

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
        throw new Error(
          `Quiz question ${questionIndex + 1} has empty options. Fill all 4 options.`
        );
      }
      if (
        question.correctOptionIndex === null ||
        question.correctOptionIndex < 0 ||
        question.correctOptionIndex > 3
      ) {
        throw new Error(
          `Quiz question ${questionIndex + 1} must have one correct option selected.`
        );
      }
    });

    const randomizationModeRaw = quizItem.quizRandomizationMode.trim() || "0";

    if (!/^\d+$/.test(randomizationModeRaw)) {
      throw new Error("Randomisation mode must be 0, 1, or 2.");
    }

    const randomizationMode = Number(randomizationModeRaw);

    if (![0, 1, 2].includes(randomizationMode)) {
      throw new Error("Randomisation mode must be 0, 1, or 2.");
    }

    let samplePercentage: number | null = null;

    if (randomizationMode === 2) {
      const trimmedSample = quizItem.quizSamplePercentage.trim();

      if (!trimmedSample) {
        throw new Error("Percentage of questions asked is required for Sample and shuffle.");
      }

      if (!/^\d+$/.test(trimmedSample)) {
        throw new Error("Percentage of questions asked must be an integer between 1 and 99.");
      }

      const parsedSample = Number(trimmedSample);

      if (!Number.isInteger(parsedSample) || parsedSample <= 0) {
        throw new Error("Percentage of questions asked must be between 1 and 99.");
      }

      if (parsedSample >= 100) {
        throw new Error(
          "If you want to show all questions in random order, select Shuffle all questions instead."
        );
      }

      samplePercentage = parsedSample;
    }

    return { item: quizItem, questions, randomizationMode, samplePercentage };
  }

  async function ensureCourseLearningObjectMapping(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    selectedCourseId: string,
    selectedLearningObjectId: string
  ) {
    const { data: existingMapping, error: existingMappingErr } = await supabase
      .from("course_learning_object")
      .select("id")
      .eq("course_id", selectedCourseId)
      .eq("learning_object_id", selectedLearningObjectId)
      .maybeSingle();

    if (existingMappingErr) {
      throw existingMappingErr;
    }

    if (!existingMapping) {
      const { error: mappingInsertErr } = await supabase
        .from("course_learning_object")
        .insert({
          course_id: selectedCourseId,
          learning_object_id: selectedLearningObjectId,
        });

      if (mappingInsertErr) {
        throw mappingInsertErr;
      }
    }
  }

  async function replaceSubmissionDependents(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    targetSubmissionId: string
  ) {
    const { data: assessmentRows, error: assessmentFetchErr } = await supabase
      .from("teacher_lo_submission_assessment")
      .select("id")
      .eq("submission_id", targetSubmissionId);

    if (assessmentFetchErr) {
      throw assessmentFetchErr;
    }

    const assessmentIds = (assessmentRows ?? []).map((row: { id: string }) => row.id);

    let questionIds: string[] = [];

    if (assessmentIds.length > 0) {
      const { data: questionRows, error: questionFetchErr } = await supabase
        .from("teacher_lo_submission_question")
        .select("id")
        .in("assessment_id", assessmentIds);

      if (questionFetchErr) {
        throw questionFetchErr;
      }

      questionIds = (questionRows ?? []).map((row: { id: string }) => row.id);
    }

    if (questionIds.length > 0) {
      const { error: optionDeleteErr } = await supabase
        .from("teacher_lo_submission_question_option")
        .delete()
        .in("question_id", questionIds);

      if (optionDeleteErr) {
        throw optionDeleteErr;
      }
    }

    if (assessmentIds.length > 0) {
      const { error: questionDeleteErr } = await supabase
        .from("teacher_lo_submission_question")
        .delete()
        .in("assessment_id", assessmentIds);

      if (questionDeleteErr) {
        throw questionDeleteErr;
      }
    }

    const { error: assessmentDeleteErr } = await supabase
      .from("teacher_lo_submission_assessment")
      .delete()
      .eq("submission_id", targetSubmissionId);

    if (assessmentDeleteErr) {
      throw assessmentDeleteErr;
    }

    const { error: contentDeleteErr } = await supabase
      .from("teacher_lo_submission_content")
      .delete()
      .eq("submission_id", targetSubmissionId);

    if (contentDeleteErr) {
      throw contentDeleteErr;
    }

    const { error: edgeDeleteErr } = await supabase
      .from("teacher_lo_submission_edge")
      .delete()
      .eq("submission_id", targetSubmissionId);

    if (edgeDeleteErr) {
      throw edgeDeleteErr;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!user) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();

    try {
      let loId = selectedLoId;
      let resolvedSubmissionTitle = submissionTitle.trim();

      if (selectedLoId === "NEW") {
        const trimmedTitle = newLoTitle.trim();

        if (!trimmedTitle) {
          throw new Error("New LO title is required");
        }

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

        if (loErr) {
          throw loErr;
        }

        loId = newLo.id;

        if (!resolvedSubmissionTitle) {
          resolvedSubmissionTitle = trimmedTitle;
        }

        setLearningObjects((prev) => [...prev, { id: loId, title: trimmedTitle, slug }]);
      } else {
        const existingLo = learningObjects.find((item) => item.id === selectedLoId);
        if (!resolvedSubmissionTitle && existingLo) {
          resolvedSubmissionTitle = existingLo.title;
        }
      }

      if (!loId || !courseId) {
        throw new Error("Course and Learning Object are required");
      }

      await ensureCourseLearningObjectMapping(supabase, courseId, loId);

      let activeSubmissionId = submissionId;

      if (isEditMode) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updatedSubmission, error: updateErr } = await (supabase as any)
          .from("teacher_lo_submission")
          .update({
            course_id: courseId,
            learning_object_id: loId,
            title: resolvedSubmissionTitle || "Untitled",
            notes: notes.trim() || null,
            status: "approved",
          })
          .eq("id", submissionId)
          .eq("teacher_id", user.id)
          .select("id")
          .maybeSingle();

        if (updateErr) {
          throw updateErr;
        }

        if (!updatedSubmission) {
          throw new Error("Submission not found or you do not have access to edit it.");
        }

        activeSubmissionId = updatedSubmission.id;
        await replaceSubmissionDependents(supabase, activeSubmissionId);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: createdSubmission, error: submissionErr } = await (supabase as any)
          .from("teacher_lo_submission")
          .insert({
            teacher_id: user.id,
            course_id: courseId,
            learning_object_id: loId,
            title: resolvedSubmissionTitle || "Untitled",
            notes: notes.trim() || null,
            status: "approved",
          })
          .select("id")
          .single();

        if (submissionErr) {
          throw submissionErr;
        }

        activeSubmissionId = createdSubmission.id;
      }

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

        const recommendedTimeSeconds = parsePositiveIntegerOrNull(
          item.recommendedTimeSeconds,
          "Recommended time"
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: contentErr } = await (supabase as any)
          .from("teacher_lo_submission_content")
          .insert({
            submission_id: activeSubmissionId,
            delivery_type_id: item.deliveryTypeId,
            title: item.title.trim() || built.defaultTitle,
            content_json: built.content_json,
            sequence_order: sequenceOrder,
            is_active: true,
            recommended_time_seconds: recommendedTimeSeconds,
          });

        if (contentErr) {
          throw contentErr;
        }

        sequenceOrder += 1;
      }

      if (quizPayload) {
        const assessmentTitle = `${
          (resolvedSubmissionTitle || "Submission").trim() || "Submission"
        } Quiz`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: assessmentRow, error: assessmentErr } = await (supabase as any)
          .from("teacher_lo_submission_assessment")
          .insert({
            submission_id: activeSubmissionId,
            title: assessmentTitle,
            pass_percentage: 70,
            max_attempts: 3,
            randomization_mode: quizPayload.randomizationMode,
            sample_percentage: quizPayload.samplePercentage,
          })
          .select("id")
          .single();

        if (assessmentErr) {
          throw assessmentErr;
        }

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

          if (questionErr) {
            throw questionErr;
          }

          const optionRows = question.options.map((optionText, optionIndex) => ({
            question_id: questionRow.id,
            option_text: optionText.trim(),
            is_correct: question.correctOptionIndex === optionIndex,
          }));

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: optionErr } = await (supabase as any)
            .from("teacher_lo_submission_question_option")
            .insert(optionRows);

          if (optionErr) {
            throw optionErr;
          }
        }
      }

      for (const prereqId of prerequisites) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: edgeErr } = await (supabase as any)
          .from("teacher_lo_submission_edge")
          .insert({
            submission_id: activeSubmissionId,
            source_lo_id: prereqId,
            target_lo_id: loId,
          });

        if (edgeErr) {
          throw edgeErr;
        }
      }

      for (const postreqId of postrequisites) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: edgeErr } = await (supabase as any)
          .from("teacher_lo_submission_edge")
          .insert({
            submission_id: activeSubmissionId,
            source_lo_id: loId,
            target_lo_id: postreqId,
          });

        if (edgeErr) {
          throw edgeErr;
        }
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(successRedirect as any);
      }, 1200);
    } catch (submitErr: unknown) {
      console.error("[SubmissionForm] Failed to save submission:", submitErr);
      const msg =
        submitErr instanceof Error
          ? submitErr.message
          : "Something went wrong while saving the submission.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const selectCls =
    "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";
  const labelCls =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500";
  const sectionCls = "space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6";

  const edgeLOs = useMemo(
    () => learningObjects.filter((lo) => lo.id !== selectedLoId),
    [learningObjects, selectedLoId]
  );

  async function handleAuthSignOut() {
    setSigningOut(true);

    const supabase = createSupabaseBrowserClient();

    try {
      await supabase.auth.signOut();
    } catch (signOutErr) {
      console.error("[SubmissionForm] Sign out fallback failed:", signOutErr);
    } finally {
      clearLocalState();
      router.replace("/sign-in");
      router.refresh();
      setSigningOut(false);
    }
  }

  if (userLoading || dataLoading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-8">
        <div className="mx-auto flex max-w-3xl items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-amber-800/40 bg-amber-950/20 p-5 text-sm text-amber-200">
          <p className="font-medium">Could not load your session/profile.</p>
          <p className="mt-1 text-amber-300/90">{authError}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={retry}>
              Retry
            </Button>
            <Button type="button" variant="ghost" onClick={handleAuthSignOut} disabled={signingOut}>
              {signingOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-700 bg-slate-900/60 p-5 text-sm text-slate-300">
          <p className="font-medium">Your session is not available.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={retry}>
              Retry
            </Button>
            <Button type="button" variant="ghost" onClick={handleAuthSignOut} disabled={signingOut}>
              {signingOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
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
          <CardTitle className="text-emerald-400">
            {isEditMode ? "Submission Updated" : "Submission Created"}
          </CardTitle>
          <p className="text-sm text-slate-400">
            Redirecting to your submissions...
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3">
          <Link
            href="/teacher/submissions"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            My Submissions
          </Link>
          <div className="border-b border-slate-800 pb-5">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              {isEditMode ? "Edit Submission" : "Create New Submission"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isEditMode
                ? "Update learning-object content, edges, and quiz setup"
                : "Submit content for a learning object"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
                <option value="">Select a course...</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
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
                className="border-slate-700 bg-slate-800"
              />
            </div>

            <div>
              <label className={labelCls}>Notes (optional)</label>
              <textarea
                className="min-h-[80px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                placeholder="Any notes about this submission..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

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
                  setPrerequisites([]);
                  setPostrequisites([]);
                }}
                required
              >
                <option value="">Select a learning object...</option>
                <option value="NEW">+ Add new LO</option>
                {learningObjects.map((lo) => (
                  <option key={lo.id} value={lo.id}>
                    {lo.title}
                  </option>
                ))}
              </select>
            </div>

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
                    className="border-slate-700 bg-slate-800"
                  />
                  {newLoTitle && (
                    <p className="mt-1 text-xs text-slate-500">Slug: {generateSlug(newLoTitle)}</p>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Description (optional)</label>
                  <textarea
                    className="min-h-[60px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                    placeholder="Brief description of this LO..."
                    value={newLoDescription}
                    onChange={(e) => setNewLoDescription(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Difficulty (1-5)</label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      placeholder="e.g. 2"
                      value={newLoDifficulty}
                      onChange={(e) => setNewLoDifficulty(e.target.value)}
                      className="border-slate-700 bg-slate-800"
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
                      className="border-slate-700 bg-slate-800"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={sectionCls}>
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <div className="h-4 w-0.5 rounded-full bg-brand" />
              <h2 className="text-sm font-semibold text-slate-200">Prerequisites</h2>
            </div>
            <p className="text-xs text-slate-500">
              LOs the student should complete before this one (prerequisite -&gt; this LO)
            </p>
            {edgeLOs.length === 0 ? (
              <p className="text-sm text-slate-500">No other LOs available</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-700 bg-slate-800/50 p-3">
                {edgeLOs.map((lo) => (
                  <label
                    key={lo.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-700/40"
                  >
                    <input
                      type="checkbox"
                      className="accent-brand"
                      checked={prerequisites.includes(lo.id)}
                      onChange={() => toggleCheck(lo.id, prerequisites, setPrerequisites)}
                    />
                    <span className="text-sm text-slate-200">{lo.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className={sectionCls}>
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <div className="h-4 w-0.5 rounded-full bg-brand" />
              <h2 className="text-sm font-semibold text-slate-200">Post-requisites</h2>
            </div>
            <p className="text-xs text-slate-500">
              LOs that should come after this one (this LO -&gt; post-requisite)
            </p>
            {edgeLOs.length === 0 ? (
              <p className="text-sm text-slate-500">No other LOs available</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-700 bg-slate-800/50 p-3">
                {edgeLOs.map((lo) => (
                  <label
                    key={lo.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-700/40"
                  >
                    <input
                      type="checkbox"
                      className="accent-brand"
                      checked={postrequisites.includes(lo.id)}
                      onChange={() => toggleCheck(lo.id, postrequisites, setPostrequisites)}
                    />
                    <span className="text-sm text-slate-200">{lo.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

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
                  <p className="text-sm font-medium text-slate-300">Content item {index + 1}</p>
                  {contentItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setContentItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
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
                    onChange={(e) => updateContentItem(index, "deliveryTypeId", e.target.value)}
                  >
                    <option value="">Select type...</option>
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
                      item.deliveryTypeCode === "QUIZ" ? "e.g. Unit Quiz" : "Content title..."
                    }
                    value={item.title}
                    onChange={(e) => updateContentItem(index, "title", e.target.value)}
                    className="border-slate-700 bg-slate-800"
                  />
                </div>

                {item.deliveryTypeCode && item.deliveryTypeCode !== "QUIZ" && (
                  <div>
                    <label className={labelCls}>Recommended time</label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      placeholder="Seconds"
                      value={item.recommendedTimeSeconds}
                      onChange={(e) =>
                        updateContentItem(index, "recommendedTimeSeconds", e.target.value)
                      }
                      className="border-slate-700 bg-slate-800"
                    />
                    <p className="mt-1 text-xs text-slate-500">Unit: seconds</p>
                  </div>
                )}

                {(item.deliveryTypeCode === "CONCEPT_NOTES" ||
                  item.deliveryTypeCode === "READING_NOTES" ||
                  item.deliveryTypeCode === "REVISION_SHEET") && (
                  <div>
                    <label className={labelCls}>
                      {item.deliveryTypeCode === "REVISION_SHEET" ? "Summary" : "Text"}
                    </label>
                    <textarea
                      className="min-h-[160px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                        className="border-slate-700 bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Caption (optional)</label>
                      <Input
                        placeholder="Optional caption"
                        value={item.caption}
                        onChange={(e) => updateContentItem(index, "caption", e.target.value)}
                        className="border-slate-700 bg-slate-800"
                      />
                    </div>
                    {item.deliveryTypeCode === "VISUAL_EXPLANATION" && (
                      <div>
                        <label className={labelCls}>Explanation text (optional)</label>
                        <textarea
                          className="min-h-[120px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                        className="min-h-[90px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={item.problem}
                        onChange={(e) => updateContentItem(index, "problem", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Solution</label>
                      <textarea
                        className="min-h-[90px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={item.solution}
                        onChange={(e) => updateContentItem(index, "solution", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Explanation</label>
                      <textarea
                        className="min-h-[90px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={item.explanation}
                        onChange={(e) => updateContentItem(index, "explanation", e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {(item.deliveryTypeCode === "PRACTICE_SET" ||
                  item.deliveryTypeCode === "PLAYGROUND") && (
                  <div>
                    <label className={labelCls}>Questions (one per line)</label>
                    <textarea
                      className="min-h-[140px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                      placeholder="Question 1\nQuestion 2\nQuestion 3"
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
                        className="border-slate-700 bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Starter Code</label>
                      <textarea
                        className="min-h-[160px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 font-mono text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                      <div
                        key={cardIndex}
                        className="space-y-2 rounded-md border border-slate-700 bg-slate-900/40 p-3"
                      >
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
                          onChange={(e) =>
                            updateFlashcard(index, cardIndex, "front", e.target.value)
                          }
                          className="border-slate-700 bg-slate-800"
                        />
                        <Input
                          placeholder="Answer / Back"
                          value={card.back}
                          onChange={(e) =>
                            updateFlashcard(index, cardIndex, "back", e.target.value)
                          }
                          className="border-slate-700 bg-slate-800"
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
                    <div>
                      <label className={labelCls}>Randomisation mode</label>
                      <select
                        className={selectCls}
                        value={item.quizRandomizationMode}
                        onChange={(e) =>
                          updateContentItem(index, "quizRandomizationMode", e.target.value)
                        }
                      >
                        <option value="0">Fixed order</option>
                        <option value="1">Shuffle all questions</option>
                        <option value="2">Sample and shuffle</option>
                      </select>
                    </div>

                    {item.quizRandomizationMode === "2" && (
                      <div>
                        <label className={labelCls}>Percentage of questions asked</label>
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          step={1}
                          inputMode="numeric"
                          placeholder="e.g. 10"
                          value={item.quizSamplePercentage}
                          onChange={(e) =>
                            updateContentItem(index, "quizSamplePercentage", e.target.value)
                          }
                          className="border-slate-700 bg-slate-800"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Example: if you add 100 questions and set this to 10%, students will
                          see 10 random questions.
                        </p>
                      </div>
                    )}

                    {item.quizQuestions.map((question, questionIndex) => (
                      <div
                        key={questionIndex}
                        className="space-y-2 rounded-md border border-slate-700 bg-slate-900/40 p-3"
                      >
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
                          className="min-h-[80px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                              onChange={() =>
                                setQuizCorrectOption(index, questionIndex, optionIndex)
                              }
                              className="accent-brand"
                            />
                            <Input
                              placeholder={`Option ${optionIndex + 1}`}
                              value={option}
                              onChange={(e) =>
                                updateQuizOption(index, questionIndex, optionIndex, e.target.value)
                              }
                              className="border-slate-700 bg-slate-800"
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
                      onChange={(e) => updateContentItem(index, "imageUrl", e.target.value)}
                      className="border-slate-700 bg-slate-800"
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
                      onChange={(e) => updateContentItem(index, "imageUrl", e.target.value)}
                      className="border-slate-700 bg-slate-800"
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
                        className="min-h-[120px] w-full resize-y rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 font-mono text-sm text-slate-100 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
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
              onClick={() => setContentItems((prev) => [...prev, { ...EMPTY_CONTENT_ITEM }])}
              className="w-full border border-dashed border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300"
            >
              + Add another content item
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isEditMode ? "Saving..." : "Creating..."}
                </span>
              ) : isEditMode ? (
                "Save Changes"
              ) : (
                "Create Submission"
              )}
            </Button>
            <Button asChild variant="ghost" type="button">
              <Link href="/teacher/submissions">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
