"use client";

import { useState } from "react";
import { FileText, Sparkles, Loader2, Code, CheckCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeneratedCoursePackage } from "@/lib/ai/agents/course-authoring-agent";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function CourseAuthoringAgentPanel() {
  const [topic, setTopic] = useState("");
  const [pkg, setPkg] = useState<GeneratedCoursePackage | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const generatePackage = async () => {
    if (!topic.trim() || isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/teacher/authoring-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicTitle: topic.trim() }),
      });
      const data = await res.json();
      setPkg(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand/20 bg-slate-900/60 p-6 space-y-6 shadow-card transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 shadow-inner">
            <FileText className="h-6 w-6 text-brand" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Automated Course Authoring Assistant
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase text-brand border border-brand/20">
                1-Click Creator
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Instantly generate comprehensive learning modules, including notes, code, and quizzes.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a topic (e.g. Graph Breadth-First Search)..."
          className="flex-1 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-all shadow-inner"
        />
        <Button
          onClick={generatePackage}
          disabled={isLoading || !topic.trim()}
          className="bg-brand text-slate-950 font-bold hover:bg-brand-hover text-sm px-6 py-3 h-auto"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Author Learning Object
            </>
          )}
        </Button>
      </div>

      {pkg && (
        <div className="space-y-6 pt-4 border-t border-slate-800 animate-in slide-in-from-bottom-4 fade-in duration-500">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-xl bg-slate-950/50 p-4 border border-slate-800/80 gap-4">
            <div>
              <h4 className="font-bold text-slate-50 text-lg">{pkg.title}</h4>
              <p className="text-slate-400 text-sm mt-1">{pkg.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-brand bg-brand/10 px-3 py-1.5 rounded-lg text-xs font-bold border border-brand/20">
                Difficulty Level {pkg.targetDifficultyLevel}/5
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-xl bg-slate-950/50 p-5 border border-slate-800/80 space-y-3">
              <span className="font-bold text-slate-300 uppercase text-[11px] tracking-wider flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Concept Notes Preview
              </span>
              <div className="prose prose-invert prose-sm max-w-none text-slate-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {pkg.conceptNotesMarkdown}
                </ReactMarkdown>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl bg-slate-950/50 p-5 border border-slate-800/80 space-y-3">
                <span className="font-bold text-slate-300 uppercase text-[11px] tracking-wider flex items-center gap-2">
                  <Code className="w-3.5 h-3.5" /> Starter Code ({pkg.starterCode.language})
                </span>
                <pre className="text-xs bg-slate-900 p-3 rounded-lg overflow-x-auto border border-slate-800 text-slate-300 font-mono">
                  {pkg.starterCode.code}
                </pre>
              </div>

              <div className="rounded-xl bg-slate-950/50 p-5 border border-slate-800/80 space-y-3">
                <span className="font-bold text-slate-300 uppercase text-[11px] tracking-wider flex items-center gap-2">
                  <HelpCircle className="w-3.5 h-3.5" /> Generated Quiz
                </span>
                <div className="space-y-3">
                  {pkg.quizQuestions.slice(0, 2).map((q, i) => (
                    <div key={i} className="text-xs p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                      <p className="font-semibold text-slate-200 mb-2">Q{i + 1}: {q.questionText}</p>
                      <ul className="space-y-1 text-slate-400 list-disc pl-4">
                        {q.options.slice(0, 2).map((opt, j) => (
                          <li key={j} className={j === q.correctOptionIndex ? "text-emerald-400" : ""}>{opt}</li>
                        ))}
                        {q.options.length > 2 && <li className="italic text-slate-500">...and {q.options.length - 2} more options</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center text-slate-400 text-sm p-4 bg-slate-950/30 rounded-xl border border-slate-800">
            <span>Successfully generated {pkg.quizQuestions.length} Bloom&apos;s taxonomy questions, notes, and code.</span>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
              <CheckCircle className="mr-2 h-4 w-4" /> Save to Drafts
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
