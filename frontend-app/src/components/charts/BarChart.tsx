"use client";

export type BarItem = { label: string; value: number };

interface BarChartProps {
  data: BarItem[];
  /** Show an x-axis label only every N bars. Defaults to 1 (every bar). */
  labelEvery?: number;
  emptyMessage?: string;
  /** Height of the SVG in px. Defaults to 140. */
  height?: number;
}

const BAR_COLOR = "#818cf8";

// Layout constants (coordinate space, not screen px — SVG scales via viewBox)
const VW = 400;
const PAD = { t: 14, r: 6, b: 28, l: 6 };

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

export function BarChart({
  data,
  labelEvery = 1,
  emptyMessage = "No data",
  height = 140,
}: BarChartProps) {
  const VH = height;
  const chartH = VH - PAD.t - PAD.b;
  const chartW = VW - PAD.l - PAD.r;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const n = data.length || 1;
  const slotW = chartW / n;
  const gap = Math.min(slotW * 0.18, 4);
  const bW = Math.max(slotW - gap, 1);

  const hasData = data.some((d) => d.value > 0);

  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-slate-800/60 bg-slate-900/30"
        style={{ height }}
      >
        <p className="text-xs text-slate-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" aria-hidden>
      {/* Gridlines at 25 / 50 / 75 / 100 % */}
      {([0.25, 0.5, 0.75, 1] as const).map((f) => {
        const y = PAD.t + chartH * (1 - f);
        return (
          <line
            key={f}
            x1={PAD.l}
            y1={y}
            x2={VW - PAD.r}
            y2={y}
            stroke="#1e293b"
            strokeWidth={1}
          />
        );
      })}

      {/* Max value label */}
      <text x={PAD.l} y={PAD.t - 3} fontSize={7} fill="#334155">
        {fmtSec(maxVal)}
      </text>

      {/* Bars */}
      {data.map((item, i) => {
        const bH = Math.max(2, (item.value / maxVal) * chartH);
        const x = PAD.l + i * slotW + gap / 2;
        const y = PAD.t + chartH - bH;
        const showLabel = i % labelEvery === 0 || i === data.length - 1;

        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={bW}
              height={bH}
              rx={1.5}
              fill={BAR_COLOR}
              fillOpacity={item.value > 0 ? 0.7 : 0.12}
            />
            {showLabel && (
              <text
                x={x + bW / 2}
                y={VH - 7}
                textAnchor="middle"
                fontSize={7}
                fill="#475569"
              >
                {item.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
