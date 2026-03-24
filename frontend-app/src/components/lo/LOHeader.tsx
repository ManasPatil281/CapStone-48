import { minutesToLabel, cn } from "@/lib/utils";
import type { LearningObjectDetail } from "@/types/learning";
import { Badge } from "@/components/ui/badge";
import { MasteryBadge } from "@/components/lo/MasteryBadge";
import { Progress } from "@/components/ui/progress";

interface Props {
  lo: LearningObjectDetail;
}

const difficultyDots = (level: number) =>
  Array.from({ length: 5 }, (_, idx) => (
    <span key={idx} className={cn("h-2 w-2 rounded-full", idx < level ? "bg-brand" : "bg-slate-800")} />
  ));

export function LOHeader({ lo }: Props) {
  const mastery = lo.progress?.mastery_score ?? 0;
  return (
    <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-900/50 p-6 shadow-lg shadow-black/30 sm:flex-row sm:items-start sm:justify-between lg:items-center">
      <div className="flex-1 space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-slate-500">DSA · Learning Objective</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-100 to-slate-300 sm:text-4xl">
              {lo.title}
            </h1>
            <Badge className="border-brand/30 bg-brand/10 text-brand whitespace-nowrap">{lo.status?.toUpperCase()}</Badge>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-slate-300 sm:text-base sm:max-w-2xl">{lo.description}</p>
        <div className="flex flex-col gap-2 pt-2 text-xs text-slate-400 sm:flex-row sm:gap-6 sm:text-sm">
          <span className="flex items-center gap-2">
            <span className="text-slate-500">⏱️</span>
            Est. {minutesToLabel(lo.estimated_time_minutes)}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-slate-500">⚡</span>
            Level {lo.difficulty_level}/5
            <div className="flex items-center gap-1 ml-1">
              {difficultyDots(lo.difficulty_level)}
            </div>
          </span>
        </div>
      </div>
      <div className="flex w-full flex-col gap-3 rounded-2xl bg-slate-900/60 p-4 sm:w-auto sm:max-w-xs lg:min-w-[240px]">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide">
          <span>Mastery Progress</span>
          <MasteryBadge masteryScore={mastery} />
        </div>
        <Progress value={mastery} className="h-2" />
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-brand">{Math.round(mastery)}%</span>
          <span className="text-xs text-slate-500">
            {mastery > 80 ? "🎓 Mastered!" : mastery > 50 ? "📈 On track" : "🚀 Getting started"}
          </span>
        </div>
      </div>
    </header>
  );
}
