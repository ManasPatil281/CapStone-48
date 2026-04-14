"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List
    className={cn("inline-flex items-center gap-1.5 rounded-full bg-slate-800/50 p-1.5 ring-1 ring-slate-700/50", className)}
    {...props}
  />
);

export const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn(
      "inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-slate-400 transition-all duration-150",
      "hover:text-slate-200",
      "data-[state=active]:bg-brand/10 data-[state=active]:text-brand data-[state=active]:ring-1 data-[state=active]:ring-brand/25",
      className
    )}
    {...props}
  />
);

export const TabsContent = ({ className, ...props }: TabsPrimitive.TabsContentProps) => (
  <TabsPrimitive.Content className={cn("mt-5 focus-visible:outline-none", className)} {...props} />
);
