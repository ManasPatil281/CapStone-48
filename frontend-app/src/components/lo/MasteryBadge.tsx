import { cn } from "@/lib/utils";

const statusMap = [
  {
    label: "Not Started",
    color: "border-slate-700/50 bg-slate-800/50 text-slate-500"
  },
  {
    label: "In Progress",
    color: "border-mastery-progress/25 bg-mastery-progress/10 text-mastery-progress"
  },
  {
    label: "Completed",
    color: "border-slate-600/40 bg-slate-800/70 text-slate-300"
  },
  {
    label: "Mastered",
    color: "border-mastery-mastered/25 bg-mastery-mastered/10 text-mastery-mastered"
  }
];

export function MasteryBadge({ masteryScore }: { masteryScore: number }) {
  const state = masteryScore > 80 ? 3 : masteryScore > 50 ? 2 : masteryScore > 0 ? 1 : 0;
  const { label, color } = statusMap[state];

  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-label",
        color
      )}
    >
      {label}
    </span>
  );
}
