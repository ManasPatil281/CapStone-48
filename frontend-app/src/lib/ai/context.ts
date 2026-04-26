import type { LearningObjectContent } from "@/types/learning";
import type { SubmissionChatContext } from "@/lib/ai/types";

const MAX_LO_DESCRIPTION = 420;
const MAX_BLOCKS = 6;
const MAX_BLOCK_TEXT = 360;
const MAX_TOTAL_BLOCK_TEXT = 1800;

const EXCLUDED_KEYS = new Set(["pdf_url", "image_url", "url", "starter_code"]);
const PRIORITY_KEYS = [
  "markdown",
  "summary",
  "text",
  "problem",
  "solution",
  "explanation",
  "caption",
  "questions",
  "cards",
  "description",
  "title",
  "front",
  "back",
  "hint",
  "expected_output"
];

export function buildSubmissionChatContext(input: {
  courseTitle: string;
  loTitle: string;
  submissionId: string;
  submissionTitle?: string;
  teacherName?: string;
  loDescription?: string | null;
  contents: LearningObjectContent[];
}): SubmissionChatContext {
  const teachingBlocks = compactTeachingBlocks(input.contents);

  return {
    courseTitle: compactText(input.courseTitle, 100) || "Untitled Course",
    loTitle: compactText(input.loTitle, 120) || "Untitled Learning Object",
    submissionTitle: compactText(input.submissionTitle || `Submission ${input.submissionId.slice(0, 8)}`, 120),
    submissionId: compactText(input.submissionId, 80),
    teacherName: compactText(input.teacherName || "", 100) || undefined,
    loDescription: compactText(input.loDescription || "", MAX_LO_DESCRIPTION) || undefined,
    teachingBlocks
  };
}

function compactTeachingBlocks(contents: LearningObjectContent[]) {
  const blocks: SubmissionChatContext["teachingBlocks"] = [];
  let total = 0;

  for (const item of contents) {
    const extracted = extractCompactText(item.content_json);
    if (!extracted) {
      continue;
    }

    const text = compactText(extracted, MAX_BLOCK_TEXT);
    if (!text) {
      continue;
    }

    if (total + text.length > MAX_TOTAL_BLOCK_TEXT) {
      break;
    }

    blocks.push({
      title: compactText(item.title || item.delivery_type?.name || "Untitled Block", 90),
      deliveryType: compactText(item.delivery_type?.code || "UNKNOWN", 40),
      text
    });

    total += text.length;

    if (blocks.length >= MAX_BLOCKS) {
      break;
    }
  }

  return blocks;
}

function extractCompactText(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "object") {
    return "";
  }

  const obj = value as Record<string, unknown>;
  const chunks: string[] = [];

  for (const key of PRIORITY_KEYS) {
    const v = obj[key];
    const text = extractAnyText(v, 0);
    if (text) {
      chunks.push(text);
    }
  }

  for (const [key, v] of Object.entries(obj)) {
    if (PRIORITY_KEYS.includes(key) || EXCLUDED_KEYS.has(key)) {
      continue;
    }
    const text = extractAnyText(v, 0);
    if (text) {
      chunks.push(text);
    }
  }

  return dedupeText(chunks.join("\n"));
}

function extractAnyText(value: unknown, depth: number): string {
  if (value == null || depth > 3) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => extractAnyText(entry, depth + 1))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "object") {
    const parts: string[] = [];
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (EXCLUDED_KEYS.has(key)) {
        continue;
      }
      const text = extractAnyText(nested, depth + 1);
      if (text) {
        parts.push(text);
      }
    }
    return parts.join("\n");
  }

  return "";
}

function compactText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 1)}...`;
}

function dedupeText(value: string): string {
  const seen = new Set<string>();
  const lines = value
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => {
      const normalized = line.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

  return lines.join("\n");
}
