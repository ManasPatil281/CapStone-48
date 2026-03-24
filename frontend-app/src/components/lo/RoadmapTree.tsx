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
  mostTakenPathNodeIds?: string[];
}

const statusColorMap: Record<RoadmapNode["status"], string> = {
  NOT_STARTED: "#94a3b8",
  IN_PROGRESS: "#f59e0b",
  COMPLETED: "#22d3ee",
  MASTERED: "#22c55e"
};

const mostTakenPathColor = "#fbbf24"; // Amber/gold

export function RoadmapTree({ nodes, edges, mostTakenPathNodeIds = [] }: Props) {
  const flowNodes = useMemo(
    () =>
      nodes.map((node, idx) => {
        const isOnPath = mostTakenPathNodeIds.includes(node.id);
        const baseColor = statusColorMap[node.status];

        // Determine y-position based on whether it's prerequisite, current, or dependent
        // This creates a vertical tree structure
        const isPrereq = nodes.indexOf(node) < nodes.length / 3;
        const isDependent = nodes.indexOf(node) >= (nodes.length * 2) / 3;
        const isCurrent = !isPrereq && !isDependent;

        let yPos = 0;
        if (isPrereq) yPos = -300;
        else if (isCurrent) yPos = 0;
        else if (isDependent) yPos = 300;

        return {
          id: node.id,
          data: { label: NodeContent(node), status: node.status, isOnPath },
          position: { x: idx * 200 + (isPrereq || isDependent ? Math.random() * 100 : 0), y: yPos },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: {
            background: "#0f172a",
            border: `3px solid ${isOnPath ? mostTakenPathColor : baseColor}`,
            borderRadius: 20,
            padding: 12,
            color: "white",
            boxShadow: isOnPath ? `0 0 15px ${mostTakenPathColor}70` : "none",
            fontWeight: isCurrent ? "700" : "500",
            minWidth: "180px",
            textAlign: "center" as const
          }
        };
      }),
    [nodes, mostTakenPathNodeIds]
  );

  const flowEdges = useMemo(
    () =>
      edges.map((edge) => {
        const isOnPath = mostTakenPathNodeIds.includes(edge.source) && mostTakenPathNodeIds.includes(edge.target);

        return {
          ...edge,
          id: `${edge.source}-${edge.target}`,
          animated: isOnPath,
          style: {
            stroke: isOnPath ? mostTakenPathColor : "#64748b",
            strokeWidth: isOnPath ? 2.5 : 1.5
          }
        };
      }),
    [edges, mostTakenPathNodeIds]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-semibold text-slate-200">Learning Prerequisites & Dependents</h3>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full border-2 border-yellow-400" />
          <p className="text-xs text-slate-400 hidden sm:block">Common Path</p>
        </div>
      </div>
      <div className="h-[400px] rounded-3xl border border-white/10 bg-slate-950/80 overflow-hidden sm:h-[500px]">
        <ReactFlow nodes={flowNodes} edges={flowEdges} fitView>
          <Background className="opacity-40" />
          <MiniMap pannable zoomable nodeColor={(node) => {
            const data = node.data as any;
            const isOnPath = data?.isOnPath;
            const status = data?.status ?? "NOT_STARTED";
            return isOnPath ? mostTakenPathColor : statusColorMap[status] ?? "#64748b";
          }} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
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
