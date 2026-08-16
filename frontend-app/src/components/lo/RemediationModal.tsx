"use client";

import { useState } from "react";
import { Sparkles, BrainCircuit, X, CheckCircle2, HelpCircle, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RemediationMicroLesson } from "@/lib/ai/agents/remediation-agent";

interface RemediationModalProps {
  isOpen: boolean;
  onClose: () => void;
  loTitle: string;
  userMasteryScore?: number;
  failedQuestions?: string[];
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function RemediationModal({
  isOpen,
  onClose,
  loTitle,
  userMasteryScore,
  failedQuestions,
}: RemediationModalProps) {
  const [lesson, setLesson] = useState<RemediationMicroLesson | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const fetchLesson = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/ai/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loTitle, userMasteryScore, failedQuestions }),
      });
      if (!res.ok) throw new Error("Failed to fetch lesson");
      const data = await res.json();
      setLesson(data);
      setCurrentStep(0);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in-50">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/50 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 shadow-inner">
              <BrainCircuit className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Autonomous Remediation Agent
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Targeted micro-lesson for "{loTitle}"</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 overflow-y-auto max-h-[70vh]">
          {!lesson && !isLoading && (
            <div className="text-center py-10 space-y-5">
              <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                Our AI agent has detected a learning gap on <strong>{loTitle}</strong>. Would you like a personalized 3-card micro-lesson to fix this misconception?
              </p>
              <Button
                onClick={fetchLesson}
                className="bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 px-6 py-4 h-auto text-sm"
              >
                <Sparkles className="mr-2 h-4 w-4" /> Generate 3-Card Micro-Lesson
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4 text-slate-400 text-sm">
              <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
              <span>Synthesizing custom explanation & mental model...</span>
            </div>
          )}

          {lesson && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 fade-in duration-500">
              {/* Step Indicator */}
              <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-3">
                <span className="font-medium tracking-wide">Card {currentStep + 1} of {lesson.cards.length}</span>
                <span className="font-bold text-amber-400 uppercase tracking-wider bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20">
                  {lesson.cards[currentStep].contentType.replace("_", " ")}
                </span>
              </div>

              {/* Card Content */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-6 space-y-4 shadow-inner min-h-[250px]">
                <h4 className="text-lg font-bold text-slate-50">
                  {lesson.cards[currentStep].title}
                </h4>
                <div className="prose prose-invert prose-sm max-w-none text-slate-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {lesson.cards[currentStep].markdownText}
                  </ReactMarkdown>
                </div>

                {/* Multiple Choice Options if Card 3 */}
                {lesson.cards[currentStep].options && (
                  <div className="space-y-3 pt-4">
                    {lesson.cards[currentStep].options?.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedOption(idx)}
                        className={`w-full text-left p-4 rounded-xl border text-sm transition-all shadow-sm ${
                          selectedOption === idx
                            ? idx === lesson.cards[currentStep].correctOptionIndex
                              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100"
                              : "border-red-500/50 bg-red-500/15 text-red-100"
                            : "border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <span className="font-bold mr-3">{String.fromCharCode(65 + idx)}.</span> {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        {lesson && (
          <div className="flex justify-between items-center p-6 border-t border-slate-800 bg-slate-950/50">
            <Button
              variant="outline"
              size="sm"
              disabled={currentStep === 0}
              onClick={() => setCurrentStep((p) => p - 1)}
              className="text-sm px-6 border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Previous Card
            </Button>

            {currentStep < lesson.cards.length - 1 ? (
              <Button
                size="sm"
                onClick={() => setCurrentStep((p) => p + 1)}
                className="text-sm px-6 bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
              >
                Next Card <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onClose}
                className="text-sm px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md"
              >
                Complete Remediation <CheckCircle2 className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
