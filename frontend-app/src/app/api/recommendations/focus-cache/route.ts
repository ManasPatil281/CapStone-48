/**
 * POST /api/recommendations/focus-cache — write-back endpoint for the
 * Focus card session cache (src/lib/recommendations/focusCache.ts).
 *
 * Called (fire-and-forget) by a small client component after the page
 * computed a FRESH Focus card, so the next page load in the same browser
 * session can skip the Diagnostic Agent + Pedagogical Planner entirely if
 * nothing relevant changed. Never called on a cache hit.
 *
 * Auth-checked like every other agent route; the cached payload is
 * shape-validated (not the authenticated user's identity — that comes
 * from the session) before being written to a short-lived, httpOnly
 * cookie. No database write.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FOCUS_CACHE_COOKIE, FOCUS_CACHE_MAX_AGE_SECONDS } from "@/lib/recommendations/focusCache";

// Stay safely under the ~4KB per-cookie limit.
const MAX_COOKIE_BYTES = 3500;

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabaseAny.from("user_profile").select("role").eq("id", user.id).maybeSingle();
    if (String(profile?.role ?? "").toUpperCase() !== "STUDENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { submissionId, fingerprint, view } = body ?? {};

    if (
      typeof submissionId !== "string" ||
      typeof fingerprint !== "string" ||
      !view ||
      typeof view !== "object" ||
      view.submissionId !== submissionId ||
      view.fingerprint !== fingerprint
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const serialized = JSON.stringify(view);
    if (serialized.length > MAX_COOKIE_BYTES) {
      // Too large to cache safely in a cookie — silently skip, not an error.
      return NextResponse.json({ cached: false });
    }

    cookies().set(FOCUS_CACHE_COOKIE, serialized, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: FOCUS_CACHE_MAX_AGE_SECONDS,
      path: "/recommendations",
    });

    return NextResponse.json({ cached: true });
  } catch (error) {
    console.error("[api/recommendations/focus-cache] Unexpected error:", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
