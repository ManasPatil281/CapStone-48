import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-wide", className)} {...props} />;
}
