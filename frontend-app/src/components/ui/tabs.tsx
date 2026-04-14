"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List
    className={cn(
      "inline-flex items-center gap-1 rounded-full bg-slate-900/80 p-1 ring-1 ring-slate-800/80",
      className
    )}
    {...props}
  />
);

export const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn(
      "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium text-slate-500 transition-all duration-150",
      "hover:text-slate-300",
      "data-[state=active]:bg-brand data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-brand/30",
      className
    )}
    {...props}
  />
);

export const TabsContent = ({ className, ...props }: TabsPrimitive.TabsContentProps) => (
  <TabsPrimitive.Content
    className={cn("mt-5 focus-visible:outline-none", className)}
    {...props}
  />
);
