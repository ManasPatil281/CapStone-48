interface Props {
  url: string;
  pageCount?: number;
}

export function PDFViewer({ url, pageCount }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>Inline PDF</span>
        {pageCount ? <span>{pageCount} pages</span> : null}
      </div>
      <iframe src={url} className="h-[32rem] w-full rounded-3xl border border-white/10 bg-white" title="PDF" />
    </div>
  );
}
