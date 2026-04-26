"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type MasteryLevel = "Beginner" | "Developing" | "Proficient" | "Mastered";

type EvalResult = {
  score: number;
  feedback: string;
  newMasteryScore: number;
  masteryLevel: MasteryLevel;
};

const MIN_LENGTH = 50;
const MAX_LENGTH = 3000;

function levelColor(level: MasteryLevel): string {
  switch (level) {
    case "Mastered":
      return "text-emerald-400";
    case "Proficient":
      return "text-blue-400";
    case "Developing":
      return "text-amber-400";
    default:
      return "text-slate-400";
  }
}

function levelBorder(level: MasteryLevel): string {
  switch (level) {
    case "Mastered":
      return "border-emerald-700/50 bg-emerald-950/30";
    case "Proficient":
      return "border-blue-700/50 bg-blue-950/30";
    case "Developing":
      return "border-amber-700/50 bg-amber-950/30";
    default:
      return "border-slate-700/50 bg-slate-950/30";
  }
}

export function FeynmanClient({
  submissionId,
  submissionTitle,
  loTitle,
  courseTitle,
  currentMasteryScore,
  currentMasteryLevel,
}: {
  submissionId: string;
  submissionTitle: string;
  loTitle: string;
  courseTitle: string;
  currentMasteryScore: number | null;
  currentMasteryLevel: string | null;
}) {
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvalResult | null>(null);

  const trimmedLength = explanation.trim().length;
  const remaining = MAX_LENGTH - explanation.length;
  const canSubmit = !loading && trimmedLength >= MIN_LENGTH && !result;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/feynman/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          explanation: explanation.trim(),
          loTitle,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setResult({
        score: data.score,
        feedback: data.feedback,
        newMasteryScore: data.newMasteryScore,
        masteryLevel: data.masteryLevel,
      });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link
        href="/recommendations"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to recommendations
      </Link>

      <div className="space-y-1">
        {courseTitle && <p className="text-xs text-slate-500">{courseTitle}</p>}
        <h1 className="text-lg font-semibold text-slate-100">{submissionTitle}</h1>
        <p className="text-sm text-slate-400">{loTitle}</p>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-5">
        <p className="text-sm font-medium text-slate-200">
          Explain{" "}
          <span className="font-semibold text-brand">{loTitle}</span>{" "}
          in your own words as if teaching a beginner.
        </p>
        <p className="mt-1.5 text-xs text-slate-500">
          Write at least {MIN_LENGTH} characters. Focus on clarity and simplicity.
        </p>
      </div>

      {currentMasteryScore !== null && !result && (
        <p className="text-xs text-slate-500">
          Current mastery:{" "}
          <span className="font-medium text-slate-300">
            {Math.round(currentMasteryScore)}
            {currentMasteryLevel ? ` · ${currentMasteryLevel}` : ""}
          </span>
        </p>
      )}

      {!result && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-brand/60 focus:outline-none focus:ring-1 focus:ring-brand/40 disabled:opacity-50"
            rows={10}
            placeholder={`Explain ${loTitle} in simple terms…`}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value.slice(0, MAX_LENGTH))}
            disabled={loading}
            aria-label="Your explanation"
          />

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {trimmedLength < MIN_LENGTH
                ? `${MIN_LENGTH - trimmedLength} more characters needed`
                : "Ready to submit"}
            </span>
            <span className={remaining < 200 ? "text-amber-400" : ""}>
              {remaining} remaining
            </span>
          </div>

          {error && (
            <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Evaluating…" : "Submit explanation"}
          </button>
        </div>
      )}

      {result && (
        <div
          className={`space-y-4 rounded-xl border p-5 ${levelBorder(result.masteryLevel)}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Feynman score
              </p>
              <p className={`mt-1 text-3xl font-bold ${levelColor(result.masteryLevel)}`}>
                {result.score}
                <span className="ml-1 text-lg font-normal text-slate-400">/ 100</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Level
              </p>
              <p className={`mt-1 text-sm font-semibold ${levelColor(result.masteryLevel)}`}>
                {result.masteryLevel}
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-slate-300">{result.feedback}</p>

          <p className="border-t border-slate-700/50 pt-3 text-xs text-slate-500">
            Updated mastery score:{" "}
            <span className={`font-semibold ${levelColor(result.masteryLevel)}`}>
              {result.newMasteryScore}
            </span>
          </p>

          <Link
            href="/recommendations"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to recommendations
          </Link>
        </div>
      )}
    </div>
  );
}
