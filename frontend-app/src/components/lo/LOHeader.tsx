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
    <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/70 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-slate-400">DSA · Learning Objective</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-white">{lo.title}</h1>
          <Badge className="border-brand/30 text-brand">{lo.status?.toUpperCase()}</Badge>
        </div>
        <p className="mt-3 max-w-2xl text-slate-300">{lo.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-6 text-sm text-slate-400">
          <span>Est. Time · {minutesToLabel(lo.estimated_time_minutes)}</span>
          <span className="flex items-center gap-2">Difficulty · {difficultyDots(lo.difficulty_level)}</span>
        </div>
      </div>
      <div className="flex w-full flex-col gap-3 sm:max-w-xs">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Mastery</span>
          <MasteryBadge masteryScore={mastery} />
        </div>
        <Progress value={mastery} />
        <span className="text-right text-xs text-slate-500">{mastery}%</span>
      </div>
    </header>
  );
}
