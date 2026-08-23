"use client";

import { useState } from "react";
import { Clock, Target, Trophy, ChevronDown, ChevronUp } from "lucide-react";
import type { MasteryResult } from "@/lib/mastery/calculateMasteryScore";

// ─── Exported types ───────────────────────────────────────────────────────────
// Used by page.tsx (server) to build the payload and LODetailTabs to thread it.

export type StatContentBlock = {
  id: string;
  title: string;
  deliveryTypeCode: string | null;
  deliveryTypeName: string | null;
  recommendedTimeSeconds: number | null;
};

export type StatContentBlockTime = {
  contentId: string;
  activeSeconds: number;
  idleSeconds: number;
};

export type StatQuizAttempt = {
  id: string;
  scorePercentage: number | null;
  correctCount: number | null;
  totalQuestions: number | null;
  timestamp: string | null;
  randomizationMode: number | null;
  samplePercentage: number | null;
};

export type SubmissionStats = {
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  contentBlocks: StatContentBlock[];
  contentBlockTimes: StatContentBlockTime[];
  quizAttempts: StatQuizAttempt[];
  /** null when there is no knowledge evidence (quiz/Feynman) yet — mastery stays unknown, not 0. */
  masteryResult?: MasteryResult | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  if (s <= 0) return "0s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function fmtPercent(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}%`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function masteryLevelCls(level: string): string {
  if (level === "Mastered") return "text-emerald-400";
  if (level === "Proficient") return "text-indigo-400";
  if (level === "Developing") return "text-orange-400";
  return "text-red-400";
}

type EngagementStatus = "under" | "on-track" | "over" | "no-target";

function getEngagementStatus(activeSeconds: number, recommended: number | null): EngagementStatus {
  if (!recommended || recommended <= 0) return "no-target";
  const ratio = activeSeconds / recommended;
  if (ratio < 0.7) return "under";
  if (ratio <= 1.3) return "on-track";
  return "over";
}

const ENGAGEMENT_CONFIG: Record<EngagementStatus, { text: string; textCls: string; dotCls: string }> = {
  "under":     { text: "Under target", textCls: "text-red-400",     dotCls: "bg-red-400/80" },
  "on-track":  { text: "On track",     textCls: "text-emerald-400", dotCls: "bg-emerald-400/80" },
  "over":      { text: "Over target",  textCls: "text-orange-400",  dotCls: "bg-orange-400/80" },
  "no-target": { text: "No target",    textCls: "text-slate-500",   dotCls: "bg-slate-600" },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface StatisticsTabProps {
  stats: SubmissionStats;
  hasAssessment: boolean;
}

export function StatisticsTab({ stats, hasAssessment }: StatisticsTabProps) {
  const [showLatestResults, setShowLatestResults] = useState(false);

  const { totalActiveSeconds, totalIdleSeconds, contentBlocks, contentBlockTimes, quizAttempts, masteryResult } = stats;

  const blockTimeMap = new Map(contentBlockTimes.map((b) => [b.contentId, b]));

  const sortedAttempts = [...quizAttempts].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });
  const latestAttempt = sortedAttempts[0] ?? null;

  const bestScore =
    quizAttempts.length > 0
      ? Math.max(
          ...quizAttempts
            .map((a) => a.scorePercentage)
            .filter((s): s is number => s !== null && Number.isFinite(s))
        )
      : null;

  const hasAnyData =
    totalActiveSeconds > 0 ||
    totalIdleSeconds > 0 ||
    contentBlockTimes.length > 0 ||
    quizAttempts.length > 0;

  if (!hasAnyData) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800/60 bg-slate-900/30 px-6 py-10 text-center">
        <p className="text-sm text-slate-500">Start learning to see your statistics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Summary row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Active time"
          value={fmtSeconds(totalActiveSeconds)}
          icon={<Clock className="h-3.5 w-3.5" />}
        />
        <SummaryCard
          label="Idle time"
          value={fmtSeconds(totalIdleSeconds)}
          icon={<Clock className="h-3.5 w-3.5 opacity-40" />}
          dimValue
        />
        <SummaryCard
          label="Quiz attempts"
          value={hasAssessment ? String(quizAttempts.length) : "—"}
          icon={<Target className="h-3.5 w-3.5" />}
        />
        <div className="rounded-lg border border-slate-800/60 bg-slate-900/60 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Trophy className="h-3.5 w-3.5" />
            Mastery
          </p>
          {masteryResult ? (
            <>
              <p className={`mt-1 text-sm font-bold ${masteryLevelCls(masteryResult.level)}`}>
                {masteryResult.level}
              </p>
              <p className="text-[10px] text-slate-600">{masteryResult.score} / 100</p>
            </>
          ) : (
            <p className="mt-1 text-sm font-bold text-slate-500">—</p>
          )}
        </div>
      </div>

      {/* ── Content block breakdown ──────────────────────────────────────────── */}
      {contentBlocks.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/40">
          <div className="border-b border-slate-800/60 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Time per content block
            </p>
          </div>
          <div className="divide-y divide-slate-800/40">
            {contentBlocks.map((block) => {
              const bt = blockTimeMap.get(block.id);
              const activeS = bt?.activeSeconds ?? 0;
              const idleS = bt?.idleSeconds ?? 0;
              const status = getEngagementStatus(activeS, block.recommendedTimeSeconds);
              const { text, textCls, dotCls } = ENGAGEMENT_CONFIG[status];

              return (
                <div
                  key={block.id}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {block.title || "Untitled block"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {block.deliveryTypeName ?? block.deliveryTypeCode ?? "—"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-5">
                    <Metric label="Active" value={fmtSeconds(activeS)} />
                    <Metric label="Idle"   value={fmtSeconds(idleS)} dim />
                    {block.recommendedTimeSeconds != null && block.recommendedTimeSeconds > 0 && (
                      <Metric label="Target" value={fmtSeconds(block.recommendedTimeSeconds)} dim />
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotCls}`} />
                      <span className={`text-[11px] font-medium ${textCls}`}>{text}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Quiz performance ─────────────────────────────────────────────────── */}
      {hasAssessment && (
        <div className="overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/40">
          <div className="border-b border-slate-800/60 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Quiz performance
            </p>
          </div>

          {quizAttempts.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">No quiz attempts yet.</p>
          ) : (
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniCard label="Latest score"   value={fmtPercent(latestAttempt?.scorePercentage ?? null)} />
                <MiniCard label="Best score"     value={fmtPercent(bestScore)} />
                <MiniCard label="Total attempts" value={String(quizAttempts.length)} />
                <MiniCard label="Last attempted" value={fmtDateTime(latestAttempt?.timestamp ?? null)} small />
              </div>

              {latestAttempt && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowLatestResults((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-800/60 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700/80 hover:text-slate-100"
                  >
                    {showLatestResults ? (
                      <><ChevronUp className="h-3.5 w-3.5" /> Hide latest results</>
                    ) : (
                      <><ChevronDown className="h-3.5 w-3.5" /> View latest results</>
                    )}
                  </button>

                  {showLatestResults && (
                    <div className="mt-2.5 rounded-lg border border-slate-800/60 bg-slate-950/40 px-4 py-3">
                      <dl className="flex flex-wrap gap-x-8 gap-y-3">
                        <div>
                          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Score</dt>
                          <dd className="mt-0.5 text-sm font-semibold text-slate-100">
                            {fmtPercent(latestAttempt.scorePercentage)}
                          </dd>
                        </div>
                        {latestAttempt.correctCount !== null && latestAttempt.totalQuestions !== null && (
                          <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              Questions correct
                            </dt>
                            <dd className="mt-0.5 text-sm font-semibold text-slate-100">
                              {latestAttempt.correctCount} / {latestAttempt.totalQuestions}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Submitted</dt>
                          <dd className="mt-0.5 text-sm font-semibold text-slate-100">
                            {fmtDateTime(latestAttempt.timestamp)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  dimValue = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  dimValue?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-900/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </p>
      <p className={`mt-1 text-sm font-bold ${dimValue ? "text-slate-400" : "text-slate-100"}`}>
        {value}
      </p>
    </div>
  );
}

function Metric({ label, value, dim = false }: { label: string; value: string; dim?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${dim ? "text-slate-400" : "text-slate-100"}`}>{value}</p>
    </div>
  );
}

function MiniCard({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800/60 bg-slate-900/60 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 font-bold text-slate-100 ${small ? "text-[11px] leading-snug" : "text-sm"}`}>
        {value}
      </p>
    </div>
  );
}
