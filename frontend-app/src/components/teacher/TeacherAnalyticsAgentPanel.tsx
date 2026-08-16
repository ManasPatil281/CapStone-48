"use client";

import { useState } from "react";
import {
  BrainCircuit,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  TrendingDown,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CourseAnalyticsReport } from "@/lib/ai/agents/course-analytics-agent";

export function TeacherAnalyticsAgentPanel() {
  const [report, setReport] = useState<CourseAnalyticsReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/analytics-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseTitle: "Data Structures & Algorithms" }),
      });
      if (!res.ok) throw new Error("Failed to generate analytics");
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || "Failed to contact analytics agent");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand/20 bg-slate-900/60 p-6 shadow-card backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand/30 bg-brand/15">
            <BrainCircuit className="h-5 w-5 text-brand" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-50 flex items-center gap-2">
              Instructor Analytics Agent
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                AI CO-PILOT
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Autonomously scans student drop-off curves and proposes course content updates.
            </p>
          </div>
        </div>

        <Button
          onClick={runAnalysis}
          disabled={isLoading}
          className="bg-brand text-slate-950 font-semibold hover:bg-brand-hover"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Scanning Student Signals...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Run Agent Scan
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {report && (
        <div className="mt-6 space-y-6 animate-in fade-in-50">
          {/* Health Bar */}
          <div className="flex items-center justify-between rounded-lg bg-slate-950/80 p-4 border border-slate-800">
            <div>
              <span className="text-xs text-slate-400">Overall Course Health</span>
              <div className="text-2xl font-bold text-slate-50">{report.courseHealthScore}%</div>
            </div>
            <p className="text-xs text-slate-300 max-w-md">{report.summary}</p>
          </div>

          {/* Flagged Insights */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Bottleneck Learning Objects ({report.flaggedInsights.length})
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              {report.flaggedInsights.map((insight, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">{insight.loTitle}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase ${
                        insight.severity === "CRITICAL"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : insight.severity === "WARNING"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      }`}
                    >
                      {insight.severity}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 flex items-start gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                    {insight.issueDescription}
                  </p>

                  <div className="rounded-lg bg-brand/10 border border-brand/20 p-2 text-[11px] text-brand-light">
                    💡 <strong>Suggested Fix:</strong> {insight.suggestedAction}
                  </div>

                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                    <span>Impact: {insight.impactEstimate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
