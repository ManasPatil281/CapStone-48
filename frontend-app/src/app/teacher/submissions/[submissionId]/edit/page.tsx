import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SubmissionForm,
  type ContentItem,
  type SubmissionFormInitialData,
} from "@/app/teacher/submissions/SubmissionForm";

type EditPageProps = {
  params: {
    submissionId: string;
  };
};

function mapContentRowToContentItem(row: any): ContentItem {
  const code = row.delivery_type?.code ?? "";
  const contentJson = (row.content_json ?? {}) as Record<string, unknown>;

  const questionsText = Array.isArray(contentJson.questions)
    ? contentJson.questions
        .map((item) => (typeof item === "string" ? item : ""))
        .filter(Boolean)
        .join("\n")
    : Array.isArray(contentJson.practices)
    ? contentJson.practices
        .map((item) => {
          if (typeof item === "object" && item && "description" in item) {
            const description = (item as { description?: unknown }).description;
            return typeof description === "string" ? description : "";
          }
          return "";
        })
        .filter(Boolean)
        .join("\n")
    : "";

  const flashcardsRaw = Array.isArray(contentJson.cards)
    ? contentJson.cards
    : [];

  const flashcards = flashcardsRaw
    .map((item) => {
      if (typeof item === "object" && item) {
        const front = "front" in item && typeof (item as { front?: unknown }).front === "string"
          ? (item as { front: string }).front
          : "";
        const back = "back" in item && typeof (item as { back?: unknown }).back === "string"
          ? (item as { back: string }).back
          : "";
        return { front, back };
      }
      return { front: "", back: "" };
    })
    .filter((item) => item.front || item.back);

  return {
    deliveryTypeId: row.delivery_type_id,
    deliveryTypeCode: code,
    title: row.title ?? "",
    recommendedTimeSeconds:
      typeof row.recommended_time_seconds === "number" && row.recommended_time_seconds > 0
        ? String(row.recommended_time_seconds)
        : "",
    text:
      code === "REVISION_SHEET"
        ? (contentJson.summary as string | undefined) ?? ""
        : (contentJson.markdown as string | undefined) ??
          (contentJson.text as string | undefined) ??
          "",
    imageUrl:
      (contentJson.image_url as string | undefined) ??
      (contentJson.url as string | undefined) ??
      (contentJson.pdf_url as string | undefined) ??
      "",
    caption: (contentJson.caption as string | undefined) ?? "",
    problem: (contentJson.problem as string | undefined) ?? "",
    solution: (contentJson.solution as string | undefined) ?? "",
    explanation: (contentJson.explanation as string | undefined) ?? "",
    questionsText,
    language: (contentJson.language as string | undefined) ?? "javascript",
    starterCode: (contentJson.starter_code as string | undefined) ?? "",
    rawJson:
      code &&
      [
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
        "VIDEO",
        "READING_PDF",
      ].includes(code)
        ? ""
        : JSON.stringify(contentJson, null, 2),
    flashcards: flashcards.length > 0 ? flashcards : [{ front: "", back: "" }],
    quizQuestions: [
      {
        questionText: "",
        options: ["", "", "", ""],
        correctOptionIndex: null,
      },
    ],
    quizRandomizationMode: "0",
    quizSamplePercentage: "",
  };
}

export default async function EditSubmissionPage({ params }: EditPageProps) {
  const user = await requireRole(["TEACHER"]);
  const supabase = createSupabaseServerClient();
  // Keep casts narrow and local: current generated DB types are incomplete for joined selects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const { data: submissionRowRaw, error: submissionErr } = await supabaseAny
    .from("teacher_lo_submission")
    .select("id, course_id, learning_object_id, teacher_id, title, notes")
    .eq("id", params.submissionId)
    .eq("teacher_id", user.id)
    .maybeSingle();

  const submissionRow = submissionRowRaw as
    | {
        id: string;
        course_id: string;
        learning_object_id: string;
        teacher_id: string;
        title: string;
        notes: string | null;
      }
    | null;

  if (submissionErr) {
    console.error("[EditSubmissionPage] Failed to load submission:", submissionErr);
  }

  if (!submissionRow) {
    notFound();
  }

  const [contentRes, edgeRes, assessmentRes, quizDeliveryTypeRes] = await Promise.all([
    supabaseAny
      .from("teacher_lo_submission_content")
      .select("id, delivery_type_id, title, content_json, sequence_order, recommended_time_seconds, delivery_type:delivery_type_id(code)")
      .eq("submission_id", submissionRow.id)
      .order("sequence_order", { ascending: true }),
    supabaseAny
      .from("teacher_lo_submission_edge")
      .select("source_lo_id, target_lo_id")
      .eq("submission_id", submissionRow.id),
    supabaseAny
      .from("teacher_lo_submission_assessment")
      .select("id, randomization_mode, sample_percentage")
      .eq("submission_id", submissionRow.id),
    supabaseAny.from("delivery_type").select("id, code").eq("code", "QUIZ").maybeSingle(),
  ]);

  if (contentRes.error) {
    console.error("[EditSubmissionPage] Failed to load submission content:", contentRes.error);
  }

  if (edgeRes.error) {
    console.error("[EditSubmissionPage] Failed to load submission edges:", edgeRes.error);
  }

  if (assessmentRes.error) {
    console.error("[EditSubmissionPage] Failed to load assessments:", assessmentRes.error);
  }

  const assessmentRows = (assessmentRes.data ?? []) as Array<{
    id: string;
    randomization_mode?: number | null;
    sample_percentage?: number | null;
  }>;

  const assessmentIds = assessmentRows.map((item) => item.id);

  const assessmentConfig = assessmentRows[0] ?? null;
  const randomizationMode =
    typeof assessmentConfig?.randomization_mode === "number" &&
    [0, 1, 2].includes(assessmentConfig.randomization_mode)
      ? assessmentConfig.randomization_mode
      : 0;
  const samplePercentage =
    typeof assessmentConfig?.sample_percentage === "number" &&
    assessmentConfig.sample_percentage > 0
      ? assessmentConfig.sample_percentage
      : null;

  let quizQuestions: Array<{
    id: string;
    question_text: string;
    options: Array<{ option_text: string; is_correct: boolean }>;
  }> = [];

  if (assessmentIds.length > 0) {
    const { data: questionRowsRaw, error: questionErr } = await supabaseAny
      .from("teacher_lo_submission_question")
      .select("id, question_text, assessment_id")
      .in("assessment_id", assessmentIds);

    const questionRows = (questionRowsRaw ?? []) as Array<{
      id: string;
      question_text: string;
      assessment_id: string;
    }>;

    if (questionErr) {
      console.error("[EditSubmissionPage] Failed to load quiz questions:", questionErr);
    }

    const questionIds = questionRows.map((item) => item.id);

    let optionRows: Array<{
      question_id: string;
      option_text: string;
      is_correct: boolean;
    }> = [];

    if (questionIds.length > 0) {
      const { data: optionsData, error: optionErr } = await supabaseAny
        .from("teacher_lo_submission_question_option")
        .select("question_id, option_text, is_correct")
        .in("question_id", questionIds);

      if (optionErr) {
        console.error("[EditSubmissionPage] Failed to load quiz options:", optionErr);
      }

      optionRows = (optionsData ?? []) as Array<{
        question_id: string;
        option_text: string;
        is_correct: boolean;
      }>;
    }

    const optionMap = new Map<string, Array<{ option_text: string; is_correct: boolean }>>();

    optionRows.forEach((option) => {
      const items = optionMap.get(option.question_id) ?? [];
      items.push({ option_text: option.option_text, is_correct: option.is_correct });
      optionMap.set(option.question_id, items);
    });

    quizQuestions = questionRows.map((question) => ({
      id: question.id,
      question_text: question.question_text,
      options: optionMap.get(question.id) ?? [],
    }));
  }

  const selectedLoId = submissionRow.learning_object_id;
  const edgeRows = (edgeRes.data ?? []) as Array<{ source_lo_id: string; target_lo_id: string }>;

  const prerequisites = edgeRows
    .filter((edge) => edge.target_lo_id === selectedLoId)
    .map((edge) => edge.source_lo_id);
  const postrequisites = edgeRows
    .filter((edge) => edge.source_lo_id === selectedLoId)
    .map((edge) => edge.target_lo_id);

  const contentRows = (contentRes.data ?? []) as any[];

  const contentItems: ContentItem[] = contentRows.map((row: any) =>
    mapContentRowToContentItem(row)
  );

  if (assessmentRows.length > 0 || quizQuestions.length > 0) {
    const quizDraftQuestions = quizQuestions.map((question) => {
      const optionTexts = question.options.map((option) => option.option_text);
      while (optionTexts.length < 4) {
        optionTexts.push("");
      }

      const correctOptionIndex = question.options.findIndex((option) => option.is_correct);

      return {
        questionText: question.question_text,
        options: [
          optionTexts[0] ?? "",
          optionTexts[1] ?? "",
          optionTexts[2] ?? "",
          optionTexts[3] ?? "",
        ] as [string, string, string, string],
        correctOptionIndex: correctOptionIndex >= 0 ? correctOptionIndex : null,
      };
    });

    contentItems.push({
      deliveryTypeId: quizDeliveryTypeRes.data?.id ?? "",
      deliveryTypeCode: "QUIZ",
      title: "Quiz",
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
      quizQuestions: quizDraftQuestions,
      quizRandomizationMode: String(randomizationMode),
      quizSamplePercentage: samplePercentage === null ? "" : String(samplePercentage),
    });
  }

  const initialData: SubmissionFormInitialData = {
    submissionId: submissionRow.id,
    courseId: submissionRow.course_id,
    selectedLoId: selectedLoId,
    submissionTitle: submissionRow.title,
    notes: submissionRow.notes ?? "",
    prerequisites,
    postrequisites,
    contentItems,
  };

  return (
    <SubmissionForm
      mode="edit"
      initialData={initialData}
      successRedirect="/teacher/submissions"
    />
  );
}
