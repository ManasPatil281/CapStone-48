"use client";

import { useState } from "react";
import { MessageSquare, Users, Sparkles, X, ShieldAlert, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MockInterviewTurn } from "@/lib/ai/agents/mock-interviewer-agent";

interface TechnicalVivaModalProps {
  isOpen: boolean;
  onClose: () => void;
  loTitle: string;
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function TechnicalVivaModal({ isOpen, onClose, loTitle }: TechnicalVivaModalProps) {
  const [turn, setTurn] = useState<MockInterviewTurn | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [history, setHistory] = useState<Array<{ role: string; text: string }>>([]);

  const startViva = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/ai/viva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loTitle, previousTurnCount: history.length }),
      });
      const data = await res.json();
      setTurn(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in-50">
      <div className="relative w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/50 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/15 shadow-inner">
              <Users className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Multi-Agent Technical Viva Panel
                <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase text-indigo-300 border border-indigo-500/20">
                  DUAL INTERVIEWER
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">Technical Interviewer + Bar Raiser Agents</p>
            </div>
          </div>

          <button onClick={onClose} className="rounded-xl border border-slate-800 p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto max-h-[75vh]">
          {!turn && !isLoading && (
            <div className="text-center py-12 space-y-6 max-w-lg mx-auto">
              <p className="text-sm text-slate-300 leading-relaxed">
                Ready to test your technical depth on <strong className="text-indigo-300">{loTitle}</strong> with a live dual-interviewer AI panel? The Bar Raiser will push back on edge cases!
              </p>
              <Button onClick={startViva} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-6 h-auto text-base rounded-full shadow-lg shadow-indigo-900/50">
                <Sparkles className="mr-2 h-5 w-5" /> Begin Viva Interview
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4 text-slate-400 text-sm">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
              <span>Dual-Agent Panel preparing question & edge-case pushback...</span>
            </div>
          )}

          {turn && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 fade-in duration-500">
              {/* Primary Interviewer Question */}
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5 space-y-3 shadow-inner relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                <div className="font-bold text-indigo-300 uppercase tracking-widest text-[11px] flex items-center gap-2">
                  <span className="text-base">🎙️</span> Technical Interviewer Agent
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-slate-100">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.interviewerQuestion}</ReactMarkdown>
                </div>
              </div>

              {/* Bar Raiser Pushback */}
              <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-5 space-y-3 shadow-inner relative overflow-hidden">
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none" />
                <div className="font-bold text-purple-300 uppercase tracking-widest text-[11px] flex items-center gap-2">
                  <span className="text-base">⚡</span> Bar Raiser Agent (Edge-Case Pushback)
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-purple-200 italic">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.barRaiserPushback}</ReactMarkdown>
                </div>
              </div>

              {/* Response Input */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Technical Response</p>
                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="Type your technical explanation answering both agents..."
                  className="w-full h-32 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 text-sm placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none transition-all shadow-inner"
                />
                <div className="flex justify-end pt-2">
                  <Button onClick={startViva} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 h-10 shadow-md">
                    Submit & Next Turn <Send className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
