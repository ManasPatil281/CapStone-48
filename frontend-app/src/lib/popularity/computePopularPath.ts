type VisitRow = {
  student_id: string;
  learning_object_id: string | null;
  started_at: string | null;
};

type Edge = { source: string; target: string };

export type PopularityResult = {
  popularNodeIds: string[];
  nodeVisitCounts: Record<string, number>;
};

export function computePopularPath(
  visitRows: VisitRow[],
  loIds: string[],
  edges: Edge[]
): PopularityResult {
  if (visitRows.length === 0 || loIds.length === 0) {
    return { popularNodeIds: [], nodeVisitCounts: {} };
  }

  const loIdSet = new Set(loIds);

  // Count unique students per LO
  const nodeStudents = new Map<string, Set<string>>();
  for (const row of visitRows) {
    if (!row.learning_object_id || !loIdSet.has(row.learning_object_id)) continue;
    const set = nodeStudents.get(row.learning_object_id) ?? new Set<string>();
    set.add(row.student_id);
    nodeStudents.set(row.learning_object_id, set);
  }

  const nodeVisitCounts: Record<string, number> = {};
  for (const [loId, students] of nodeStudents) {
    nodeVisitCounts[loId] = students.size;
  }

  // Count edge transitions per student
  const edgeWeights = new Map<string, number>();

  // Group rows by student, sort by started_at
  const byStudent = new Map<string, VisitRow[]>();
  for (const row of visitRows) {
    if (!row.learning_object_id || !loIdSet.has(row.learning_object_id)) continue;
    const list = byStudent.get(row.student_id) ?? [];
    list.push(row);
    byStudent.set(row.student_id, list);
  }

  for (const rows of byStudent.values()) {
    rows.sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? ""));

    // Dedupe consecutive same-LO visits
    const deduped: string[] = [];
    for (const row of rows) {
      const loId = row.learning_object_id!;
      if (deduped[deduped.length - 1] !== loId) {
        deduped.push(loId);
      }
    }

    for (let i = 0; i < deduped.length - 1; i++) {
      const key = `${deduped[i]}->${deduped[i + 1]}`;
      edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
    }
  }

  // Build outEdges and inDegree from course edges
  const outEdges = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const loId of loIds) {
    outEdges.set(loId, []);
    inDegree.set(loId, 0);
  }
  for (const edge of edges) {
    if (!loIdSet.has(edge.source) || !loIdSet.has(edge.target)) continue;
    outEdges.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // Find root nodes (no incoming edges in the course graph)
  const roots = loIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  if (roots.length === 0) {
    return { popularNodeIds: [], nodeVisitCounts };
  }

  // Start from the most-visited root
  const startNode = roots.reduce((best, id) =>
    (nodeVisitCounts[id] ?? 0) >= (nodeVisitCounts[best] ?? 0) ? id : best
  );

  // Greedy walk following the highest-weight observed transition
  const path: string[] = [startNode];
  const visited = new Set<string>([startNode]);

  let current = startNode;
  for (let step = 0; step < loIds.length; step++) {
    const neighbors = outEdges.get(current) ?? [];
    let bestNext: string | null = null;
    let bestWeight = 0;

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      const w = edgeWeights.get(`${current}->${neighbor}`) ?? 0;
      if (w > bestWeight) {
        bestWeight = w;
        bestNext = neighbor;
      }
    }

    if (!bestNext || bestWeight === 0) break;

    path.push(bestNext);
    visited.add(bestNext);
    current = bestNext;
  }

  // Only return a path if it has at least 2 nodes with actual usage
  if (path.length < 2) {
    return { popularNodeIds: [], nodeVisitCounts };
  }

  return { popularNodeIds: path, nodeVisitCounts };
}
