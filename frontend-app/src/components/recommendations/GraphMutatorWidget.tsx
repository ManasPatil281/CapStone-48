"use client";

import { useState } from "react";
import { GitFork, Zap, FastForward, ShieldAlert, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GraphMutatorReport } from "@/lib/ai/agents/graph-mutator-agent";

export function GraphMutatorWidget() {
  const [report, setReport] = useState<GraphMutatorReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runMutationScan = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/ai/graph-mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentLoTitle: "Stack Operations & LIFO",
          masteryScore: 42,
          recentQuizScores: [35, 45],
        }),
      });
      const data = await res.json();
      setReport(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-slate-900/60 p-5 space-y-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/15">
            <GitFork className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Autonomous Learning Graph Mutator
              <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-300 border border-cyan-500/20">
                REAL-TIME GRAPH ADAPTATION
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Dynamically injects bridge nodes or fast-tracks topics based on your learning velocity.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          onClick={runMutationScan}
          disabled={isLoading}
          className="bg-cyan-600 text-slate-950 font-semibold hover:bg-cyan-500 text-xs"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Mutating Graph...
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Analyze Graph Velocity
            </>
          )}
        </Button>
      </div>

      {report && (
        <div className="space-y-3 text-xs animate-in fade-in-50">
          <div className="flex items-center justify-between rounded-lg bg-slate-950/80 p-3 border border-slate-800">
            <span className="text-slate-400">Learning Velocity Rating</span>
            <span className="font-bold text-cyan-400 font-mono">{report.learningVelocityScore}/100</span>
          </div>

          <p className="text-slate-300 italic">{report.mutationSummary}</p>

          <div className="space-y-2">
            {report.suggestedGraphMutations.map((mut, idx) => (
              <div
                key={idx}
                className={`rounded-lg border p-3 ${
                  mut.actionType === "SCAFFOLD"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                    : mut.actionType === "FAST_TRACK"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-800 bg-slate-950/50 text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>Action: {mut.actionType}</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                    {mut.nodeTitle}
                  </span>
                </div>
                <p className="mt-1 text-[11px] opacity-90">{mut.reason}</p>

                {mut.injectedMicroPrerequisites && mut.injectedMicroPrerequisites.length > 0 && (
                  <div className="mt-2 space-y-1 pt-2 border-t border-amber-500/20">
                    <span className="font-semibold text-[10px] uppercase tracking-wider text-amber-300">
                      Injected Scaffold Nodes:
                    </span>
                    {mut.injectedMicroPrerequisites.map((p, pIdx) => (
                      <div key={pIdx} className="flex justify-between text-[11px] bg-slate-950/60 p-1.5 rounded">
                        <span>➕ {p.title}</span>
                        <span className="text-slate-400 font-mono">{p.estimatedMinutes}m</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
