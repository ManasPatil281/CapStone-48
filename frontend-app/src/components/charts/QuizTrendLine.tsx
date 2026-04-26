"use client";

export type QuizPoint = { label: string; score: number };

interface QuizTrendLineProps {
  points: QuizPoint[];
  emptyMessage?: string;
}

// SVG coordinate space — scales freely via viewBox
const VW = 400;
const VH = 110;
const PAD = { t: 14, r: 10, b: 26, l: 28 };
const PW = VW - PAD.l - PAD.r;
const PH = VH - PAD.t - PAD.b;

const LINE_COLOR = "#818cf8"; // indigo-400
const DOT_FILL = "#818cf8";
const DOT_STROKE = "#0f172a"; // slate-950

export function QuizTrendLine({
  points,
  emptyMessage = "No quiz attempts yet",
}: QuizTrendLineProps) {
  if (points.length === 0) {
    return (
      <div className="flex h-[110px] items-center justify-center rounded-lg border border-dashed border-slate-800/60 bg-slate-900/30">
        <p className="text-xs text-slate-600">{emptyMessage}</p>
      </div>
    );
  }

  if (points.length === 1) {
    return (
      <div className="flex h-[110px] items-center justify-center rounded-lg border border-slate-800/60 bg-slate-900/30">
        <div className="text-center">
          <p className="text-2xl font-bold text-indigo-400">
            {Math.round(points[0].score)}%
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{points[0].label}</p>
        </div>
      </div>
    );
  }

  const pts = points.map((p, i) => ({
    x: PAD.l + (i / (points.length - 1)) * PW,
    y: PAD.t + PH * (1 - p.score / 100),
    ...p,
  }));

  const pathD = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaD = `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${(PAD.t + PH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PAD.t + PH).toFixed(1)} Z`;

  const labelStep = Math.max(1, Math.ceil(points.length / 5));

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" aria-hidden>
      {/* Reference gridlines at 0 / 50 / 100 */}
      {([0, 50, 100] as const).map((pct) => {
        const y = PAD.t + PH * (1 - pct / 100);
        return (
          <g key={pct}>
            <line
              x1={PAD.l}
              y1={y}
              x2={VW - PAD.r}
              y2={y}
              stroke="#1e293b"
              strokeWidth={pct === 50 ? 1 : 0.75}
              strokeDasharray={pct === 50 ? "3,3" : undefined}
            />
            <text
              x={PAD.l - 3}
              y={y + 3}
              textAnchor="end"
              fontSize={7}
              fill="#334155"
            >
              {pct}%
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaD} fill={LINE_COLOR} fillOpacity={0.07} />

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots + score labels */}
      {pts.map((p, i) => {
        const showScore = i === 0 || i === pts.length - 1 || points.length <= 4;
        return (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={2.5}
              fill={DOT_FILL}
              stroke={DOT_STROKE}
              strokeWidth={1}
            />
            {showScore && (
              <text
                x={p.x}
                y={p.y - 6}
                textAnchor={
                  i === pts.length - 1 ? "end" : i === 0 ? "start" : "middle"
                }
                fontSize={7}
                fill="#a5b4fc"
              >
                {Math.round(p.score)}%
              </text>
            )}
          </g>
        );
      })}

      {/* X-axis labels */}
      {pts.map((p, i) => {
        const show = i % labelStep === 0 || i === pts.length - 1;
        return show ? (
          <text
            key={i}
            x={p.x}
            y={VH - 5}
            textAnchor={
              i === pts.length - 1 ? "end" : i === 0 ? "start" : "middle"
            }
            fontSize={7}
            fill="#475569"
          >
            {p.label}
          </text>
        ) : null;
      })}
    </svg>
  );
}
