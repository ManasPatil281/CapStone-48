"use client";

import { useState } from "react";
import type { PlaygroundContent, PlaygroundPractice } from "@/types/learning";
import { Button } from "@/components/ui/button";

interface Props {
  data: PlaygroundContent;
}

export function CodePlayground({ data }: Props) {
  const [code, setCode] = useState(data.starter_code ?? "");
  const [selectedPractice, setSelectedPractice] = useState<PlaygroundPractice | undefined>(data.practices?.[0]);

  const runCode = () => {
    console.info("Executing code for practice", selectedPractice?.id);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Guided Practices</p>
        <div className="flex flex-col gap-2">
          {data.practices?.map((practice) => (
            <button
              key={practice.id}
              onClick={() => setSelectedPractice(practice)}
              className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-left text-sm hover:border-brand/40"
            >
              <p className="font-semibold text-white">{practice.title}</p>
              <p className="text-xs text-slate-400">{practice.description}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5">
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{selectedPractice?.title ?? "Starter"}</p>
          <p className="text-sm text-slate-400">Language · {data.language?.toUpperCase()}</p>
        </div>
        <textarea
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="h-64 w-full rounded-2xl bg-slate-900/70 p-4 font-mono text-sm text-slate-100"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={runCode}>Run Code</Button>
          {selectedPractice?.expected_output ? (
            <p className="text-xs text-slate-400">Expected: {selectedPractice.expected_output}</p>
          ) : null}
        </div>
        {selectedPractice?.hint ? <p className="text-xs text-brand-muted">Hint: {selectedPractice.hint}</p> : null}
      </div>
    </div>
  );
}
