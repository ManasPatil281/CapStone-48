import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "rounded-full border border-slate-700/60 bg-slate-800/60 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-label text-slate-400",
        className
      )}
      {...props}
    />
  );
}
