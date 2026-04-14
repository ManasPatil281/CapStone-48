import { cn } from "@/lib/utils";

const statusMap = [
  { label: "Not Started", color: "border border-slate-700/60 bg-slate-800/60 text-slate-400" },
  { label: "In Progress", color: "border border-mastery-progress/30 bg-mastery-progress/10 text-mastery-progress" },
  { label: "Completed",   color: "border border-slate-600/50 bg-slate-800 text-slate-200" },
  { label: "Mastered",    color: "border border-mastery-mastered/30 bg-mastery-mastered/10 text-mastery-mastered" }
];

export function MasteryBadge({ masteryScore }: { masteryScore: number }) {
  const state = masteryScore > 80 ? 3 : masteryScore > 50 ? 2 : masteryScore > 0 ? 1 : 0;
  const { label, color } = statusMap[state];
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", color)}>
      {label}
    </span>
  );
}
