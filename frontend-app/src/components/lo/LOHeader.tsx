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
    <span key={idx} className={cn("h-1.5 w-1.5 rounded-full", idx < level ? "bg-brand" : "bg-slate-700")} />
  ));

export function LOHeader({ lo }: Props) {
  const mastery = lo.progress?.mastery_score ?? 0;

  const masteryLabel =
    mastery > 80 ? "Mastered" : mastery > 50 ? "On track" : "Getting started";

  return (
    <header className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-sm shadow-black/40 sm:flex-row sm:items-start sm:justify-between lg:items-center">
      {/* Left: title + meta */}
      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            DSA · Learning Objective
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-3xl">
              {lo.title}
            </h1>
            <Badge className="border-brand/30 bg-brand/10 text-brand">
              {lo.status?.toUpperCase()}
            </Badge>
          </div>
        </div>

        <p className="max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
          {lo.description}
        </p>

        <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
            Est. {minutesToLabel(lo.estimated_time_minutes)}
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
            Level {lo.difficulty_level}/5
            <span className="ml-1 flex items-center gap-0.5">
              {difficultyDots(lo.difficulty_level)}
            </span>
          </span>
        </div>
      </div>

      {/* Right: mastery panel */}
      <div className="flex w-full flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:w-auto sm:min-w-[220px] sm:max-w-xs">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Mastery</span>
          <MasteryBadge masteryScore={mastery} />
        </div>
        <Progress value={mastery} className="h-1.5" />
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-brand">{Math.round(mastery)}%</span>
          <span className="text-xs text-slate-600">{masteryLabel}</span>
        </div>
      </div>
    </header>
  );
}
