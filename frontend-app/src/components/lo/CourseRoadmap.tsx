"use client";

import ReactFlow, { Background, Controls, MiniMap, Position, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { NodeMouseHandler, ReactFlowInstance } from "reactflow";
import type { RoadmapNode, RoadmapEdge } from "@/components/lo/RoadmapTree";

interface Props {
  courseSlug?: string;
  nodes: RoadmapNode[];
  edges: RoadmapEdge[];
  mostTakenPathNodeIds?: string[];
  nodeVisitCounts?: Record<string, number>;
}

const statusColorMap: Record<RoadmapNode["status"], string> = {
  NOT_STARTED: "#94a3b8",
  IN_PROGRESS: "#f59e0b",
  COMPLETED: "#22d3ee",
  MASTERED: "#22c55e"
};

const mostTakenPathColor = "#fbbf24"; // Amber/gold for highlight

export function CourseRoadmap({ courseSlug = "dsa", nodes, edges, mostTakenPathNodeIds = [], nodeVisitCounts = {} }: Props) {
  const router = useRouter();
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const nodeById = useMemo(() => {
    const map = new Map<string, RoadmapNode>();
    nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodes]);

  const normalizedEdges = useMemo(
    () => edges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target)),
    [edges, nodeById]
  );

  const positionMap = useMemo(() => {
    const COLUMN_GAP = 280;
    const ROW_GAP = 150;
    const LEFT_PADDING = 80;
    const TOP_PADDING = 70;

    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    nodes.forEach((node) => {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    });

    normalizedEdges.forEach((edge) => {
      adjacency.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    });

    const roots = nodes
      .filter((node) => (inDegree.get(node.id) ?? 0) === 0)
      .map((node) => node.id)
      .sort((a, b) => (nodeById.get(a)?.title ?? "").localeCompare(nodeById.get(b)?.title ?? ""));

    const queue = [...roots];
    const level = new Map<string, number>();
    nodes.forEach((node) => level.set(node.id, 0));

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentLevel = level.get(current) ?? 0;
      const neighbors = [...(adjacency.get(current) ?? [])].sort((a, b) =>
        (nodeById.get(a)?.title ?? "").localeCompare(nodeById.get(b)?.title ?? "")
      );

      neighbors.forEach((next) => {
        level.set(next, Math.max(level.get(next) ?? 0, currentLevel + 1));
        inDegree.set(next, (inDegree.get(next) ?? 0) - 1);
        if ((inDegree.get(next) ?? 0) === 0) {
          queue.push(next);
        }
      });
    }

    // If there are cycles, place unresolved nodes deterministically in the first column.
    const unresolved = nodes
      .filter((node) => (inDegree.get(node.id) ?? 0) > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
    unresolved.forEach((node) => level.set(node.id, 0));

    const grouped = new Map<number, RoadmapNode[]>();
    nodes.forEach((node) => {
      const depth = level.get(node.id) ?? 0;
      const bucket = grouped.get(depth) ?? [];
      bucket.push(node);
      grouped.set(depth, bucket);
    });

    const map = new Map<string, { x: number; y: number }>();
    [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([depth, columnNodes]) => {
        columnNodes
          .sort((a, b) => a.title.localeCompare(b.title))
          .forEach((node, rowIndex) => {
            map.set(node.id, {
              x: LEFT_PADDING + depth * COLUMN_GAP,
              y: TOP_PADDING + rowIndex * ROW_GAP
            });
          });
      });

    return map;
  }, [nodeById, nodes, normalizedEdges]);

  const resolvedMostTakenPathNodeIds = useMemo(() => mostTakenPathNodeIds, [mostTakenPathNodeIds]);

  const flowNodes = useMemo(
    () =>
      nodes.map((node) => {
        const isOnPath = resolvedMostTakenPathNodeIds.includes(node.id);
        const baseColor = statusColorMap[node.status];

        const visitCount = nodeVisitCounts[node.id] ?? 0;
        return {
          id: node.id,
          data: { label: CourseNodeContent(node, isOnPath, visitCount), status: node.status, slug: node.slug },
          position: positionMap.get(node.id) ?? { x: 80, y: 70 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: {
            background: "#0f172a",
            border: `3px solid ${isOnPath ? mostTakenPathColor : baseColor}`,
            borderRadius: 16,
            padding: 16,
            color: "white",
            boxShadow: isOnPath ? `0 0 20px ${mostTakenPathColor}80` : "none",
            fontWeight: isOnPath ? "600" : "500",
            cursor: "pointer"
          }
        };
      }),
    [nodes, nodeVisitCounts, positionMap, resolvedMostTakenPathNodeIds]
  );

  const flowEdges = useMemo(
    () =>
      normalizedEdges.map((edge) => {
        const isOnPath = resolvedMostTakenPathNodeIds.includes(edge.source) && resolvedMostTakenPathNodeIds.includes(edge.target);

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
    [normalizedEdges, resolvedMostTakenPathNodeIds]
  );

  useEffect(() => {
    if (!rfInstance) return;
    const frame = window.requestAnimationFrame(() => {
      rfInstance.fitView({ padding: 0.2, duration: 250 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowEdges, flowNodes, rfInstance]);

  const handleNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    router.push(`/courses/${courseSlug}?lo=${node.id}` as Route);
  }, [courseSlug, router]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">DSA Course Roadmap</h3>
          <p className="text-xs text-slate-400 mt-1">Complete roadmap with prerequisites and progression</p>
        </div>
        {resolvedMostTakenPathNodeIds.length > 0 && (
          <div className="flex items-center gap-2 bg-yellow-400/10 px-3 py-1 rounded-full w-fit">
            <div className="h-2 w-2 rounded-full bg-yellow-400" />
            <p className="text-xs font-semibold text-yellow-300">Most Common Path</p>
          </div>
        )}
      </div>
      <div className="h-[450px] rounded-3xl border border-white/10 bg-slate-950/80 overflow-hidden sm:h-[600px]">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onInit={setRfInstance}
          onNodeClick={handleNodeClick}
          nodesDraggable={true}
          panOnDrag={true}
          zoomOnScroll={true}
        >
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

function CourseNodeContent(node: RoadmapNode, isOnPath: boolean, visitCount: number) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold">{node.title}</p>
      <p className="text-xs text-slate-400">Level: {"●".repeat(node.difficulty)}</p>
      <p className="text-xs text-slate-500">{node.estimatedTime} min</p>
      {visitCount > 0 && (
        <p className="text-xs text-slate-500">{visitCount} student{visitCount !== 1 ? "s" : ""}</p>
      )}
      {isOnPath && <p className="text-xs font-bold text-yellow-400">★ Popular Path</p>}
    </div>
  );
}
