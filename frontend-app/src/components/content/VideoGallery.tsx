"use client";

import { useState } from "react";
import type { LearningObjectContent, VideoContent } from "@/types/learning";
import { VideoPlayer } from "@/components/content/VideoPlayer";
import { cn } from "@/lib/utils";

interface Props {
  items: LearningObjectContent[];
}

export function VideoGallery({ items }: Props) {
  const [activeId, setActiveId] = useState(items[0]?.id);
  const active = items.find((entry) => entry.id === activeId) ?? items[0];

  if (!active) {
    return <p className="text-sm text-slate-400">No videos available.</p>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_1.2fr]">
      <VideoPlayer title={active.title} data={active.content_json as VideoContent} />
      {items.length > 1 ? (
        <aside className="rounded-3xl border border-white/5 bg-slate-900/40 p-4">
          <p className="text-sm font-semibold text-slate-200">Playlist</p>
          <div className="mt-3 flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
            {items.map((video, index) => {
              const isActive = video.id === active.id;
              return (
                <button
                  key={video.id}
                  onClick={() => setActiveId(video.id)}
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-left transition",
                    isActive ? "border-brand bg-brand/10" : "border-white/5 hover:border-brand/40"
                  )}
                >
                  <p className="text-sm font-semibold text-white">{video.title || `Video ${index + 1}`}</p>
                  <p className="text-xs text-slate-400">{formatDuration((video.content_json as VideoContent).duration_seconds)}</p>
                </button>
              );
            })}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function formatDuration(seconds?: number) {
  if (!seconds) return "Length varies";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}
