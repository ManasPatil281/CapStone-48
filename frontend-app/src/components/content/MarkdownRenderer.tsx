"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NoteContent } from "@/types/learning";

interface Props {
  data: NoteContent;
}

export function MarkdownRenderer({ data }: Props) {
  return (
    <div className="space-y-6">
      <article className="prose prose-invert max-w-none prose-headings:text-slate-100 prose-headings:font-bold prose-h2:text-2xl prose-h3:text-xl prose-p:text-slate-300 prose-strong:text-slate-100 prose-strong:font-semibold prose-code:text-yellow-300 prose-code:bg-slate-900/80 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-pre:bg-slate-900/90 prose-pre:border prose-pre:border-white/10 prose-ul:text-slate-300 prose-li:text-slate-300 prose-blockquote:text-slate-400 prose-blockquote:border-l-brand prose-blockquote:border-l-4 prose-table:text-slate-300 prose-thead:text-slate-200 prose-tr:border-b prose-tr:border-white/5 hover:prose-a:text-brand">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          h2: ({node, ...props}) => <h2 className="mt-8 mb-4 scroll-m-20" {...props} />,
          h3: ({node, ...props}) => <h3 className="mt-6 mb-3 scroll-m-20" {...props} />,
          p: ({node, ...props}) => <p className="leading-7 py-2" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-2 ml-2" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-2 ml-2" {...props} />,
          li: ({node, ...props}) => <li className="ml-2" {...props} />,
          table: ({node, ...props}) => <div className="overflow-x-auto"><table className="border-collapse border border-white/10 w-full" {...props} /></div>,
          code: ({inline, ...props}: any) =>
            inline
              ? <code className="text-yellow-300 bg-slate-900/80 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />
              : <code className="text-yellow-300 font-mono text-sm" {...props} />,
          pre: ({node, ...props}) => <pre className="bg-slate-900/90 border border-white/10 rounded-lg p-4 overflow-x-auto" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-brand pl-4 py-2 my-4 bg-slate-900/40 rounded-r" {...props} />,
        }}>
          {data.markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
