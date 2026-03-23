import { cn } from "@/lib/utils";

const statusMap = [
  { label: "Not Started", color: "bg-mastery-idle/20 text-mastery-idle" },
  { label: "In Progress", color: "bg-mastery-progress/20 text-mastery-progress" },
  { label: "Completed", color: "bg-slate-800 text-slate-100" },
  { label: "Mastered", color: "bg-mastery-mastered/20 text-mastery-mastered" }
];

export function MasteryBadge({ masteryScore }: { masteryScore: number }) {
  const state = masteryScore > 80 ? 3 : masteryScore > 50 ? 2 : masteryScore > 0 ? 1 : 0;
  const { label, color } = statusMap[state];
  return <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", color)}>{label}</span>;
}
