"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatHistoryMessage, SubmissionChatContext } from "@/lib/ai/types";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";

interface Props {
  context: SubmissionChatContext;
}

type UiMessage = ChatHistoryMessage & { id: string };

export function SubmissionChatPanel({ context }: Props) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const starterPrompts = useMemo(
    () => [
      "Explain this LO simply.",
      "Summarize this concept in 5 points.",
      "What are the prerequisites for this topic?",
      "Quiz me on this LO."
    ],
    []
  );

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();

    if (!text) {
      setError("Type a question before sending.");
      return;
    }

    setError(null);
    setInput("");

    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text
    };

    const updatedMessages = [...messages, userMessage].slice(-20);
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          context,
          history: updatedMessages.map((msg) => ({ role: msg.role, content: msg.content }))
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to get assistant response.");
      }

      const assistantMessage: UiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: typeof payload.reply === "string" ? payload.reply : "I could not generate a response right now."
      };

      setMessages((prev) => [...prev, assistantMessage].slice(-20));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong while chatting.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  function handlePromptClick(prompt: string) {
    setInput(prompt);
    setError(null);
  }

  return (
    <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 sm:p-5 backdrop-blur-[1px] space-y-4">
      <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/50 px-4 py-3">
        <div className="flex items-start gap-2">
          <Bot className="mt-0.5 h-4 w-4 text-brand" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-100">LO Chat Assistant</p>
            <p className="text-xs text-slate-400">
              Context: {context.loTitle} in {context.courseTitle}
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
            Ask anything about this learning object. I will stay grounded in the current submission context.
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${{
                user: "ml-auto max-w-[90%] border border-brand/30 bg-brand/15 text-slate-100",
                assistant: "max-w-[95%] border border-slate-800 bg-slate-950/60 text-slate-200"
              }[message.role]}`}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {message.role === "user" ? "You" : "Assistant"}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))
        )}

        {isLoading && (
          <div className="max-w-[95%] rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking...
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handlePromptClick(prompt)}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
              disabled={isLoading}
            >
              <Sparkles className="h-3 w-3" />
              {prompt}
            </button>
          ))}
        </div>

        <form onSubmit={submitMessage} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about this LO..."
            disabled={isLoading}
            maxLength={500}
            aria-label="Ask the LO assistant"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} className="sm:min-w-28">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </form>

        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    </section>
  );
}
