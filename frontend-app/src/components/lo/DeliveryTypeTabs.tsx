"use client";

import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ContentTabData, FlashcardContent, LearningObjectContent, NoteContent, PdfContent, PlaygroundContent } from "@/types/learning";
import { VideoGallery } from "@/components/content/VideoGallery";
import { MarkdownRenderer } from "@/components/content/MarkdownRenderer";
import { PDFViewer } from "@/components/content/PDFViewer";
import { FlashcardDeck } from "@/components/content/FlashcardDeck";
import { CodePlayground } from "@/components/content/CodePlayground";

interface Props {
  data: ContentTabData;
  recommended?: string;
}

const TAB_ORDER = [
  { key: "video", label: "Videos", icon: "▶" },
  { key: "notes", label: "Reading", icon: "📖" },
  { key: "pdf", label: "PDF", icon: "📄" },
  { key: "playground", label: "Playground", icon: "💻" },
  { key: "flashcards", label: "Flashcards", icon: "🃏" }
] as const;

type TabKey = (typeof TAB_ORDER)[number]["key"];

export function DeliveryTypeTabs({ data, recommended }: Props) {
  const firstAvailable = useMemo(
    () => TAB_ORDER.find((tab) => (data[tab.key as keyof ContentTabData]?.length ?? 0) > 0)?.key ?? "video",
    [data]
  );
  const defaultValue =
    recommended && (data[recommended as keyof ContentTabData]?.length ?? 0) > 0 ? (recommended as TabKey) : firstAvailable;

  return (
    <Tabs defaultValue={defaultValue} className="w-full space-y-4">
      <TabsList className="w-full justify-start gap-2 bg-slate-900/40 border-b border-white/5 rounded-lg p-1 overflow-x-auto">
        {TAB_ORDER.map((tab) => {
          const entries = data[tab.key as keyof ContentTabData];
          if (!entries || entries.length === 0) return null;
          const isRecommended = recommended === tab.key;
          return (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className={`whitespace-nowrap text-sm flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                isRecommended
                  ? "border border-brand/50 bg-brand/10 text-brand font-semibold shadow-lg shadow-brand/20"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/40"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
              {isRecommended && <span className="text-[10px] uppercase font-bold ml-1 px-2 py-1 bg-brand/20 text-brand rounded">Recommended</span>}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {TAB_ORDER.map((tab) => {
        const content = data[tab.key as keyof ContentTabData];
        if (!content || content.length === 0) return null;
        return (
          <TabsContent key={tab.key} value={tab.key} className="rounded-2xl bg-slate-900/30 border border-white/5 p-6">
            <ContentRenderer tab={tab.key} payload={content} />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function ContentRenderer({ tab, payload }: { tab: TabKey; payload: LearningObjectContent[] }) {
  const first = payload[0];
  if (!first) {
    return <p className="text-sm text-slate-400">Content coming soon.</p>;
  }

  switch (tab) {
    case "video":
      return <VideoGallery items={payload} />;
    case "notes":
      return <MarkdownRenderer data={first.content_json as NoteContent} />;
    case "pdf":
      return <PDFViewer url={(first.content_json as PdfContent).pdf_url} pageCount={(first.content_json as PdfContent).page_count} />;
    case "playground":
      return <CodePlayground data={first.content_json as PlaygroundContent} />;
    case "flashcards":
      return <FlashcardDeck data={first.content_json as FlashcardContent} />;
    default:
      return <p className="text-sm text-slate-400">Content coming soon.</p>;
  }
}
