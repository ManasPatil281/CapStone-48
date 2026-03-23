"use client";

import type { Assessment, AssessmentAttempt, Question } from "@/types/learning";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  assessment?: Assessment & { questions: Question[] };
  attempts?: AssessmentAttempt[];
  onStartAttempt?: () => void;
}

export function QuizSession({ assessment, attempts, onStartAttempt }: Props) {
  if (!assessment) {
    return <p className="text-sm text-slate-400">No assessment published yet.</p>;
  }

  const lastAttempt = attempts?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{assessment.title}</CardTitle>
        <CardDescription>
          Pass score {assessment.pass_percentage}% · Attempts {lastAttempt?.attempt_number ?? 0}/{assessment.max_attempts}
        </CardDescription>
      </CardHeader>
      <div className="space-y-4">
        {lastAttempt ? (
          <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4 text-sm text-slate-300">
            <p>Last attempt · {lastAttempt.percentage}%</p>
            <p>Status · {lastAttempt.is_passed ? "Passed" : "Keep trying"}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">You have not attempted this assessment yet.</p>
        )}
        <Button onClick={onStartAttempt}>Start New Attempt</Button>
      </div>
    </Card>
  );
}
