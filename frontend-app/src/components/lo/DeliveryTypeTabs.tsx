"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  GitBranch,
  Image,
  Brain,
  ClipboardList,
  Bookmark,
  Play,
  BookOpen,
  FileStack,
  Code2,
  Layers,
  HelpCircle
} from "lucide-react";
import type {
  Assessment,
  AssessmentAttempt,
  ContentTabData,
  FlashcardContent,
  FlowchartContent,
  LearningObjectContent,
  NoteContent,
  PdfContent,
  PlaygroundContent,
  PracticeSetContent,
  RevisionSheetContent,
  VisualExplanationContent,
  WorkedExampleContent
} from "@/types/learning";
import { VideoGallery } from "@/components/content/VideoGallery";
import { MarkdownRenderer } from "@/components/content/MarkdownRenderer";
import { PDFViewer } from "@/components/content/PDFViewer";
import { FlashcardDeck } from "@/components/content/FlashcardDeck";
import { CodePlayground } from "@/components/content/CodePlayground";
import { QuizSession } from "@/components/lo/QuizSession";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { IDLE_THRESHOLD_SECONDS } from "@/lib/tracking/constants";

const OPEN_SESSION_REUSE_WINDOW_SECONDS = 20;
const TRACKING_BOOT_DELAY_MS = 1000;

interface Props {
  data: ContentTabData;
  assessment?: Assessment & { questions: any[] };
  attempts?: AssessmentAttempt[];
  recommended?: string;
  trackingContext?: {
    enabled: boolean;
    studentId: string | null;
    submissionId: string;
    courseId: string;
    learningObjectId: string;
    teacherId: string;
  };
}

const TAB_ORDER = [
  { key: "conceptNotes", label: "Concept Notes", icon: "📝" },
  { key: "flowchart", label: "Flowchart", icon: "🧭" },
  { key: "visualExplanation", label: "Visual", icon: "🖼" },
  { key: "workedExample", label: "Worked Example", icon: "🧠" },
  { key: "practiceSet", label: "Practice", icon: "✍" },
  { key: "revisionSheet", label: "Revision", icon: "📌" },
  { key: "video", label: "Videos", icon: "▶" },
  { key: "notes", label: "Reading", icon: "📖" },
  { key: "pdf", label: "PDF", icon: "📄" },
  { key: "playground", label: "Playground", icon: "💻" },
  { key: "flashcards", label: "Flashcards", icon: "🃏" }
] as const;

type TabKey = (typeof TAB_ORDER)[number]["key"];

type ContentBlock = {
  key: string;
  code: string;
  label: string;
  content: LearningObjectContent;
};

export function DeliveryTypeTabs({
  data,
  assessment,
  attempts,
  recommended,
  trackingContext,
}: Props) {
  const orderedBlocks = useMemo(() => {
    if (data.blocks && data.blocks.length > 0) {
      return data.blocks;
    }

    const legacyBlocks: LearningObjectContent[] = [];
    TAB_ORDER.forEach((tab) => {
      const entries = data[tab.key as keyof ContentTabData] as LearningObjectContent[] | undefined;
      if (entries?.length) {
        legacyBlocks.push(...entries);
      }
    });

    return legacyBlocks;
  }, [data]);

  const blocks = useMemo<ContentBlock[]>(() => {
    return orderedBlocks.map((content, index) => {
      const code = content.delivery_type?.code ?? "UNKNOWN";
      return {
        key: `${content.id}-${index}`,
        code,
        label: content.title?.trim() || content.delivery_type?.name || `Block ${index + 1}`,
        content
      };
    });
  }, [orderedBlocks]);

  const defaultValue = useMemo(() => {
    if (blocks.length === 0) return "empty";
    if (!recommended) return blocks[0].key;

    const recommendedBlock = blocks.find((block) => mapCodeToLegacyKey(block.code) === recommended);
    return recommendedBlock?.key ?? blocks[0].key;
  }, [blocks, recommended]);

  const [activeValue, setActiveValue] = useState(defaultValue);
  const [isIdleModalOpen, setIsIdleModalOpen] = useState(false);

  const supabaseRef = useRef(createSupabaseBrowserClient());
  const mountedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bootTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAtMsRef = useRef<number>(0);
  const lastActivityMsRef = useRef(Date.now());
  const isIdleRef = useRef(false);
  const currentTabRef = useRef(defaultValue);
  const totalActiveSecondsRef = useRef(0);
  const totalIdleSecondsRef = useRef(0);
  const finalizedRef = useRef(false);
  const sessionInstanceIdRef = useRef(
    `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
  const lifecycleRunIdRef = useRef(0);
  const activeLifecycleRunIdRef = useRef<number | null>(null);
  const bootingSessionRef = useRef(false);
  const sessionScopeKeyRef = useRef<string | null>(null);
  const pendingByTabRef = useRef<Record<string, { active: number; idle: number }>>({});
  const tabMetaMapRef = useRef(new Map<string, { contentId: string; deliveryTypeId: string; isQuiz: boolean }>());

  const isDev = process.env.NODE_ENV !== "production";
  const logDev = useCallback(
    (...args: unknown[]) => {
      if (!isDev) {
        return;
      }

      console.log("[DeliveryTypeTabs][tracking]", ...args);
    },
    [isDev]
  );

  const tabMetaMap = useMemo(() => {
    const map = new Map<
      string,
      { contentId: string; deliveryTypeId: string; isQuiz: boolean }
    >();

    blocks.forEach((block) => {
      map.set(block.key, {
        contentId: String(block.content.id ?? ""),
        deliveryTypeId: String(block.content.delivery_type_id ?? ""),
        isQuiz:
          block.content.delivery_type?.code === "QUIZ" ||
          String(block.content.delivery_type_id ?? "") === "QUIZ",
      });
    });

    return map;
  }, [blocks]);

  useEffect(() => {
    tabMetaMapRef.current = tabMetaMap;
  }, [tabMetaMap]);

  const persistContentDelta = useCallback(
    async (tabValue: string, activeSeconds: number, idleSeconds: number) => {
      try {
        if (!trackingContext?.enabled || !trackingContext.studentId) {
          return;
        }

        if (activeSeconds <= 0 && idleSeconds <= 0) {
          return;
        }

        const meta = tabMetaMapRef.current.get(tabValue);
        if (!meta || !meta.contentId || meta.isQuiz) {
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabaseRef.current as any;
        const { data: existingRow, error: existingErr } = await supabaseAny
          .from("student_content_block_time")
          .select("id, active_seconds, idle_seconds, first_viewed_at")
          .eq("student_id", trackingContext.studentId)
          .eq("submission_id", trackingContext.submissionId)
          .eq("content_id", meta.contentId)
          .maybeSingle();

        if (existingErr) {
          throw existingErr;
        }

        const nowIso = new Date().toISOString();

        if (existingRow?.id) {
          const firstViewedAt =
            typeof existingRow.first_viewed_at === "string" ? existingRow.first_viewed_at : null;
          const firstViewedAtMs = firstViewedAt ? Date.parse(firstViewedAt) : NaN;
          const nowMs = Date.parse(nowIso);
          const lastViewedAt =
            Number.isFinite(firstViewedAtMs) && Number.isFinite(nowMs) && nowMs < firstViewedAtMs
              ? new Date(firstViewedAtMs).toISOString()
              : nowIso;

          const { error: updateErr } = await supabaseAny
            .from("student_content_block_time")
            .update({
              active_seconds: Number(existingRow.active_seconds ?? 0) + activeSeconds,
              idle_seconds: Number(existingRow.idle_seconds ?? 0) + idleSeconds,
              last_viewed_at: lastViewedAt,
            })
            .eq("id", existingRow.id);

          if (updateErr) {
            throw updateErr;
          }
          return;
        }

        const viewedAt = nowIso;

        const { error: insertErr } = await supabaseAny.from("student_content_block_time").insert({
          student_id: trackingContext.studentId,
          submission_id: trackingContext.submissionId,
          content_id: meta.contentId,
          delivery_type_id: meta.deliveryTypeId,
          active_seconds: activeSeconds,
          idle_seconds: idleSeconds,
          first_viewed_at: viewedAt,
          last_viewed_at: viewedAt,
        });

        if (insertErr) {
          throw insertErr;
        }
      } catch (persistErr) {
        console.error("[DeliveryTypeTabs] Failed to persist content delta:", persistErr);
      } finally {
        // no-op
      }
    },
    [trackingContext]
  );

  const flushTabSeconds = useCallback(
    async (tabValue: string) => {
      try {
        const tracked = pendingByTabRef.current[tabValue];
        if (!tracked) {
          return;
        }

        const activeSeconds = tracked.active;
        const idleSeconds = tracked.idle;
        tracked.active = 0;
        tracked.idle = 0;

        await persistContentDelta(tabValue, activeSeconds, idleSeconds);
      } catch (flushErr) {
        console.error("[DeliveryTypeTabs] Failed to flush tab seconds:", flushErr);
      } finally {
        // no-op
      }
    },
    [persistContentDelta]
  );

  const resumeFromIdleModal = useCallback(() => {
    try {
      lastActivityMsRef.current = Date.now();
      isIdleRef.current = false;
      if (mountedRef.current) {
        setIsIdleModalOpen(false);
      }
    } catch (resumeErr) {
      console.error("[DeliveryTypeTabs] Failed to resume from idle:", resumeErr);
    } finally {
      // no-op
    }
  }, []);

  const tryFinalizeWithBeacon = useCallback(
    (
      reason: "pagehide" | "beforeunload",
      lifecycleRunId: number,
      sessionInstanceId: string
    ): boolean => {
    try {
      if (
        activeLifecycleRunIdRef.current !== lifecycleRunId ||
        sessionInstanceIdRef.current !== sessionInstanceId
      ) {
        return false;
      }

      if (
        !trackingContext?.enabled ||
        !trackingContext.studentId ||
        !sessionIdRef.current ||
        finalizedRef.current
      ) {
        return false;
      }

      if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
        return false;
      }

      const hasNoCounters = totalActiveSecondsRef.current <= 0 && totalIdleSecondsRef.current <= 0;
      const elapsedMs = Date.now() - sessionStartedAtMsRef.current;
      if (hasNoCounters && elapsedMs < 1000) {
        return false;
      }

      const endedAt = new Date().toISOString();
      const contentDeltas = Object.entries(pendingByTabRef.current)
        .map(([tabValue, counters]) => {
          const meta = tabMetaMapRef.current.get(tabValue);
          if (!meta || !meta.contentId || meta.isQuiz) {
            return null;
          }

          return {
            content_id: meta.contentId,
            delivery_type_id: meta.deliveryTypeId,
            active_seconds: counters.active,
            idle_seconds: counters.idle,
          };
        })
        .filter(
          (item): item is { content_id: string; delivery_type_id: string; active_seconds: number; idle_seconds: number } =>
            Boolean(item) && ((item?.active_seconds ?? 0) > 0 || (item?.idle_seconds ?? 0) > 0)
        );

      const payload = {
        sessionId: sessionIdRef.current,
        studentId: trackingContext.studentId,
        submissionId: trackingContext.submissionId,
        activeSeconds: totalActiveSecondsRef.current,
        idleSeconds: totalIdleSecondsRef.current,
        endedAt,
        contentDeltas,
      };

      const beaconBody = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const sent = navigator.sendBeacon("/api/tracking/finalize-session", beaconBody);

      if (!sent) {
        return false;
      }

      finalizedRef.current = true;
      logDev("session finalized (beacon)", {
        reason,
        sessionId: sessionIdRef.current,
        activeSeconds: totalActiveSecondsRef.current,
        idleSeconds: totalIdleSecondsRef.current,
        contentDeltas: contentDeltas.length,
      });
      Object.keys(pendingByTabRef.current).forEach((tabValue) => {
        pendingByTabRef.current[tabValue] = { active: 0, idle: 0 };
      });
      return true;
    } catch (beaconErr) {
      console.error("[DeliveryTypeTabs] sendBeacon finalize failed:", beaconErr);
      return false;
    } finally {
      // no-op
    }
  },
    [logDev, trackingContext]
  );

  const finalizeSession = useCallback(
    async (
      reason: "unmount" | "pagehide" | "beforeunload",
      lifecycleRunId: number,
      sessionInstanceId: string
    ) => {
    try {
      if (
        activeLifecycleRunIdRef.current !== lifecycleRunId ||
        sessionInstanceIdRef.current !== sessionInstanceId
      ) {
        return;
      }

      if (finalizedRef.current) {
        return;
      }

      if (!sessionIdRef.current) {
        return;
      }

      finalizedRef.current = true;

      const currentTab = currentTabRef.current;
      if (currentTab) {
        await flushTabSeconds(currentTab);
      }

      let finalActiveSeconds = totalActiveSecondsRef.current;
      let finalIdleSeconds = totalIdleSecondsRef.current;
      const hasNoCounters = finalActiveSeconds <= 0 && finalIdleSeconds <= 0;
      const elapsedMs = Date.now() - sessionStartedAtMsRef.current;

      if (hasNoCounters && elapsedMs > 1000) {
        finalActiveSeconds = Math.max(1, Math.floor(elapsedMs / 1000));
        totalActiveSecondsRef.current = finalActiveSeconds;
        totalIdleSecondsRef.current = finalIdleSeconds;

        logDev("elapsed fallback applied", {
          reason,
          sessionId: sessionIdRef.current,
          elapsedMs,
          activeSeconds: finalActiveSeconds,
          idleSeconds: finalIdleSeconds,
        });
      }

      if (hasNoCounters && elapsedMs < 1000) {
        finalizedRef.current = false;
        return;
      }

      if (!trackingContext?.enabled || !trackingContext.studentId) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabaseAny = supabaseRef.current as any;
      const { error: updateErr } = await supabaseAny
        .from("student_submission_visit")
        .update({
          ended_at: new Date().toISOString(),
          active_seconds: finalActiveSeconds,
          idle_seconds: finalIdleSeconds,
        })
        .eq("id", sessionIdRef.current)
        .eq("student_id", trackingContext.studentId);

      if (updateErr) {
        throw updateErr;
      }

      logDev("session finalized", {
        reason,
        sessionId: sessionIdRef.current,
        activeSeconds: finalActiveSeconds,
        idleSeconds: finalIdleSeconds,
      });
    } catch (finalizeErr) {
      console.error("[DeliveryTypeTabs] Failed to finalize session:", finalizeErr);
    } finally {
      // no-op
    }
  },
    [flushTabSeconds, logDev, trackingContext]
  );

  useEffect(() => {
    setActiveValue(defaultValue);
    currentTabRef.current = defaultValue;
  }, [defaultValue]);

  useEffect(() => {
    mountedRef.current = true;
    finalizedRef.current = false;

    const lifecycleRunId = lifecycleRunIdRef.current + 1;
    lifecycleRunIdRef.current = lifecycleRunId;
    activeLifecycleRunIdRef.current = lifecycleRunId;
    const sessionInstanceId = sessionInstanceIdRef.current;

    const tracking = trackingContext;

    if (!tracking?.enabled || !tracking.studentId) {
      return () => {
        mountedRef.current = false;
      };
    }

    const markActivity = () => {
      try {
        if (isIdleRef.current) {
          return;
        }

        lastActivityMsRef.current = Date.now();
      } catch (activityErr) {
        console.error("[DeliveryTypeTabs] Failed to mark activity:", activityErr);
      } finally {
        // no-op
      }
    };

    const startInterval = () => {
      try {
        if (intervalRef.current) {
          return;
        }

        intervalRef.current = setInterval(() => {
          try {
            const nowMs = Date.now();
            const inactiveForSeconds = Math.floor((nowMs - lastActivityMsRef.current) / 1000);
            const shouldBeIdle = inactiveForSeconds >= IDLE_THRESHOLD_SECONDS;

            if (shouldBeIdle !== isIdleRef.current) {
              const previousIdleState = isIdleRef.current;
              isIdleRef.current = shouldBeIdle;
              if (mountedRef.current) {
                setIsIdleModalOpen(shouldBeIdle);
              }

              if (!previousIdleState && shouldBeIdle) {
                const currentTab = currentTabRef.current;
                if (currentTab) {
                  void flushTabSeconds(currentTab);
                }
              }
            }

            const activeTab = currentTabRef.current;
            if (!activeTab) {
              return;
            }

            const tracked =
              pendingByTabRef.current[activeTab] ??
              (pendingByTabRef.current[activeTab] = { active: 0, idle: 0 });

            if (isIdleRef.current) {
              tracked.idle += 1;
              totalIdleSecondsRef.current += 1;
              return;
            }

            tracked.active += 1;
            totalActiveSecondsRef.current += 1;
          } catch (tickErr) {
            console.error("[DeliveryTypeTabs] Tracking tick failed:", tickErr);
          } finally {
            // no-op
          }
        }, 1000);
      } catch (intervalErr) {
        console.error("[DeliveryTypeTabs] Failed to start tracking interval:", intervalErr);
      } finally {
        // no-op
      }
    };

    const bootTracking = async () => {
      try {
        if (activeLifecycleRunIdRef.current !== lifecycleRunId) {
          return;
        }

        const scopeKey = `${tracking.studentId}:${tracking.submissionId}:${tracking.learningObjectId}`;
        const hasSameScope = sessionScopeKeyRef.current === scopeKey;
        if (hasSameScope && (bootingSessionRef.current || sessionIdRef.current)) {
          return;
        }

        bootingSessionRef.current = true;
        sessionScopeKeyRef.current = scopeKey;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabaseRef.current as any;
        const nowIso = new Date().toISOString();
        const reuseThresholdIso = new Date(
          Date.now() - OPEN_SESSION_REUSE_WINDOW_SECONDS * 1000
        ).toISOString();
        const { data: openSession, error: openSessionErr } = await supabaseAny
          .from("student_submission_visit")
          .select("id, active_seconds, idle_seconds, started_at")
          .eq("student_id", tracking.studentId)
          .eq("submission_id", tracking.submissionId)
          .eq("course_id", tracking.courseId)
          .eq("learning_object_id", tracking.learningObjectId)
          .eq("teacher_id", tracking.teacherId)
          .is("ended_at", null)
          .gte("started_at", reuseThresholdIso)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openSessionErr) {
          throw openSessionErr;
        }

        if (openSession?.id) {
          sessionIdRef.current = openSession.id;
          sessionStartedAtMsRef.current = Date.now();
          totalActiveSecondsRef.current = Number(openSession.active_seconds ?? 0);
          totalIdleSecondsRef.current = Number(openSession.idle_seconds ?? 0);
          pendingByTabRef.current = {};
          logDev("session reused", {
            sessionId: openSession.id,
            activeSeconds: totalActiveSecondsRef.current,
            idleSeconds: totalIdleSecondsRef.current,
          });
          return;
        }

        // Fresh session: isolate counters from any previous lifecycle/session.
        totalActiveSecondsRef.current = 0;
        totalIdleSecondsRef.current = 0;
        pendingByTabRef.current = {};
        finalizedRef.current = false;

        const { data: createdSession, error: insertErr } = await supabaseAny
          .from("student_submission_visit")
          .insert({
            student_id: tracking.studentId,
            submission_id: tracking.submissionId,
            course_id: tracking.courseId,
            learning_object_id: tracking.learningObjectId,
            teacher_id: tracking.teacherId,
            started_at: nowIso,
          })
          .select("id")
          .single();

        if (insertErr) {
          throw insertErr;
        }

        sessionIdRef.current = createdSession?.id ?? null;
        sessionStartedAtMsRef.current = Date.now();
        logDev("session created", {
          sessionId: sessionIdRef.current,
          activeSeconds: totalActiveSecondsRef.current,
          idleSeconds: totalIdleSecondsRef.current,
        });
      } catch (bootErr) {
        console.error("[DeliveryTypeTabs] Failed to create visit session:", bootErr);
      } finally {
        bootingSessionRef.current = false;
        if (activeLifecycleRunIdRef.current === lifecycleRunId) {
          startInterval();
        }
      }
    };

    const eventOptions = { passive: true };
    const handlePageHide = () => {
      try {
        const sentByBeacon = tryFinalizeWithBeacon(
          "pagehide",
          lifecycleRunId,
          sessionInstanceId
        );
        if (!sentByBeacon) {
          void finalizeSession("pagehide", lifecycleRunId, sessionInstanceId);
        }
      } catch (pageHideErr) {
        console.error("[DeliveryTypeTabs] pagehide finalize failed:", pageHideErr);
      } finally {
        // no-op
      }
    };

    const handleBeforeUnload = () => {
      try {
        const sentByBeacon = tryFinalizeWithBeacon(
          "beforeunload",
          lifecycleRunId,
          sessionInstanceId
        );
        if (!sentByBeacon) {
          void finalizeSession("beforeunload", lifecycleRunId, sessionInstanceId);
        }
      } catch (beforeUnloadErr) {
        console.error("[DeliveryTypeTabs] beforeunload finalize failed:", beforeUnloadErr);
      } finally {
        // no-op
      }
    };

    window.addEventListener("mousemove", markActivity, eventOptions);
    window.addEventListener("keydown", markActivity, eventOptions);
    window.addEventListener("scroll", markActivity, eventOptions);
    window.addEventListener("click", markActivity, eventOptions);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);

    if (bootTimeoutRef.current) {
      clearTimeout(bootTimeoutRef.current);
      bootTimeoutRef.current = null;
    }

    bootTimeoutRef.current = setTimeout(() => {
      if (activeLifecycleRunIdRef.current !== lifecycleRunId) {
        return;
      }

      void bootTracking();
    }, TRACKING_BOOT_DELAY_MS);

    return () => {
      const cleanup = async () => {
        try {
          mountedRef.current = false;

          if (bootTimeoutRef.current) {
            clearTimeout(bootTimeoutRef.current);
            bootTimeoutRef.current = null;
          }

          window.removeEventListener("mousemove", markActivity);
          window.removeEventListener("keydown", markActivity);
          window.removeEventListener("scroll", markActivity);
          window.removeEventListener("click", markActivity);
          window.removeEventListener("pagehide", handlePageHide);
          window.removeEventListener("beforeunload", handleBeforeUnload);

          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          await finalizeSession("unmount", lifecycleRunId, sessionInstanceId);

          if (activeLifecycleRunIdRef.current === lifecycleRunId) {
            activeLifecycleRunIdRef.current = null;
          }
        } catch (cleanupErr) {
          console.error("[DeliveryTypeTabs] Cleanup failed:", cleanupErr);
        } finally {
          // no-op
        }
      };

      void cleanup();
    };
  }, [finalizeSession, flushTabSeconds, logDev, trackingContext, tryFinalizeWithBeacon]);

  useEffect(() => {
    try {
      if (!trackingContext?.enabled) {
        return;
      }

      if (!isIdleModalOpen) {
        document.body.style.overflow = "";
        return;
      }

      document.body.style.overflow = "hidden";
    } catch (scrollLockErr) {
      console.error("[DeliveryTypeTabs] Failed to toggle scroll lock:", scrollLockErr);
    } finally {
      // no-op
    }

    return () => {
      try {
        document.body.style.overflow = "";
      } catch (cleanupErr) {
        console.error("[DeliveryTypeTabs] Failed to cleanup scroll lock:", cleanupErr);
      } finally {
        // no-op
      }
    };
  }, [isIdleModalOpen, trackingContext?.enabled]);

  async function handleContentChange(nextValue: string) {
    try {
      const previousValue = currentTabRef.current;
      currentTabRef.current = nextValue;
      setActiveValue(nextValue);
      if (!previousValue || previousValue === nextValue) {
        return;
      }

      const tracking = trackingContext;
      const tracked = pendingByTabRef.current[previousValue];
      if (!tracked || (!tracked.active && !tracked.idle)) {
        return;
      }

      if (!tracking?.enabled || !tracking.studentId) {
        tracked.active = 0;
        tracked.idle = 0;
        return;
      }

      const meta = tabMetaMap.get(previousValue);
      if (!meta || !meta.contentId || meta.isQuiz) {
        tracked.active = 0;
        tracked.idle = 0;
        return;
      }

      const flushActive = tracked.active;
      const flushIdle = tracked.idle;
      tracked.active = 0;
      tracked.idle = 0;
      await persistContentDelta(previousValue, flushActive, flushIdle);
    } catch (changeErr) {
      console.error("[DeliveryTypeTabs] Failed to track content change:", changeErr);
    } finally {
      // no-op
    }
  }

  if (blocks.length === 0) {
    return <p className="text-sm text-slate-400">Content coming soon.</p>;
  }

  return (
    <>
      <Tabs
        value={activeValue}
        onValueChange={(value) => {
          void handleContentChange(value);
        }}
        className="w-full space-y-4"
      >
      {/* ── Scrollable tab strip ── */}
      <div className="overflow-x-auto">
        <TabsList className="w-max rounded-lg border border-slate-800/60 bg-slate-900/40 p-1.5 gap-1">
          {blocks.map((block, index) => {
            const isRecommended = mapCodeToLegacyKey(block.code) === recommended;
            return (
              <TabsTrigger
                key={block.key}
                value={block.key}
                className={`whitespace-nowrap text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${
                  isRecommended
                    ? "border border-brand/35 bg-brand/12 !text-brand font-semibold data-[state=active]:bg-brand/20 data-[state=active]:text-brand data-[state=active]:shadow-none"
                    : ""
                }`}
              >
                {getBlockIcon(block.code)}
                <span>
                  <span className="mr-1 font-mono text-[10px] text-slate-600">{index + 1}.</span>
                  {block.label}
                </span>
                {isRecommended && (
                  <span className="ml-0.5 rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-label bg-brand/20 text-brand">
                    Pick
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {blocks.map((block) => {
        return (
          <TabsContent
            key={block.key}
            value={block.key}
            className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6 backdrop-blur-[1px]"
          >
            <ContentRenderer
              content={block.content}
              assessment={assessment}
              attempts={attempts}
              trackingContext={
                trackingContext
                  ? {
                      enabled: trackingContext.enabled,
                      studentId: trackingContext.studentId,
                      submissionId: trackingContext.submissionId,
                    }
                  : undefined
              }
            />
          </TabsContent>
        );
      })}
      </Tabs>

      {trackingContext?.enabled && isIdleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xl"
          onScroll={(e) => {
            e.preventDefault();
          }}
          aria-modal="true"
          role="dialog"
        >
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 px-6 py-4 text-center shadow-xl">
            <p className="text-base font-semibold text-slate-100">Session paused due to inactivity</p>
            <p className="mt-1 text-sm text-slate-300">Click below to continue learning.</p>
            <button
              type="button"
              onClick={resumeFromIdleModal}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-brand/40 bg-brand/20 px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
            >
              Yes, I’m still here
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ContentRenderer({
  content,
  assessment,
  attempts,
  trackingContext
}: {
  content: LearningObjectContent;
  assessment?: Assessment & { questions: any[] };
  attempts?: AssessmentAttempt[];
  trackingContext?: {
    enabled: boolean;
    studentId: string | null;
    submissionId: string;
  };
}) {
  const code = content.delivery_type?.code;
  const mapped = mapCodeToLegacyKey(code);

  switch (mapped) {
    case "conceptNotes":
      return <MarkdownRenderer data={{ markdown: getMarkdown(content.content_json) }} />;
    case "flowchart": {
      const data = content.content_json as FlowchartContent;
      return (
        <MediaPanel
          imageUrl={data.image_url}
          title={content.title}
          caption={data.caption}
        />
      );
    }
    case "visualExplanation": {
      const data = content.content_json as VisualExplanationContent;
      return (
        <VisualMediaPanel
          mediaUrl={data.image_url}
          title={content.title}
          caption={data.caption}
          body={data.text}
        />
      );
    }
    case "workedExample": {
      const data = content.content_json as WorkedExampleContent;
      return (
        <div className="space-y-4">
          <Block title="Problem" value={data.problem} />
          <Block title="Solution" value={data.solution} />
          <Block title="Explanation" value={data.explanation} />
        </div>
      );
    }
    case "practiceSet": {
      const data = content.content_json as PracticeSetContent;
      const questions = normalizeQuestions(data.questions);
      if (questions.length === 0) {
        return <p className="text-sm text-slate-500">No practice questions yet.</p>;
      }
      return (
        <ol className="space-y-3">
          {questions.map((question, idx) => (
            <li
              key={`${idx}-${question}`}
              className="flex gap-3 rounded-lg border border-slate-800/50 bg-slate-900/40 px-4 py-3 text-sm leading-relaxed text-slate-200"
            >
              <span className="mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-500">
                {idx + 1}
              </span>
              {question}
            </li>
          ))}
        </ol>
      );
    }
    case "revisionSheet": {
      const data = content.content_json as RevisionSheetContent;
      return (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-5 py-4 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
          {data.summary || "No revision summary yet."}
        </div>
      );
    }
    case "video":
      return <VideoGallery items={[content]} />;
    case "notes":
      return <MarkdownRenderer data={content.content_json as NoteContent} />;
    case "pdf":
      return <PDFViewer url={(content.content_json as PdfContent).pdf_url} pageCount={(content.content_json as PdfContent).page_count} />;
    case "playground":
      return <CodePlayground data={content.content_json as PlaygroundContent} />;
    case "flashcards":
      return <FlashcardDeck data={content.content_json as FlashcardContent} />;
    case "quiz":
      return (
        <QuizSession
          assessment={assessment}
          attempts={attempts}
          trackingContext={trackingContext}
        />
      );
    default:
      return <p className="text-sm text-slate-400">Content coming soon.</p>;
  }
}

function mapCodeToLegacyKey(code?: string): TabKey | "quiz" | "unknown" {
  switch (code) {
    case "CONCEPT_NOTES":
      return "conceptNotes";
    case "FLOWCHART":
      return "flowchart";
    case "VISUAL_EXPLANATION":
      return "visualExplanation";
    case "WORKED_EXAMPLE":
      return "workedExample";
    case "PRACTICE_SET":
      return "practiceSet";
    case "REVISION_SHEET":
      return "revisionSheet";
    case "VIDEO":
      return "video";
    case "READING_NOTES":
      return "notes";
    case "READING_PDF":
      return "pdf";
    case "PLAYGROUND":
      return "playground";
    case "FLASHCARD":
    case "FLASHCARDS":
      return "flashcards";
    case "QUIZ":
      return "quiz";
    default:
      return "unknown";
  }
}

function getBlockIcon(code?: string): React.ReactNode {
  const cls = "h-3.5 w-3.5 flex-shrink-0";
  const mapped = mapCodeToLegacyKey(code);
  switch (mapped) {
    case "conceptNotes":    return <FileText className={cls} />;
    case "flowchart":       return <GitBranch className={cls} />;
    case "visualExplanation": return <Image className={cls} />;
    case "workedExample":   return <Brain className={cls} />;
    case "practiceSet":     return <ClipboardList className={cls} />;
    case "revisionSheet":   return <Bookmark className={cls} />;
    case "video":           return <Play className={cls} />;
    case "notes":           return <BookOpen className={cls} />;
    case "pdf":             return <FileStack className={cls} />;
    case "playground":      return <Code2 className={cls} />;
    case "flashcards":      return <Layers className={cls} />;
    case "quiz":            return <HelpCircle className={cls} />;
    default:                return <BookOpen className={cls} />;
  }
}

function getMarkdown(contentJson: unknown): string {
  const content = (contentJson ?? {}) as Record<string, unknown>;
  const markdown = typeof content.markdown === "string" ? content.markdown : "";
  const summary = typeof content.summary === "string" ? content.summary : "";
  return markdown || summary || "No notes available yet.";
}

function normalizeQuestions(questions: unknown): string[] {
  if (!Array.isArray(questions)) return [];
  return questions
    .map((question) => (typeof question === "string" ? question.trim() : ""))
    .filter(Boolean);
}

function Block({ title, value }: { title: string; value?: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-800/60 bg-slate-950/40">
      <div className="border-b border-slate-800/60 bg-slate-900/40 px-4 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-label text-slate-600">{title}</p>
      </div>
      <p className="px-4 py-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
        {value || "Not provided."}
      </p>
    </section>
  );
}

function MediaPanel({
  imageUrl,
  title,
  caption,
  body
}: {
  imageUrl?: string;
  title?: string;
  caption?: string;
  body?: string;
}) {
  if (!imageUrl) {
    return (
      <p className="text-sm text-slate-500">No image available yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      <img
        src={imageUrl}
        alt={title || "Visual content"}
        className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 object-contain"
      />
      {caption && (
        <p className="text-sm leading-relaxed text-slate-400">{caption}</p>
      )}
      {body && (
        <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{body}</p>
      )}
    </div>
  );
}

function VisualMediaPanel({
  mediaUrl,
  title,
  caption,
  body,
}: {
  mediaUrl?: string;
  title?: string;
  caption?: string;
  body?: string;
}) {
  const trimmedUrl = mediaUrl?.trim() ?? "";

  if (!trimmedUrl) {
    return <p className="text-sm text-slate-500">No visual media available yet.</p>;
  }

  const youtubeEmbedUrl = getYouTubeEmbedUrl(trimmedUrl);

  if (youtubeEmbedUrl) {
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-slate-800/60 bg-slate-950/60">
          <iframe
            src={youtubeEmbedUrl}
            title={title || "Visual explanation video"}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <VisualMediaText caption={caption} body={body} />
      </div>
    );
  }

  if (isDirectVideoUrl(trimmedUrl)) {
    return (
      <div className="space-y-4">
        <video
          src={trimmedUrl}
          controls
          preload="metadata"
          className="aspect-video w-full rounded-xl border border-slate-800/60 bg-slate-950/60"
        >
          Your browser does not support the video tag.
        </video>
        <VisualMediaText caption={caption} body={body} />
      </div>
    );
  }

  if (isLikelyImageUrl(trimmedUrl)) {
    return (
      <MediaPanel
        imageUrl={trimmedUrl}
        title={title}
        caption={caption}
        body={body}
      />
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
      <p className="text-sm text-slate-300">
        Unsupported media preview format. Open link:
      </p>
      <a
        href={trimmedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-sm text-brand hover:text-brand/80"
      >
        {trimmedUrl}
      </a>
      <VisualMediaText caption={caption} body={body} />
    </div>
  );
}

function VisualMediaText({ caption, body }: { caption?: string; body?: string }) {
  return (
    <>
      {caption && (
        <p className="text-sm leading-relaxed text-slate-400">{caption}</p>
      )}
      {body && (
        <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{body}</p>
      )}
    </>
  );
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isLikelyImageUrl(url: string): boolean {
  const lowered = url.toLowerCase();

  if (lowered.startsWith("data:image/")) {
    return true;
  }

  const parsed = parseUrl(url);

  if (!parsed) {
    return false;
  }

  const pathname = parsed.pathname.toLowerCase();

  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(pathname)) {
    return true;
  }

  const imageHosts = [
    "unsplash.com",
    "images.unsplash.com",
    "imgur.com",
    "i.imgur.com",
    "res.cloudinary.com",
    "googleusercontent.com",
    "gstatic.com",
  ];

  if (imageHosts.some((host) => parsed.hostname.includes(host))) {
    return true;
  }

  const query = parsed.search.toLowerCase();
  if (/format=(png|jpe?g|webp|gif|avif|svg)/.test(query)) {
    return true;
  }

  return false;
}

function isDirectVideoUrl(url: string): boolean {
  const lowered = url.toLowerCase();

  if (lowered.startsWith("data:video/")) {
    return true;
  }

  const parsed = parseUrl(url);

  if (!parsed) {
    return false;
  }

  return /\.(mp4|webm|ogg)$/i.test(parsed.pathname.toLowerCase());
}

function getYouTubeEmbedUrl(url: string): string | null {
  const parsed = parseUrl(url);

  if (!parsed) {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  let videoId: string | null = null;

  if (host.includes("youtube.com")) {
    videoId = parsed.searchParams.get("v");

    if (!videoId && parsed.pathname.startsWith("/shorts/")) {
      videoId = parsed.pathname.split("/")[2] ?? null;
    }
  } else if (host.includes("youtu.be")) {
    videoId = parsed.pathname.slice(1).split("/")[0] || null;
  }

  if (!videoId) {
    return null;
  }

  return `https://www.youtube.com/embed/${videoId}`;
}
