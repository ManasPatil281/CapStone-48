"use client";

import React, { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  GitBranch,
  Image,
  Brain,
  ClipboardList,
  Bookmark,
  Play,
  BookOpen,
  FileStack,
  Code2,
  Layers,
  HelpCircle
} from "lucide-react";
import type {
  Assessment,
  AssessmentAttempt,
  ContentTabData,
  FlashcardContent,
  FlowchartContent,
  LearningObjectContent,
  NoteContent,
  PdfContent,
  PlaygroundContent,
  PracticeSetContent,
  RevisionSheetContent,
  VisualExplanationContent,
  WorkedExampleContent
} from "@/types/learning";
import { VideoGallery } from "@/components/content/VideoGallery";
import { MarkdownRenderer } from "@/components/content/MarkdownRenderer";
import { PDFViewer } from "@/components/content/PDFViewer";
import { FlashcardDeck } from "@/components/content/FlashcardDeck";
import { CodePlayground } from "@/components/content/CodePlayground";
import { QuizSession } from "@/components/lo/QuizSession";

interface Props {
  data: ContentTabData;
  assessment?: Assessment & { questions: any[] };
  attempts?: AssessmentAttempt[];
  recommended?: string;
}

const TAB_ORDER = [
  { key: "conceptNotes", label: "Concept Notes", icon: "📝" },
  { key: "flowchart", label: "Flowchart", icon: "🧭" },
  { key: "visualExplanation", label: "Visual", icon: "🖼" },
  { key: "workedExample", label: "Worked Example", icon: "🧠" },
  { key: "practiceSet", label: "Practice", icon: "✍" },
  { key: "revisionSheet", label: "Revision", icon: "📌" },
  { key: "video", label: "Videos", icon: "▶" },
  { key: "notes", label: "Reading", icon: "📖" },
  { key: "pdf", label: "PDF", icon: "📄" },
  { key: "playground", label: "Playground", icon: "💻" },
  { key: "flashcards", label: "Flashcards", icon: "🃏" }
] as const;

type TabKey = (typeof TAB_ORDER)[number]["key"];

type ContentBlock = {
  key: string;
  code: string;
  label: string;
  content: LearningObjectContent;
};

export function DeliveryTypeTabs({ data, assessment, attempts, recommended }: Props) {
  const orderedBlocks = useMemo(() => {
    if (data.blocks && data.blocks.length > 0) {
      return data.blocks;
    }

    const legacyBlocks: LearningObjectContent[] = [];
    TAB_ORDER.forEach((tab) => {
      const entries = data[tab.key as keyof ContentTabData] as LearningObjectContent[] | undefined;
      if (entries?.length) {
        legacyBlocks.push(...entries);
      }
    });

    return legacyBlocks;
  }, [data]);

  const blocks = useMemo<ContentBlock[]>(() => {
    return orderedBlocks.map((content, index) => {
      const code = content.delivery_type?.code ?? "UNKNOWN";
      return {
        key: `${content.id}-${index}`,
        code,
        label: content.title?.trim() || content.delivery_type?.name || `Block ${index + 1}`,
        content
      };
    });
  }, [orderedBlocks]);

  const defaultValue = useMemo(() => {
    if (blocks.length === 0) return "empty";
    if (!recommended) return blocks[0].key;

    const recommendedBlock = blocks.find((block) => mapCodeToLegacyKey(block.code) === recommended);
    return recommendedBlock?.key ?? blocks[0].key;
  }, [blocks, recommended]);

  if (blocks.length === 0) {
    return <p className="text-sm text-slate-400">Content coming soon.</p>;
  }

  return (
    <Tabs defaultValue={defaultValue} className="w-full space-y-4">
      {/* ── Scrollable tab strip ── */}
      <div className="overflow-x-auto">
        <TabsList className="w-max rounded-lg border border-slate-800/60 bg-slate-900/40 p-1.5 gap-1">
          {blocks.map((block, index) => {
            const isRecommended = mapCodeToLegacyKey(block.code) === recommended;
            return (
              <TabsTrigger
                key={block.key}
                value={block.key}
                className={`whitespace-nowrap text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${
                  isRecommended
                    ? "border border-brand/35 bg-brand/12 !text-brand font-semibold data-[state=active]:bg-brand/20 data-[state=active]:text-brand data-[state=active]:shadow-none"
                    : ""
                }`}
              >
                {getBlockIcon(block.code)}
                <span>
                  <span className="mr-1 font-mono text-[10px] text-slate-600">{index + 1}.</span>
                  {block.label}
                </span>
                {isRecommended && (
                  <span className="ml-0.5 rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-label bg-brand/20 text-brand">
                    Pick
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {blocks.map((block) => {
        return (
          <TabsContent
            key={block.key}
            value={block.key}
            className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6 backdrop-blur-[1px]"
          >
            <ContentRenderer content={block.content} assessment={assessment} attempts={attempts} />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function ContentRenderer({
  content,
  assessment,
  attempts
}: {
  content: LearningObjectContent;
  assessment?: Assessment & { questions: any[] };
  attempts?: AssessmentAttempt[];
}) {
  const code = content.delivery_type?.code;
  const mapped = mapCodeToLegacyKey(code);

  switch (mapped) {
    case "conceptNotes":
      return <MarkdownRenderer data={{ markdown: getMarkdown(content.content_json) }} />;
    case "flowchart": {
      const data = content.content_json as FlowchartContent;
      return (
        <MediaPanel
          imageUrl={data.image_url}
          title={content.title}
          caption={data.caption}
        />
      );
    }
    case "visualExplanation": {
      const data = content.content_json as VisualExplanationContent;
      return (
        <MediaPanel
          imageUrl={data.image_url}
          title={content.title}
          caption={data.caption}
          body={data.text}
        />
      );
    }
    case "workedExample": {
      const data = content.content_json as WorkedExampleContent;
      return (
        <div className="space-y-4">
          <Block title="Problem" value={data.problem} />
          <Block title="Solution" value={data.solution} />
          <Block title="Explanation" value={data.explanation} />
        </div>
      );
    }
    case "practiceSet": {
      const data = content.content_json as PracticeSetContent;
      const questions = normalizeQuestions(data.questions);
      if (questions.length === 0) {
        return <p className="text-sm text-slate-500">No practice questions yet.</p>;
      }
      return (
        <ol className="space-y-3">
          {questions.map((question, idx) => (
            <li
              key={`${idx}-${question}`}
              className="flex gap-3 rounded-lg border border-slate-800/50 bg-slate-900/40 px-4 py-3 text-sm leading-relaxed text-slate-200"
            >
              <span className="mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-500">
                {idx + 1}
              </span>
              {question}
            </li>
          ))}
        </ol>
      );
    }
    case "revisionSheet": {
      const data = content.content_json as RevisionSheetContent;
      return (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-5 py-4 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
          {data.summary || "No revision summary yet."}
        </div>
      );
    }
    case "video":
      return <VideoGallery items={[content]} />;
    case "notes":
      return <MarkdownRenderer data={content.content_json as NoteContent} />;
    case "pdf":
      return <PDFViewer url={(content.content_json as PdfContent).pdf_url} pageCount={(content.content_json as PdfContent).page_count} />;
    case "playground":
      return <CodePlayground data={content.content_json as PlaygroundContent} />;
    case "flashcards":
      return <FlashcardDeck data={content.content_json as FlashcardContent} />;
    case "quiz":
      return <QuizSession assessment={assessment} attempts={attempts} />;
    default:
      return <p className="text-sm text-slate-400">Content coming soon.</p>;
  }
}

function mapCodeToLegacyKey(code?: string): TabKey | "quiz" | "unknown" {
  switch (code) {
    case "CONCEPT_NOTES":
      return "conceptNotes";
    case "FLOWCHART":
      return "flowchart";
    case "VISUAL_EXPLANATION":
      return "visualExplanation";
    case "WORKED_EXAMPLE":
      return "workedExample";
    case "PRACTICE_SET":
      return "practiceSet";
    case "REVISION_SHEET":
      return "revisionSheet";
    case "VIDEO":
      return "video";
    case "READING_NOTES":
      return "notes";
    case "READING_PDF":
      return "pdf";
    case "PLAYGROUND":
      return "playground";
    case "FLASHCARD":
    case "FLASHCARDS":
      return "flashcards";
    case "QUIZ":
      return "quiz";
    default:
      return "unknown";
  }
}

function getBlockIcon(code?: string): React.ReactNode {
  const cls = "h-3.5 w-3.5 flex-shrink-0";
  const mapped = mapCodeToLegacyKey(code);
  switch (mapped) {
    case "conceptNotes":    return <FileText className={cls} />;
    case "flowchart":       return <GitBranch className={cls} />;
    case "visualExplanation": return <Image className={cls} />;
    case "workedExample":   return <Brain className={cls} />;
    case "practiceSet":     return <ClipboardList className={cls} />;
    case "revisionSheet":   return <Bookmark className={cls} />;
    case "video":           return <Play className={cls} />;
    case "notes":           return <BookOpen className={cls} />;
    case "pdf":             return <FileStack className={cls} />;
    case "playground":      return <Code2 className={cls} />;
    case "flashcards":      return <Layers className={cls} />;
    case "quiz":            return <HelpCircle className={cls} />;
    default:                return <BookOpen className={cls} />;
  }
}

function getMarkdown(contentJson: unknown): string {
  const content = (contentJson ?? {}) as Record<string, unknown>;
  const markdown = typeof content.markdown === "string" ? content.markdown : "";
  const summary = typeof content.summary === "string" ? content.summary : "";
  return markdown || summary || "No notes available yet.";
}

function normalizeQuestions(questions: unknown): string[] {
  if (!Array.isArray(questions)) return [];
  return questions
    .map((question) => (typeof question === "string" ? question.trim() : ""))
    .filter(Boolean);
}

function Block({ title, value }: { title: string; value?: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-800/60 bg-slate-950/40">
      <div className="border-b border-slate-800/60 bg-slate-900/40 px-4 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-label text-slate-600">{title}</p>
      </div>
      <p className="px-4 py-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
        {value || "Not provided."}
      </p>
    </section>
  );
}

function MediaPanel({
  imageUrl,
  title,
  caption,
  body
}: {
  imageUrl?: string;
  title?: string;
  caption?: string;
  body?: string;
}) {
  if (!imageUrl) {
    return (
      <p className="text-sm text-slate-500">No image available yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      <img
        src={imageUrl}
        alt={title || "Visual content"}
        className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 object-contain"
      />
      {caption && (
        <p className="text-sm leading-relaxed text-slate-400">{caption}</p>
      )}
      {body && (
        <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{body}</p>
      )}
    </div>
  );
}
