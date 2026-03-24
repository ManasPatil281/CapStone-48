"use client";

import { useState } from "react";
import type { Assessment, AssessmentAttempt, Question } from "@/types/learning";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface Props {
  assessment?: Assessment & { questions: Question[] };
  attempts?: AssessmentAttempt[];
  onStartAttempt?: () => void;
}

export function QuizSession({ assessment, attempts, onStartAttempt }: Props) {
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Map<number, string>>(new Map());
  const [submitted, setSubmitted] = useState(false);

  if (!assessment) {
    return <p className="text-sm text-slate-400">No assessment published yet.</p>;
  }

  const { questions = [] } = assessment;
  const lastAttempt = attempts?.[0];

  if (!isQuizMode) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{assessment.title}</span>
              <Badge className="bg-brand/20 text-brand border-brand/30">{questions.length} Questions</Badge>
            </CardTitle>
            <CardDescription>
              Pass score: <span className="font-semibold text-brand">{assessment.pass_percentage}%</span> · Max attempts: {assessment.max_attempts} · Remaining: {Math.max(0, assessment.max_attempts - (lastAttempt?.attempt_number ?? 0))}
            </CardDescription>
          </CardHeader>
          <div className="space-y-4 px-6 pb-6">
            {lastAttempt ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Last Attempt</p>
                <div className={`rounded-2xl border-2 p-4 space-y-3 ${
                  lastAttempt.is_passed
                    ? "border-green-500/30 bg-green-500/10"
                    : "border-yellow-500/30 bg-yellow-500/10"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-200">Score</span>
                    <span className={`text-lg font-bold ${lastAttempt.is_passed ? "text-green-400" : "text-yellow-400"}`}>
                      {lastAttempt.percentage}%
                    </span>
                  </div>
                  <Progress value={lastAttempt.percentage} className="h-2" />
                  <Badge className={lastAttempt.is_passed ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}>
                    {lastAttempt.is_passed ? "✓ Passed" : "⚠ Keep Trying"}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">You haven't attempted this assessment yet. Start now to see your progress!</p>
            )}
            <Button onClick={() => { setIsQuizMode(true); setCurrentQuestion(0); setAnswers(new Map()); setSubmitted(false); }} className="w-full bg-brand hover:bg-brand/90 h-10">
              {lastAttempt ? "Retry Assessment" : "Start Assessment"}
            </Button>
          </div>
        </Card>
        <div className="text-xs text-slate-500 text-center">
          {questions.length} questions · ~{Math.ceil((questions.length * 2))} minutes
        </div>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const selectedAnswer = answers.get(currentQuestion);
  const answeredCount = answers.size;
  const progressPercent = Math.round((answeredCount / questions.length) * 100);

  const handleSelectAnswer = (optionId: string) => {
    const newAnswers = new Map(answers);
    newAnswers.set(currentQuestion, optionId);
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmit = () => {
    if (answeredCount === questions.length) {
      setSubmitted(true);
    }
  };

  if (submitted) {
    const correctAnswers = Array.from(answers.entries()).reduce((count, [qIdx, optionId]) => {
      const q = questions[qIdx];
      const isCorrect = q.options?.some(opt => opt.id === optionId && opt.is_correct);
      return count + (isCorrect ? 1 : 0);
    }, 0);
    const percentage = Math.round((correctAnswers / questions.length) * 100);
    const passed = percentage >= assessment.pass_percentage;

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Quiz Results</CardTitle>
          </CardHeader>
          <div className="space-y-6 px-6 pb-6">
            <div className={`rounded-3xl border-2 p-8 text-center space-y-4 ${
              passed
                ? "border-green-500/40 bg-green-500/10"
                : "border-yellow-500/40 bg-yellow-500/10"
            }`}>
              <div className="text-5xl font-bold">
                <span className={passed ? "text-green-400" : "text-yellow-400"}>
                  {percentage}%
                </span>
              </div>
              <p className={`text-lg font-semibold ${passed ? "text-green-300" : "text-yellow-300"}`}>
                {passed ? "🎉 Passed!" : "Keep Practicing"}
              </p>
              <p className="text-sm text-slate-300">
                You got <span className="font-semibold text-slate-100">{correctAnswers}/{questions.length}</span> answers correct
              </p>
              <Progress value={percentage} className="h-2" />
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Results Breakdown</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-900/40 p-3">
                  <p className="text-xs text-slate-400">Correct</p>
                  <p className="text-lg font-bold text-green-400">{correctAnswers}</p>
                </div>
                <div className="rounded-lg bg-slate-900/40 p-3">
                  <p className="text-xs text-slate-400">Total</p>
                  <p className="text-lg font-bold text-slate-300">{questions.length}</p>
                </div>
                <div className="rounded-lg bg-slate-900/40 p-3">
                  <p className="text-xs text-slate-400">Pass Score</p>
                  <p className="text-lg font-bold text-brand">{assessment.pass_percentage}%</p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => {
                setIsQuizMode(false);
                setCurrentQuestion(0);
                setAnswers(new Map());
                setSubmitted(false);
              }}
              className="w-full bg-brand hover:bg-brand/90 h-10"
            >
              Back to Assessment
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!question) {
    return <p className="text-sm text-slate-400">Question not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-200">Question {currentQuestion + 1}/{questions.length}</span>
          <span className="text-xs font-bold text-brand">{answeredCount} Answered</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Question Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{question.question_text}</CardTitle>
          {question.marks && <CardDescription>Worth {question.marks} points</CardDescription>}
        </CardHeader>
        <div className="space-y-3 px-6 pb-6">
          {question.options?.map((option) => (
            <button
              key={option.id}
              onClick={() => handleSelectAnswer(option.id)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                selectedAnswer === option.id
                  ? "border-brand bg-brand/10 shadow-lg shadow-brand/20"
                  : "border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-slate-900/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  selectedAnswer === option.id
                    ? "border-brand bg-brand/30"
                    : "border-slate-400"
                }`}>
                  {selectedAnswer === option.id && <div className="h-2 w-2 rounded-full bg-brand" />}
                </div>
                <span className="text-slate-200 font-medium">{option.option_text}</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Navigation */}
      <div className="flex gap-3">
        <Button
          onClick={handlePrev}
          disabled={currentQuestion === 0}
          variant="outline"
          className="flex-1"
        >
          ← Previous
        </Button>
        {currentQuestion < questions.length - 1 ? (
          <Button
            onClick={handleNext}
            className="flex-1 bg-slate-800 hover:bg-slate-700"
          >
            Next →
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={answeredCount < questions.length}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            Submit Quiz
          </Button>
        )}
      </div>
      <p className="text-center text-xs text-slate-500">
        {answeredCount === questions.length ? "All questions answered! Ready to submit." : `${questions.length - answeredCount} questions remaining`}
      </p>
    </div>
  );
}
