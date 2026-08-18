"use client";

import { useState } from "react";
import { Clock, RotateCcw, BrainCircuit, Sparkles, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ReviewItem {
  loTitle: string;
  submissionId: string;
  retentionPercent: number;
  status: "URGENT" | "SCHEDULED" | "STRONG";
  daysSinceLastReview: number;
}

export function SpacedRepetitionWidget() {
  const [items] = useState<ReviewItem[]>([
    {
      loTitle: "Stack Data Structure & Operations",
      submissionId: "84065e8a-5475-42b7-8e57-e7cea66a9bfa",
      retentionPercent: 42,
      status: "URGENT",
      daysSinceLastReview: 5,
    },
    {
      loTitle: "Queue & Circular Queue",
      submissionId: "queue-sub-002",
      retentionPercent: 68,
      status: "SCHEDULED",
      daysSinceLastReview: 3,
    },
    {
      loTitle: "Array Traversal & Inversion",
      submissionId: "array-sub-003",
      retentionPercent: 91,
      status: "STRONG",
      daysSinceLastReview: 1,
    },
  ]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/15">
            <Clock className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Revision reminder agent
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[9px] font-semibold text-indigo-300 border border-indigo-500/20">
                MEMORY CHECK
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              This agent checks how well you remember topics and reminds you before learning fades.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 text-xs"
          >
            <div className="space-y-1">
              <div className="font-semibold text-slate-200">{item.loTitle}</div>
              <div className="text-[10px] text-slate-400">
                Last revised {item.daysSinceLastReview} days ago
              </div>
            </div>

            {/* Retention Bar */}
            <div className="flex items-center gap-3 w-48">
              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    item.retentionPercent < 50
                      ? "bg-red-500"
                      : item.retentionPercent < 80
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${item.retentionPercent}%` }}
                />
              </div>
              <span className="font-mono text-[11px] text-slate-300 w-9">
                {item.retentionPercent}%
              </span>
            </div>

            {/* Action */}
            {item.status === "URGENT" ? (
              <Link href={`/courses/dsa/submission/${item.submissionId}`}>
                <Button size="sm" className="h-7 text-[11px] bg-red-600 hover:bg-red-500 text-white gap-1">
                  <RotateCcw className="h-3 w-3" /> Revise now
                </Button>
              </Link>
            ) : (
              <span className="text-[10px] text-slate-500 font-medium px-2 py-1 rounded bg-slate-900 border border-slate-800">
                Good timing
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
