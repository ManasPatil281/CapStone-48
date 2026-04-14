"use client";

import { useState } from "react";
import type { Assessment, AssessmentAttempt, Question } from "@/types/learning";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  assessment?: Assessment & { questions: Question[] };
  attempts?: AssessmentAttempt[];
  onStartAttempt?: () => void;
}

type QuizOption = { id: string; option_text: string; is_correct: boolean };
type QuizQuestion = { id: string; question_text: string; options?: QuizOption[] };

export function QuizSession({ assessment }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!assessment) {
    return <p className="text-sm text-slate-400">No assessment published yet.</p>;
  }

  const questions = ((assessment.questions ?? []) as unknown as QuizQuestion[]).map((question) => ({
    ...question,
    options: question.options ?? []
  }));
  const answeredCount = questions.filter((question) => Boolean(answers[question.id])).length;
  const totalQuestions = questions.length;
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions;

  const resultByQuestionId = new Map<string, boolean>();
  if (submitted) {
    questions.forEach((question) => {
      const selectedOptionId = answers[question.id];
      const isCorrect = question.options?.some((option) => option.id === selectedOptionId && option.is_correct) ?? false;
      resultByQuestionId.set(question.id, isCorrect);
    });
  }

  const correctCount = submitted ? Array.from(resultByQuestionId.values()).filter(Boolean).length : 0;
  const percentage = submitted && totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  const selectAnswer = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const resetQuiz = () => {
    setAnswers({});
    setSubmitted(false);
  };

  if (totalQuestions === 0) {
    return <p className="text-sm text-slate-400">No quiz questions available yet.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{assessment.title}</CardTitle>
        </CardHeader>
      </Card>

      {submitted ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-200">
          Score: <span className="font-semibold">{correctCount}/{totalQuestions}</span> ({percentage}%)
        </div>
      ) : null}

      {questions.map((question, index) => {
        const selectedOptionId = answers[question.id];
        const isCorrect = resultByQuestionId.get(question.id);
        const showResult = submitted && typeof isCorrect === "boolean";

        return (
          <Card key={question.id}>
            <CardHeader>
              <CardTitle className="text-base">{index + 1}. {question.question_text}</CardTitle>
            </CardHeader>
            <div className="space-y-2 px-6 pb-6">
              {question.options?.map((option, optionIndex) => {
                const inputId = `${question.id}-${option.id}`;
                const isSelected = selectedOptionId === option.id;
                const optionClass = submitted
                  ? option.is_correct
                    ? "border-green-500/40 bg-green-500/10"
                    : isSelected
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-white/10 bg-slate-900/40"
                  : isSelected
                  ? "border-brand/40 bg-brand/10"
                  : "border-white/10 bg-slate-900/40";

                return (
                  <label key={option.id} htmlFor={inputId} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${optionClass}`}>
                    <input
                      id={inputId}
                      type="radio"
                      name={`question-${question.id}`}
                      checked={isSelected}
                      disabled={submitted}
                      onChange={() => selectAnswer(question.id, option.id)}
                    />
                    <span className="text-slate-200">{String.fromCharCode(65 + optionIndex)}. {option.option_text}</span>
                  </label>
                );
              })}

              {showResult ? (
                <p className={`text-sm font-medium ${isCorrect ? "text-green-400" : "text-red-400"}`}>
                  {isCorrect ? "Correct" : "Incorrect"}
                </p>
              ) : null}
            </div>
          </Card>
        );
      })}

      <div className="flex gap-3">
        <Button onClick={() => setSubmitted(true)} disabled={!allAnswered || submitted} className="bg-green-600 hover:bg-green-700">
          Submit
        </Button>
        <Button onClick={resetQuiz} variant="ghost" className="border border-white/20">
          Reset
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        {allAnswered ? "All questions answered." : `${totalQuestions - answeredCount} question(s) remaining before submit.`}
      </p>
    </div>
  );
}
