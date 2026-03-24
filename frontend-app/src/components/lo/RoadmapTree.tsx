"use client";

import ReactFlow, { Background, Controls, MiniMap, Position } from "reactflow";
import "reactflow/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { NodeMouseHandler, ReactFlowInstance } from "reactflow";

export type RoadmapNode = {
  id: string;
  title: string;
  slug?: string;
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
  currentNodeId?: string;
}

const statusColorMap: Record<RoadmapNode["status"], string> = {
  NOT_STARTED: "#94a3b8",
  IN_PROGRESS: "#f59e0b",
  COMPLETED: "#22d3ee",
  MASTERED: "#22c55e"
};

const mostTakenPathColor = "#fbbf24"; // Amber/gold

const COLUMN_X = {
  left: 80,
  center: 420,
  right: 760
} as const;

const TOP_PADDING = 80;
const VERTICAL_GAP = 140;

export function RoadmapTree({ nodes, edges, mostTakenPathNodeIds = [], currentNodeId }: Props) {
  const router = useRouter();
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const resolvedCurrentNodeId = useMemo(() => {
    if (currentNodeId && nodes.some((node) => node.id === currentNodeId)) {
      return currentNodeId;
    }
    if (nodes.length === 1) {
      return nodes[0].id;
    }
    return nodes[Math.floor(nodes.length / 2)]?.id;
  }, [currentNodeId, nodes]);

  const prerequisites = useMemo(() => {
    const sourceIds = new Set(edges.filter((edge) => edge.target === resolvedCurrentNodeId).map((edge) => edge.source));
    return nodes.filter((node) => sourceIds.has(node.id));
  }, [edges, nodes, resolvedCurrentNodeId]);

  const dependents = useMemo(() => {
    const targetIds = new Set(edges.filter((edge) => edge.source === resolvedCurrentNodeId).map((edge) => edge.target));
    return nodes.filter((node) => targetIds.has(node.id));
  }, [edges, nodes, resolvedCurrentNodeId]);

  const prerequisiteIds = useMemo(() => new Set(prerequisites.map((node) => node.id)), [prerequisites]);
  const dependentIds = useMemo(() => new Set(dependents.map((node) => node.id)), [dependents]);

  const flowPositionMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();

    prerequisites.forEach((node, idx) => {
      map.set(node.id, { x: COLUMN_X.left, y: TOP_PADDING + idx * VERTICAL_GAP });
    });

    const currentY =
      TOP_PADDING +
      (Math.max(prerequisites.length, dependents.length, 1) - 1) * (VERTICAL_GAP / 2);
    map.set(resolvedCurrentNodeId, { x: COLUMN_X.center, y: currentY });

    dependents.forEach((node, idx) => {
      map.set(node.id, { x: COLUMN_X.right, y: TOP_PADDING + idx * VERTICAL_GAP });
    });

    // Fallback column for unexpected nodes so nothing is hidden.
    let fallbackIndex = 0;
    nodes.forEach((node) => {
      if (!map.has(node.id)) {
        map.set(node.id, { x: COLUMN_X.center, y: TOP_PADDING + (fallbackIndex + 1) * VERTICAL_GAP });
        fallbackIndex += 1;
      }
    });

    return map;
  }, [dependents, nodes, prerequisites, resolvedCurrentNodeId]);

  const flowNodes = useMemo(
    () =>
      nodes.map((node) => {
        const isOnPath = mostTakenPathNodeIds.includes(node.id);
        const baseColor = statusColorMap[node.status];
        const isPrereq = prerequisiteIds.has(node.id);
        const isDependent = dependentIds.has(node.id);
        const isCurrent = node.id === resolvedCurrentNodeId;
        const position = flowPositionMap.get(node.id) ?? { x: COLUMN_X.center, y: TOP_PADDING };

        return {
          id: node.id,
          data: { label: NodeContent(node), status: node.status, isOnPath, slug: node.slug },
          position,
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
            textAlign: "center" as const,
            cursor: node.slug ? "pointer" : "default"
          }
        };
      }),
    [dependentIds, flowPositionMap, mostTakenPathNodeIds, nodes, prerequisiteIds, resolvedCurrentNodeId]
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

  useEffect(() => {
    if (!rfInstance) return;
    const frame = window.requestAnimationFrame(() => {
      rfInstance.fitView({ padding: 0.2, duration: 250 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowEdges, flowNodes, rfInstance]);

  const handleNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    const slug = (node.data as { slug?: string } | undefined)?.slug;
    if (slug) {
      router.push(`/courses/dsa/${slug}`);
    }
  }, [router]);

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
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onInit={setRfInstance}
          onNodeClick={handleNodeClick}
          nodesDraggable={true}
          panOnDrag={true}
          zoomOnScroll={true}
        >
          <Background className="opacity-40" />
          <MiniMap pannable zoomable nodeColor={(node) => {
            const data = node.data as any;
            const isOnPath = data?.isOnPath;
            const status = data?.status as RoadmapNode["status"] | undefined;
            return isOnPath ? mostTakenPathColor : (status ? statusColorMap[status] : "#64748b");
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
