"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sparkles,
  Bot,
  Compass,
  Zap,
  X,
  Send,
  Loader2,
  ChevronRight,
  ShieldAlert,
  BrainCircuit,
  MessageSquare,
  HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AgentMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  action?: {
    type: "navigate" | "remediate" | "quiz" | "inspect";
    target?: string;
    label?: string;
  };
}

export function AgentModeOverlay() {
  const [isActive, setIsActive] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: "welcome",
      role: "agent",
      text: "🤖 **Agent Mode Active**. I am your platform co-pilot.\n\nI monitor your progress, auto-navigate courses, run multi-agent debates, and generate instant micro-lessons.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const pathname = usePathname();
  const router = useRouter();

  // Listen for agent mode toggle key (Ctrl+K or Alt+A)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsActive((prev) => !prev);
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // Dynamic routing/action logic
      const lower = text.toLowerCase();

      if (lower.includes("recommend") || lower.includes("next")) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "agent",
            text: "Navigating to your AI Recommendations page...",
            action: { type: "navigate", target: "/recommendations", label: "Open Recommendations" },
          },
        ]);
        setTimeout(() => router.push("/recommendations"), 800);
      } else if (lower.includes("dsa") || lower.includes("stack") || lower.includes("course")) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "agent",
            text: "Opening DSA Course page...",
            action: { type: "navigate", target: "/courses/dsa", label: "Go to DSA Course" },
          },
        ]);
        setTimeout(() => router.push("/courses/dsa"), 800);
      } else if (lower.includes("teacher") || lower.includes("analytics")) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "agent",
            text: "Opening Teacher Analytics Agent interface...",
            action: { type: "navigate", target: "/teacher", label: "Go to Teacher Dashboard" },
          },
        ]);
        setTimeout(() => router.push("/teacher"), 800);
      } else {
        // Send to general agent chat endpoint
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            context: {
              courseTitle: "Global Platform Context",
              loTitle: `Current Page: ${pathname}`,
              submissionTitle: `Viewing ${pathname}`,
              submissionId: "global-session",
              teachingBlocks: [],
            },
          }),
        });

        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "agent",
            text: data.reply || "Agent ready to assist on this page.",
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent",
          text: "Agent encountered a connection error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button (Always visible on all pages) */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
        <button
          onClick={() => {
            setIsActive(true);
            setIsOpen((prev) => !prev);
          }}
          className={`group relative flex h-14 items-center gap-3 rounded-full px-6 text-sm font-bold shadow-2xl transition-all duration-300 ${
            isActive
              ? "border border-emerald-500/50 bg-slate-900/95 text-emerald-400 shadow-emerald-900/30 backdrop-blur-xl hover:border-emerald-400 hover:bg-slate-900"
              : "border border-brand/40 bg-slate-900/95 text-brand shadow-brand/20 backdrop-blur-xl hover:bg-slate-800"
          }`}
        >
          <div className="relative flex h-6 w-6 items-center justify-center">
            {isActive && (
              <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
            )}
            <BrainCircuit className={`h-5 w-5 ${isActive ? "text-emerald-400" : "text-brand"}`} />
          </div>
          <span>{isActive ? "CO-PILOT ACTIVE" : "ENABLE CO-PILOT"}</span>
          <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-400 font-mono tracking-widest border border-slate-700/50">
            Ctrl+J
          </span>
        </button>
      </div>

      {/* Ambient Glow HUD when Agent Mode is Active */}
      {isActive && (
        <div className="pointer-events-none fixed top-0 left-0 right-0 z-40 flex h-1.5 bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500 animate-pulse shadow-emerald-500/50" />
      )}

      {/* Agent Mode Drawer / Popup Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] sm:w-[450px] rounded-3xl border border-slate-800 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-2xl transition-all animate-in slide-in-from-bottom-8">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 shadow-inner">
                <Sparkles className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-widest">
                  Agent Co-pilot
                </h3>
                <p className="text-[11px] text-slate-400 truncate max-w-[200px]">Context: {pathname}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsActive((prev) => !prev)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                {isActive ? "Disable" : "Enable"}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors border border-transparent hover:border-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="my-4 flex flex-wrap gap-2">
            <button
              onClick={() => {
                setInput("Recommend my next learning path");
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700 hover:border-slate-600 transition-colors shadow-sm"
            >
              <Compass className="h-3.5 w-3.5 text-cyan-400" /> Next path
            </button>

            <button
              onClick={() => {
                setInput("Quiz me on this page");
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700 hover:border-slate-600 transition-colors shadow-sm"
            >
              <Zap className="h-3.5 w-3.5 text-amber-400" /> Quick Quiz
            </button>

            <button
              onClick={() => {
                router.push("/teacher");
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700 hover:border-slate-600 transition-colors shadow-sm"
            >
              <BrainCircuit className="h-3.5 w-3.5 text-emerald-400" /> Teacher Mode
            </button>
          </div>

          {/* Messages Feed */}
          <div className="max-h-72 space-y-4 overflow-y-auto pr-2 text-sm pb-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-2xl p-4 shadow-sm ${
                  m.role === "user"
                    ? "ml-auto max-w-[85%] bg-emerald-500/20 border border-emerald-500/40 text-slate-50"
                    : "bg-slate-800/80 border border-slate-700 text-slate-200"
                }`}
              >
                <div className="mb-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                  {m.role === "user" ? "You" : "Co-Pilot Agent"}
                </div>
                <div className={`prose prose-invert prose-sm max-w-none ${m.role === "user" ? "text-slate-100" : "text-slate-300"}`}>
                  {m.role === "user" ? (
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                  )}
                </div>

                {m.action && (
                  <Button
                    size="sm"
                    className="mt-3 text-[11px] font-bold border-emerald-500/50 text-emerald-100 hover:bg-emerald-500/20 bg-emerald-500/10"
                    onClick={() => m.action?.target && router.push(m.action.target)}
                  >
                    {m.action.label || "Take Action"}
                    <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-3 rounded-2xl bg-slate-800/50 border border-slate-700 p-4 text-slate-300 text-sm shadow-sm animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span className="font-medium">Agent reasoning across system state...</span>
              </div>
            )}
          </div>

          {/* Input Box */}
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Command the platform agent..."
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all shadow-inner"
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-5 h-auto"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
