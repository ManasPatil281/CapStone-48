"use client";

import ReactFlow, { Background, Controls, MiniMap, Position, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import { useMemo } from "react";
import type { RoadmapNode, RoadmapEdge } from "@/components/lo/RoadmapTree";

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

const mostTakenPathColor = "#fbbf24"; // Amber/gold for highlight

export function CourseRoadmap({ nodes, edges, mostTakenPathNodeIds = [] }: Props) {
  const flowNodes = useMemo(
    () =>
      nodes.map((node, idx) => {
        const isOnPath = mostTakenPathNodeIds.includes(node.id);
        const baseColor = statusColorMap[node.status];

        return {
          id: node.id,
          data: { label: CourseNodeContent(node, isOnPath) },
          position: { x: (idx % 4) * 280, y: Math.floor(idx / 4) * 200 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: {
            background: "#0f172a",
            border: `3px solid ${isOnPath ? mostTakenPathColor : baseColor}`,
            borderRadius: 16,
            padding: 16,
            color: "white",
            boxShadow: isOnPath ? `0 0 20px ${mostTakenPathColor}80` : "none",
            fontWeight: isOnPath ? "600" : "500"
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
            stroke: isOnPath ? mostTakenPathColor : "#475569",
            strokeWidth: isOnPath ? 3 : 2
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: isOnPath ? mostTakenPathColor : "#475569" }
        };
      }),
    [edges, mostTakenPathNodeIds]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">DSA Learning Path</h3>
          <p className="text-xs text-slate-400 mt-1">Complete roadmap with prerequisites and recommended progression</p>
        </div>
        <div className="flex items-center gap-2 bg-yellow-400/10 px-3 py-1 rounded-full w-fit">
          <div className="h-2 w-2 rounded-full bg-yellow-400" />
          <p className="text-xs font-semibold text-yellow-300">Most Common Path</p>
        </div>
      </div>
      <div className="h-[450px] rounded-3xl border border-white/10 bg-slate-950/80 overflow-hidden sm:h-[600px]">
        <ReactFlow nodes={flowNodes} edges={flowEdges} fitView>
          <Background className="opacity-20" />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => {
              const status = (node.data as any)?.status ?? "NOT_STARTED";
              return statusColorMap[status] ?? "#64748b";
            }}
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

function CourseNodeContent(node: RoadmapNode, isOnPath: boolean) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold">{node.title}</p>
      <p className="text-xs text-slate-400">Level: {"●".repeat(node.difficulty)}</p>
      <p className="text-xs text-slate-500">{node.estimatedTime} min</p>
      {isOnPath && <p className="text-xs font-bold text-yellow-400">★ Popular Path</p>}
    </div>
  );
}
