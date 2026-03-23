"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NoteContent } from "@/types/learning";

interface Props {
  data: NoteContent;
}

export function MarkdownRenderer({ data }: Props) {
  return (
    <article className="prose prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.markdown}</ReactMarkdown>
    </article>
  );
}
