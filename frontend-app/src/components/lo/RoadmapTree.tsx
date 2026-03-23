"use client";

import ReactFlow, { Background, Controls, MiniMap, Position } from "reactflow";
import "reactflow/dist/style.css";
import { useMemo } from "react";

export type RoadmapNode = {
  id: string;
  title: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "MASTERED";
  difficulty: number;
  estimatedTime: number;
};

export type RoadmapEdge = {
  source: string;
  target: string;
};

interface Props {
  nodes: RoadmapNode[];
  edges: RoadmapEdge[];
}

const statusColorMap: Record<RoadmapNode["status"], string> = {
  NOT_STARTED: "#94a3b8",
  IN_PROGRESS: "#f59e0b",
  COMPLETED: "#22d3ee",
  MASTERED: "#22c55e"
};

export function RoadmapTree({ nodes, edges }: Props) {
  const flowNodes = useMemo(
    () =>
      nodes.map((node, idx) => ({
        id: node.id,
        data: { label: NodeContent(node), status: node.status },
        position: { x: idx * 220, y: idx * 40 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: "#0f172a",
          border: `1px solid ${statusColorMap[node.status]}`,
          borderRadius: 20,
          padding: 12,
          color: "white"
        }
      })),
    [nodes]
  );

  const flowEdges = useMemo(
    () => edges.map((edge) => ({ ...edge, id: `${edge.source}-${edge.target}` })),
    [edges]
  );

  return (
    <div className="h-[360px] rounded-3xl border border-white/10 bg-slate-950/80">
      <ReactFlow nodes={flowNodes} edges={flowEdges} fitView>
        <Background className="opacity-40" />
        <MiniMap pannable zoomable nodeColor={(node) => statusColorMap[(node.data as any)?.status ?? "NOT_STARTED"] ?? "#64748b"} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function NodeContent(node: RoadmapNode) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold">{node.title}</p>
      <p className="text-xs text-slate-400">Difficulty • {"●".repeat(node.difficulty)}</p>
      <p className="text-xs text-slate-500">{node.estimatedTime} min</p>
    </div>
  );
}
