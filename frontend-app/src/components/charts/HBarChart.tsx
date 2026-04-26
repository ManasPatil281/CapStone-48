"use client";

export type HBarItem = {
  label: string;
  /** Primary value (bar width) */
  value: number;
  /** Optional secondary value shown as a thinner underbar (e.g. recommended time) */
  secondaryValue?: number | null;
};

interface HBarChartProps {
  data: HBarItem[];
  /** Legend label for the primary bar */
  primaryLabel?: string;
  /** Legend label for the secondary bar */
  secondaryLabel?: string;
  emptyMessage?: string;
}

const PRIMARY_COLOR = "#818cf8";   // indigo-400
const SECONDARY_COLOR = "#334155"; // slate-700

function fmtSec(s: number): string {
  if (s <= 0) return "0s";
  const t = Math.round(s);
  if (t < 60) return `${t}s`;
  const m = Math.floor(t / 60);
  const rem = t % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

export function HBarChart({
  data,
  primaryLabel,
  secondaryLabel,
  emptyMessage = "No data",
}: HBarChartProps) {
  const showSecondary = data.some((d) => d.secondaryValue != null);
  const maxVal = Math.max(
    ...data.flatMap((d) => [d.value, d.secondaryValue ?? 0]),
    1
  );
  const hasData = data.some((d) => d.value > 0 || (d.secondaryValue ?? 0) > 0);

  if (!hasData || data.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-800/60 bg-slate-900/30">
        <p className="text-xs text-slate-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {data.map((item, i) => (
        <div key={i} className="space-y-0.5">
          <div className="flex items-center justify-between gap-3">
            <span
              className="min-w-0 truncate text-[11px] font-medium text-slate-300"
              title={item.label}
            >
              {item.label}
            </span>
            <span className="shrink-0 tabular-nums text-[11px] text-slate-500">
              {fmtSec(item.value)}
            </span>
          </div>

          {/* Primary bar */}
          <div className="h-2.5 w-full overflow-hidden rounded-sm bg-slate-800/60">
            <div
              style={{
                width: `${Math.max(0.5, (item.value / maxVal) * 100)}%`,
                backgroundColor: PRIMARY_COLOR,
              }}
              className="h-full rounded-sm opacity-75"
            />
          </div>

          {/* Secondary bar (recommended / comparison) */}
          {item.secondaryValue != null && (
            <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-800/40">
              <div
                style={{
                  width: `${Math.max(0.5, (item.secondaryValue / maxVal) * 100)}%`,
                  backgroundColor: SECONDARY_COLOR,
                }}
                className="h-full rounded-sm opacity-90"
              />
            </div>
          )}
        </div>
      ))}

      {/* Legend */}
      {showSecondary && (primaryLabel || secondaryLabel) && (
        <div className="flex flex-wrap items-center gap-3 pt-0.5">
          {primaryLabel && (
            <div className="flex items-center gap-1.5">
              <div
                className="h-2 w-3 rounded-sm opacity-75"
                style={{ backgroundColor: PRIMARY_COLOR }}
              />
              <span className="text-[10px] text-slate-500">{primaryLabel}</span>
            </div>
          )}
          {secondaryLabel && (
            <div className="flex items-center gap-1.5">
              <div
                className="h-1.5 w-3 rounded-sm opacity-90"
                style={{ backgroundColor: SECONDARY_COLOR }}
              />
              <span className="text-[10px] text-slate-500">{secondaryLabel}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
