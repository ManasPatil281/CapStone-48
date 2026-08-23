"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Global, generic top-of-app loading indicator for internal Next.js App
 * Router navigations (Link clicks, router.push/replace, back/forward).
 *
 * Detection strategy:
 *
 * - START (primary): a document-level, CAPTURE-phase `click` listener on
 *   real internal anchor clicks. This is the earliest possible synchronous
 *   signal — it runs before Next's own `<Link>` onClick handler (attached in
 *   the bubble phase) and before the router does any work at all, so
 *   feedback begins the instant the user clicks rather than only once the
 *   router gets around to updating the URL. It never calls
 *   preventDefault/stopPropagation and never navigates itself — it only
 *   flips the loading indicator on, then lets Next/the browser handle the
 *   click completely normally.
 * - START (secondary/fallback): patched `history.pushState`/`replaceState`
 *   plus a `popstate` listener, kept for navigations the click listener
 *   can't see — `router.push`/`router.replace` calls from a button/handler,
 *   and browser back/forward. Next 14 has no public "navigation started"
 *   hook of its own (that only arrived in Next 15's `useLinkStatus`).
 * - END: `usePathname()`/`useSearchParams()` change once the destination
 *   route has actually committed — this is the router's own signal that
 *   navigation finished, including query-param-only navigations (e.g. the
 *   roadmap's `?lo=` links) where the pathname alone never changes.
 * - SAFETY NET: a bounded timeout clears the indicator even if pathname/
 *   search params never change (e.g. a link to the current URL) or a
 *   navigation errors out, so the loading/cursor state can never get stuck.
 */

const NAVIGATION_START_EVENT = "pf:navigation-start";
const MAX_NAVIGATION_MS = 8000;

let historyPatched = false;

function patchHistoryOnce() {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function patchedPushState(...args: Parameters<History["pushState"]>) {
    window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
    return originalPushState(...args);
  };

  window.history.replaceState = function patchedReplaceState(...args: Parameters<History["replaceState"]>) {
    window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
    return originalReplaceState(...args);
  };

  window.addEventListener("popstate", () => {
    window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
  });
}

/**
 * True only for a plain, unmodified left-click on a same-origin anchor that
 * will actually cause an internal route change — mirrors the exact set of
 * conditions Next's own <Link> uses to decide whether to intercept a click,
 * so this stays in lockstep with what will really happen. Detection only:
 * never mutates the event or navigates.
 */
function isTrackableInternalAnchorClick(event: MouseEvent): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false; // only the primary/left mouse button
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  const target = event.target;
  if (!(target instanceof Element)) return false;

  const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return false;

  if (anchor.target && anchor.target !== "_self") return false; // _blank / _parent / _top
  if (anchor.hasAttribute("download")) return false;

  // HTMLAnchorElement resolves `.protocol`/`.origin`/`.pathname`/`.search` to
  // the browser's fully-parsed absolute URL regardless of how `href` was
  // authored, so this also correctly rejects mailto:, tel:, javascript:, etc.
  if (anchor.protocol !== "http:" && anchor.protocol !== "https:") return false;
  if (anchor.origin !== window.location.origin) return false;

  const isSameLocation =
    anchor.pathname === window.location.pathname && anchor.search === window.location.search;
  if (isSameLocation) return false; // hash-only jump on this page, or link to the exact current URL

  return true;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    patchHistoryOnce();

    function handleNavigationStart() {
      setIsNavigating(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsNavigating(false), MAX_NAVIGATION_MS);
    }

    function handleDocumentClickCapture(event: MouseEvent) {
      if (isTrackableInternalAnchorClick(event)) {
        handleNavigationStart();
      }
    }

    window.addEventListener(NAVIGATION_START_EVENT, handleNavigationStart);
    // Capture phase: runs before Next's <Link> bubble-phase onClick handler.
    document.addEventListener("click", handleDocumentClickCapture, { capture: true });

    return () => {
      window.removeEventListener(NAVIGATION_START_EVENT, handleNavigationStart);
      document.removeEventListener("click", handleDocumentClickCapture, { capture: true });
    };
  }, []);

  // The destination route has committed once pathname/searchParams settle on
  // their new values — clear the indicator (and the safety-net timeout).
  useEffect(() => {
    setIsNavigating(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => {
    document.documentElement.classList.toggle("pf-route-loading", isNavigating);
  }, [isNavigating]);

  // Belt-and-suspenders: never leave the cursor stuck in a loading state
  // across unmounts (e.g. hot reload in dev).
  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("pf-route-loading");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden",
        // Appearing must be instant (no fade-in delay) so feedback is truly
        // immediate; disappearing can still fade smoothly to avoid a flicker.
        isNavigating ? "opacity-100" : "opacity-0 transition-opacity duration-300"
      )}
    >
      <div className="progress-gradient h-full w-2/5 animate-pf-nav-progress shadow-brand-glow" />
    </div>
  );
}
