import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "rounded-full border border-slate-700/70 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
        className
      )}
      {...props}
    />
  );
}
