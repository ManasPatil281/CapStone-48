import type { LearningObject } from "@/types/learning";

export interface PathNode extends LearningObject {
  depth: number;
}

export function buildLearningPath({
  target,
  prerequisites,
  masteredIds
}: {
  target: LearningObject;
  prerequisites: (LearningObject & { depth?: number })[];
  masteredIds: Set<string>;
}): PathNode[] {
  const filtered = prerequisites.filter((lo) => !masteredIds.has(lo.id));
  const normalized = filtered.map((lo) => ({ ...lo, depth: lo.depth ?? 0 }));

  normalized.sort((a, b) => {
    if (a.depth === b.depth) {
      return a.difficulty_level - b.difficulty_level;
    }
    return a.depth - b.depth;
  });

  return [...normalized, { ...target, depth: (target as PathNode).depth ?? normalized.at(-1)?.depth ?? 0 }];
}
