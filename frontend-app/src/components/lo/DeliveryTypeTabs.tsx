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
    <Tabs defaultValue={defaultValue} className="w-full">
      <TabsList>
        {TAB_ORDER.map((tab) => {
          const entries = data[tab.key as keyof ContentTabData];
          if (!entries || entries.length === 0) return null;
          const isRecommended = recommended === tab.key;
          return (
            <TabsTrigger key={tab.key} value={tab.key} className={isRecommended ? "border border-brand/40 bg-brand/10" : undefined}>
              <span>{tab.icon}</span>
              {tab.label}
              {isRecommended ? <span className="text-[10px] uppercase text-brand">Recommended</span> : null}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {TAB_ORDER.map((tab) => {
        const content = data[tab.key as keyof ContentTabData];
        if (!content || content.length === 0) return null;
        return (
          <TabsContent key={tab.key} value={tab.key}>
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
