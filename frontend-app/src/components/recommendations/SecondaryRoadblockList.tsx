"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { RemediationModal } from "@/components/lo/RemediationModal";
import type { FocusResult } from "@/lib/recommendations/buildFocusResult";

export interface SecondaryCandidateSummary {
  submissionId: string;
  learningObjectId: string | null;
  learningObjectTitle: string;
  courseTitle: string;
}

/**
 * Subdued, on-demand list of additional submissions with a detected
 * roadblock that were NOT the page's single auto-analyzed focus candidate.
 * Deliberately understated (small text, no charts/tables) so this stays a
 * secondary "look here if you want" area rather than a second dashboard.
 *
 * The Diagnostic Agent + Pedagogical Planner only run for an item here if
 * the student explicitly clicks "Look into this" — never automatically.
 */
export function SecondaryRoadblockList({ candidates }: { candidates: SecondaryCandidateSummary[] }) {
  const [results, setResults] = useState<Record<string, FocusResult | "loading" | "error">>({});
  const [remediationTarget, setRemediationTarget] = useState<FocusResult | null>(null);

  if (candidates.length === 0) return null;

  async function analyze(submissionId: string) {
    setResults((r) => ({ ...r, [submissionId]: "loading" }));
    try {
      const res = await fetch("/api/ai/recommend-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as FocusResult;
      setResults((r) => ({ ...r, [submissionId]: data }));
    } catch {
      setResults((r) => ({ ...r, [submissionId]: "error" }));
    }
  }

  return (
    <section className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-slate-600">
        Other areas that may need attention
      </p>
      <div className="space-y-1.5">
        {candidates.map((c) => {
          const result = results[c.submissionId];
          return (
            <div key={c.submissionId} className="rounded-lg border border-slate-800/60 bg-slate-950/30 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  <span className="text-slate-300">{c.learningObjectTitle}</span>
                  {c.courseTitle ? ` • ${c.courseTitle}` : ""}
                </p>
                {!result && (
                  <button
                    onClick={() => analyze(c.submissionId)}
                    className="shrink-0 text-[11px] font-medium text-slate-500 underline decoration-dotted transition-colors hover:text-brand"
                  >
                    Look into this
                  </button>
                )}
                {result === "loading" && (
                  <span className="shrink-0 text-[11px] text-slate-600">Analyzing…</span>
                )}
              </div>

              {result === "error" && (
                <p className="mt-1 text-[11px] text-red-400/80">Couldn&apos;t analyze this right now.</p>
              )}

              {result && result !== "loading" && result !== "error" && (
                <div className="mt-2 space-y-1.5 border-t border-slate-800/60 pt-2">
                  {result.evidenceBullets.slice(0, 1).map((bullet, i) => (
                    <p key={i} className="text-[11px] leading-relaxed text-slate-400">
                      {bullet}
                    </p>
                  ))}
                  <p className="text-xs font-medium text-slate-200">{result.actionLabel}</p>
                  {result.opensRemediation ? (
                    <button
                      onClick={() => setRemediationTarget(result)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:text-brand/80"
                    >
                      {result.actionLabel}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  ) : result.actionHref ? (
                    <Link
                      href={result.actionHref as Route}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:text-brand/80"
                    >
                      {result.actionLabel}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {remediationTarget && (
        <RemediationModal
          isOpen={true}
          onClose={() => setRemediationTarget(null)}
          loTitle={remediationTarget.learningObjectTitle}
          userMasteryScore={remediationTarget.masteryScore ?? undefined}
        />
      )}
    </section>
  );
}
