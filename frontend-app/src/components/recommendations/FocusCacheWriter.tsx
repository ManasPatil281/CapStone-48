"use client";

import { useEffect } from "react";
import type { CachedFocusView } from "@/lib/recommendations/focusCache";

/**
 * Inert component (renders nothing). Fires a one-way write to
 * /api/recommendations/focus-cache on mount so a freshly-computed Focus
 * card is cached for the next page load in this browser session. Only ever
 * mounted after a cache MISS — never on a cache hit, since the cached value
 * is already correct.
 */
export function FocusCacheWriter({ submissionId, fingerprint, view }: { submissionId: string; fingerprint: string; view: CachedFocusView }) {
  useEffect(() => {
    fetch("/api/recommendations/focus-cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, fingerprint, view }),
      keepalive: true,
    }).catch(() => {
      // Best-effort only — a failed cache write just means the next page
      // load recomputes, same as today's behaviour.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, fingerprint]);

  return null;
}
