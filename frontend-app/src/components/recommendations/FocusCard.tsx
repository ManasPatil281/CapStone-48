"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Sparkles } from "lucide-react";
import { RemediationModal } from "@/components/lo/RemediationModal";
import { describeDiagnosisType } from "@/lib/recommendations/translateForStudent";
import type { Diagnosis } from "@/lib/ai/output-schemas";

// Flattened, cache-friendly shape — deliberately NOT the full Diagnosis/
// PedagogicalPlan objects, since this is exactly what src/lib/recommendations/focusCache.ts
// persists in the session cache cookie (only the fields actually rendered here).
export interface FocusCardProps {
  submissionTitle: string;
  learningObjectTitle: string;
  courseTitle: string;
  masteryScore: number | null;
  masteryLevel: string | null;
  hasRoadblock: boolean;
  /** Plain-language translation of the top RoadblockEvidence signals — always shown, never LLM-generated. */
  evidenceBullets: string[];
  /** The same signals' raw, exact-number RoadblockEvidence text, shown only in the collapsed "Details" disclosure. */
  evidenceDetails: string[];
  diagnosisType: Diagnosis["diagnosisType"];
  /** Diagnosis.studentSummary — schema-native, already second-person text from the Diagnostic Agent. */
  studentSummary: string;
  /** PedagogicalPlan.studentReason — schema-native, already second-person text from the Pedagogical Planner. */
  studentReason: string;
  actionLabel: string;
  actionDetail: string | null;
  actionHref: Route | null;
  opensRemediation: boolean;
}

export function FocusCard({
  submissionTitle,
  learningObjectTitle,
  courseTitle,
  masteryScore,
  masteryLevel,
  hasRoadblock,
  evidenceBullets = [],
  evidenceDetails = [],
  diagnosisType,
  studentSummary,
  studentReason,
  actionLabel,
  actionDetail,
  actionHref,
  opensRemediation,
}: FocusCardProps) {
  const [remediationOpen, setRemediationOpen] = useState(false);

  const showAiRead = hasRoadblock && diagnosisType !== "NO_ROADBLOCK_DETECTED";

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {hasRoadblock ? "Your focus area" : "How you're doing"}
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-100">{learningObjectTitle}</h2>
          <p className="text-xs text-slate-500">
            {submissionTitle} • {courseTitle}
          </p>
        </div>
        {typeof masteryScore === "number" && (
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-100">{Math.round(masteryScore)}%</p>
            <p className="text-[11px] text-slate-500">{masteryLevel ?? "Mastery"}</p>
          </div>
        )}
      </div>

      {evidenceBullets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            What we noticed
          </p>
          <ul className="space-y-1 text-sm leading-relaxed text-slate-300">
            {evidenceBullets.map((bullet, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-slate-600">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          {evidenceDetails.length > 0 && (
            <details className="text-[11px] text-slate-500">
              <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-400">
                Details
              </summary>
              <ul className="mt-1.5 space-y-1 pl-3">
                {evidenceDetails.map((detail, i) => (
                  <li key={i} className="text-slate-500">
                    {detail}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {!hasRoadblock && evidenceBullets.length === 0 && (
        <p className="text-sm leading-relaxed text-slate-300">
          Nothing concerning stands out here right now — your recent activity and mastery look healthy.
        </p>
      )}

      {showAiRead && (
        <div className="space-y-1.5 rounded-lg border border-indigo-800/30 bg-indigo-950/20 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-400">
            <Sparkles className="h-3 w-3" />
            AI's read on this
          </p>
          <p className="text-sm leading-relaxed text-slate-300">
            This looks like {describeDiagnosisType(diagnosisType)}. {studentSummary}
          </p>
        </div>
      )}

      <div className="space-y-2 border-t border-slate-800/70 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Recommended next step
        </p>
        <p className="text-sm font-medium text-slate-100">{actionLabel}</p>
        {(actionDetail || studentReason) && (
          <p className="text-xs leading-relaxed text-slate-400">{actionDetail ?? studentReason}</p>
        )}

        {opensRemediation ? (
          <button
            onClick={() => setRemediationOpen(true)}
            className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-colors hover:text-brand/80"
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : actionHref ? (
          <Link
            href={actionHref}
            className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-colors hover:text-brand/80"
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      {opensRemediation && (
        <RemediationModal
          isOpen={remediationOpen}
          onClose={() => setRemediationOpen(false)}
          loTitle={learningObjectTitle}
          userMasteryScore={masteryScore ?? undefined}
        />
      )}
    </section>
  );
}
