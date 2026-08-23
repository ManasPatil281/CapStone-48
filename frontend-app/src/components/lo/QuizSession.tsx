"use client";

import { useMemo, useState } from "react";
import type { Assessment, AssessmentAttempt, Question } from "@/types/learning";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, HelpCircle, RotateCcw } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface Props {
  assessment?: Assessment & { questions: Question[] };
  attempts?: AssessmentAttempt[];
  onStartAttempt?: () => void;
  trackingContext?: {
    enabled: boolean;
    studentId: string | null;
    submissionId: string;
  };
}

type QuizOption = { id: string; option_text: string; is_correct: boolean };
type QuizQuestion = { id: string; question_text: string; options?: QuizOption[] };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function QuizSession({ assessment, trackingContext }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmittingAttempt, setIsSubmittingAttempt] = useState(false);

  const assessmentAny = assessment as unknown as {
    id: string;
    randomization_mode?: number | null;
    sample_percentage?: number | null;
  };

  const normalizedQuestions = useMemo(
    () =>
      assessment
        ? ((assessment.questions ?? []) as unknown as QuizQuestion[]).map((question) => ({
            ...question,
            options: question.options ?? [],
          }))
        : [],
    [assessment]
  );

  if (!assessment) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 py-12 text-center">
        <HelpCircle className="h-8 w-8 text-slate-700" />
        <p className="text-sm font-medium text-slate-500">No assessment published yet.</p>
      </div>
    );
  }

  const randomizationMode =
    typeof assessmentAny.randomization_mode === "number" &&
    [0, 1, 2].includes(assessmentAny.randomization_mode)
      ? assessmentAny.randomization_mode
      : 0;

  const samplePercentage =
    typeof assessmentAny.sample_percentage === "number"
      ? assessmentAny.sample_percentage
      : null;

  const questions = useMemo(() => {
    const withShuffledOptions = normalizedQuestions.map((question) => ({
      ...question,
      options: randomizationMode === 0 ? (question.options ?? []) : shuffle(question.options ?? []),
    }));

    if (randomizationMode === 0) {
      return withShuffledOptions;
    }

    if (randomizationMode === 1) {
      return shuffle(withShuffledOptions);
    }

    const shuffledQuestions = shuffle(withShuffledOptions);
    const total = shuffledQuestions.length;
    const percentage = Math.max(1, Math.min(99, samplePercentage ?? 100));
    const sampleCount = Math.max(1, Math.floor((total * percentage) / 100));
    return shuffledQuestions.slice(0, Math.min(sampleCount, total));
  }, [normalizedQuestions, randomizationMode, samplePercentage]);

  const answeredCount = questions.filter((q) => Boolean(answers[q.id])).length;
  const totalQuestions = questions.length;
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions;

  const resultByQuestionId = new Map<string, boolean>();
  if (submitted) {
    questions.forEach((question) => {
      const selectedOptionId = answers[question.id];
      const isCorrect =
        question.options?.some((opt) => opt.id === selectedOptionId && opt.is_correct) ?? false;
      resultByQuestionId.set(question.id, isCorrect);
    });
  }

  const correctCount = submitted
    ? Array.from(resultByQuestionId.values()).filter(Boolean).length
    : 0;
  const percentage =
    submitted && totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0;

  const selectAnswer = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const resetQuiz = () => {
    setAnswers({});
    setSubmitted(false);
  };

  const submitQuizAttempt = async () => {
    try {
      if (!assessment || !trackingContext?.enabled || !trackingContext.studentId) {
        return;
      }

      const attemptResultMap = new Map<string, boolean>();
      questions.forEach((question) => {
        const selectedOptionId = answers[question.id];
        const isCorrect =
          question.options?.some((opt) => opt.id === selectedOptionId && opt.is_correct) ?? false;
        attemptResultMap.set(question.id, isCorrect);
      });

      const attemptCorrectCount = Array.from(attemptResultMap.values()).filter(Boolean).length;
      const attemptTotal = questions.length;
      const attemptPercentage =
        attemptTotal > 0 ? Math.round((attemptCorrectCount / attemptTotal) * 100) : 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabaseAny = createSupabaseBrowserClient() as any;
      const { error: insertErr } = await supabaseAny.from("student_quiz_attempt").insert({
        student_id: trackingContext.studentId,
        submission_id: trackingContext.submissionId,
        assessment_id: assessmentAny.id,
        score_percentage: attemptPercentage,
        correct_count: attemptCorrectCount,
        total_questions: attemptTotal,
        randomization_mode: randomizationMode,
        sample_percentage: samplePercentage,
        shown_question_ids: questions.map((question) => question.id),
        selected_answers: answers,
      });

      if (insertErr) {
        throw insertErr;
      }

      // Trigger the canonical mastery engine immediately so this attempt is
      // reflected without waiting for the next page visit. Best-effort: a
      // failure here must not block the quiz UI — the submission-page visit
      // fallback recomputation will still pick this attempt up later.
      try {
        await fetch("/api/mastery/recalculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId: trackingContext.submissionId }),
        });
      } catch (recalcErr) {
        console.error("[QuizSession] Mastery recalculation request failed:", recalcErr);
      }
    } catch (submitErr) {
      console.error("[QuizSession] Failed to track quiz attempt:", submitErr);
    } finally {
      // no-op
    }
  };

  const handleSubmitQuiz = async () => {
    try {
      if (submitted || isSubmittingAttempt) {
        return;
      }

      setIsSubmittingAttempt(true);
      setSubmitted(true);
      await submitQuizAttempt();
    } catch (handlerErr) {
      console.error("[QuizSession] Submit handler failed:", handlerErr);
    } finally {
      setIsSubmittingAttempt(false);
    }
  };

  if (totalQuestions === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 py-12 text-center">
        <HelpCircle className="h-8 w-8 text-slate-700" />
        <p className="text-sm font-medium text-slate-500">No quiz questions available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Quiz header card ── */}
      <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-label text-slate-600">
              Assessment
            </p>
            <h2 className="text-base font-semibold tracking-tight text-slate-100">
              {assessment.title}
            </h2>
          </div>
          <span className="rounded-full border border-slate-800 bg-slate-800/60 px-3 py-1 text-xs text-slate-500">
            {totalQuestions} question{totalQuestions !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Score result ── */}
      {submitted && (
        <div
          className={`flex items-center gap-4 rounded-xl border p-5 ${
            percentage >= 70
              ? "border-mastery-mastered/20 bg-mastery-mastered/6"
              : "border-red-500/20 bg-red-500/6"
          }`}
        >
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border ${
              percentage >= 70
                ? "border-mastery-mastered/30 bg-mastery-mastered/12 text-mastery-mastered"
                : "border-red-500/30 bg-red-500/12 text-red-400"
            }`}
          >
            {percentage >= 70 ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">
              Score:{" "}
              <span className={percentage >= 70 ? "text-mastery-mastered" : "text-red-400"}>
                {correctCount}/{totalQuestions}
              </span>
            </p>
            <p className="text-xs text-slate-500">
              {percentage}% — {percentage >= 70 ? "Well done!" : "Keep practicing"}
            </p>
          </div>
        </div>
      )}

      {/* ── Questions ── */}
      {questions.map((question, index) => {
        const selectedOptionId = answers[question.id];
        const isCorrect = resultByQuestionId.get(question.id);
        const showResult = submitted && typeof isCorrect === "boolean";

        return (
          <div
            key={question.id}
            className="overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/60 backdrop-blur-[1px]"
          >
            {/* Question header */}
            <div className="flex items-start gap-3.5 border-b border-slate-800/60 px-5 py-4">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-500">
                {index + 1}
              </span>
              <p className="text-sm font-semibold leading-snug tracking-tight text-slate-100">
                {question.question_text}
              </p>
            </div>

            {/* Options */}
            <div className="space-y-2 p-5">
              {question.options?.map((option, optionIndex) => {
                const inputId = `${question.id}-${option.id}`;
                const isSelected = selectedOptionId === option.id;

                let optionStyle =
                  "border-slate-800/70 bg-slate-800/30 hover:border-slate-700 hover:bg-slate-800/50";

                if (submitted) {
                  if (option.is_correct) {
                    optionStyle = "border-mastery-mastered/30 bg-mastery-mastered/8";
                  } else if (isSelected && !option.is_correct) {
                    optionStyle = "border-red-500/30 bg-red-500/8";
                  } else {
                    optionStyle = "border-slate-800/40 bg-slate-800/20 opacity-50";
                  }
                } else if (isSelected) {
                  optionStyle = "border-brand/40 bg-brand/8";
                }

                return (
                  <label
                    key={option.id}
                    htmlFor={inputId}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors duration-150 ${optionStyle} ${submitted ? "cursor-default" : ""}`}
                  >
                    {/* Custom radio visual */}
                    <span
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected
                          ? submitted && !option.is_correct
                            ? "border-red-500 bg-red-500"
                            : submitted && option.is_correct
                            ? "border-mastery-mastered bg-mastery-mastered"
                            : "border-brand bg-brand"
                          : submitted && option.is_correct
                          ? "border-mastery-mastered bg-mastery-mastered"
                          : "border-slate-700 bg-transparent"
                      }`}
                    >
                      {(isSelected || (submitted && option.is_correct)) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>

                    <input
                      id={inputId}
                      type="radio"
                      name={`question-${question.id}`}
                      checked={isSelected}
                      disabled={submitted}
                      onChange={() => selectAnswer(question.id, option.id)}
                      className="sr-only"
                    />

                    <span
                      className={`text-sm leading-snug ${
                        submitted && option.is_correct
                          ? "font-medium text-mastery-mastered"
                          : submitted && isSelected && !option.is_correct
                          ? "text-red-400"
                          : submitted
                          ? "text-slate-500"
                          : "text-slate-300"
                      }`}
                    >
                      <span className="mr-1.5 font-mono text-[11px] text-slate-600">
                        {String.fromCharCode(65 + optionIndex)}.
                      </span>
                      {option.option_text}
                    </span>
                  </label>
                );
              })}

              {showResult && (
                <div
                  className={`flex items-center gap-1.5 pt-1 text-xs font-semibold ${
                    isCorrect ? "text-mastery-mastered" : "text-red-400"
                  }`}
                >
                  {isCorrect ? (
                    <CheckCircle className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {isCorrect ? "Correct" : "Incorrect"}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Actions ── */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          onClick={() => {
            void handleSubmitQuiz();
          }}
          disabled={!allAnswered || submitted || isSubmittingAttempt}
          className="bg-mastery-mastered text-white shadow-sm shadow-mastery-mastered/20 hover:bg-mastery-mastered/90 disabled:opacity-40"
        >
          Submit Quiz
        </Button>
        <Button
          onClick={resetQuiz}
          variant="ghost"
          className="flex items-center gap-1.5 border border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>

        <span className="ml-auto text-xs text-slate-600">
          {allAnswered
            ? "All questions answered"
            : `${totalQuestions - answeredCount} remaining`}
        </span>
      </div>
    </div>
  );
}
