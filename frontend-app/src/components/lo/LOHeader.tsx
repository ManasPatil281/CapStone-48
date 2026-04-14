import { minutesToLabel, cn } from "@/lib/utils";
import type { LearningObjectDetail } from "@/types/learning";
import { Badge } from "@/components/ui/badge";
import { MasteryBadge } from "@/components/lo/MasteryBadge";
import { Progress } from "@/components/ui/progress";
import { Clock, Zap } from "lucide-react";

interface Props {
  lo: LearningObjectDetail;
}

const difficultyDots = (level: number) =>
  Array.from({ length: 5 }, (_, idx) => (
    <span
      key={idx}
      className={cn(
        "h-1.5 w-1.5 rounded-full transition-colors",
        idx < level ? "bg-brand" : "bg-slate-700"
      )}
    />
  ));

export function LOHeader({ lo }: Props) {
  const mastery = lo.progress?.mastery_score ?? 0;

  const masteryLabel =
    mastery > 80 ? "Mastered" : mastery > 50 ? "On track" : mastery > 0 ? "Getting started" : "Not yet started";

  return (
    <header className="overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/60 shadow-card backdrop-blur-[1px]">
      {/* Top content area */}
      <div className="p-7 pb-6">
        {/* Breadcrumb + badge row */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-label text-slate-600">
            DSA · Learning Objective
          </p>
          <Badge className="border-brand/25 bg-brand/10 text-brand">
            {lo.status?.toUpperCase()}
          </Badge>
        </div>

        {/* Title */}
        <h1 className="mb-3 text-3xl font-bold leading-tight tracking-tight text-slate-50 sm:text-4xl">
          {lo.title}
        </h1>

        {/* Description */}
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
          {lo.description}
        </p>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-800/60 px-3 py-1 text-xs text-slate-400">
            <Clock className="h-3 w-3 text-slate-600" />
            {minutesToLabel(lo.estimated_time_minutes)}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-800/60 px-3 py-1 text-xs text-slate-400">
            <Zap className="h-3 w-3 text-slate-600" />
            Level {lo.difficulty_level}/5
            <span className="ml-1 flex items-center gap-0.5">
              {difficultyDots(lo.difficulty_level)}
            </span>
          </span>
        </div>
      </div>

      {/* ── Mastery footer ── */}
      <div className="border-t border-slate-800/70 bg-slate-950/40 px-7 py-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-6">
          {/* Label */}
          <div className="flex items-center justify-between gap-4 sm:contents">
            <span className="text-xs font-semibold uppercase tracking-label text-slate-600">
              Mastery
            </span>
            <MasteryBadge masteryScore={mastery} />
          </div>

          {/* Progress bar + score */}
          <div className="flex flex-1 items-center gap-3">
            <Progress value={mastery} className="h-1.5 flex-1" />
            <span className="w-12 text-right text-sm font-bold tabular-nums text-brand">
              {Math.round(mastery)}%
            </span>
          </div>

          {/* Label */}
          <span className="hidden text-xs text-slate-600 sm:block">{masteryLabel}</span>
        </div>
      </div>
    </header>
  );
}
