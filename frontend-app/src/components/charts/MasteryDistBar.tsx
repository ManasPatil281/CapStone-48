"use client";

export type MasteryBucket = {
  label: string;
  count: number;
  color: string;
};

interface MasteryDistBarProps {
  buckets: MasteryBucket[];
  emptyMessage?: string;
}

export function MasteryDistBar({
  buckets,
  emptyMessage = "No mastery data yet",
}: MasteryDistBarProps) {
  const total = buckets.reduce((s, b) => s + b.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-slate-800/60 bg-slate-900/30">
        <p className="text-xs text-slate-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Segmented bar */}
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-800/60">
        {buckets.map((b) =>
          b.count > 0 ? (
            <div
              key={b.label}
              style={{
                width: `${(b.count / total) * 100}%`,
                backgroundColor: b.color,
              }}
              className="h-full opacity-80 transition-all"
            />
          ) : null
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 shrink-0 rounded-sm opacity-85"
              style={{ backgroundColor: b.color }}
            />
            <span className="text-[11px] text-slate-400">{b.label}</span>
            <span className="ml-auto text-[11px] font-bold text-slate-200">{b.count}</span>
            <span className="text-[10px] text-slate-600">
              {Math.round((b.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
