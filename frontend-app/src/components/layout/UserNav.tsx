"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/hooks";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

const SIGN_OUT_TIMEOUT_MS = 10000;

async function signOutWithTimeout(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  timeoutMs: number
) {
  return await Promise.race([
    supabase.auth.signOut(),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`Sign out timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}

export function UserNav() {
  const { user, profile, role, isLoading, authError, retry, clearLocalState } = useUser();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Clear stale sign-out UI when a valid session is active again.
    if (user && !isLoading) {
      setIsSigningOut(false);
      setSignOutError(null);
    }
  }, [user?.id, isLoading]);

  const handleSignOut = async () => {
    if (!user || isSigningOut) {
      return;
    }

    setSignOutError(null);
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();

    try {
      const { error } = await signOutWithTimeout(supabase, SIGN_OUT_TIMEOUT_MS);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("[UserNav] Sign out failed:", error);
      if (mountedRef.current) {
        setSignOutError("Unable to sign out cleanly. Redirecting to sign in...");
      }
    } finally {
      clearLocalState();
      if (mountedRef.current) {
        setIsSigningOut(false);
      }
      router.replace("/sign-in");
      router.refresh();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-6 w-24 animate-pulse rounded-full bg-slate-800/80" />
        <div className="h-6 w-6 animate-pulse rounded-full bg-slate-800/80" />
      </div>
    );
  }

  if (authError && !user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden max-w-56 truncate text-[11px] text-amber-300 sm:inline">
          Session issue. Retry or sign out.
        </span>
        <Button variant="ghost" size="sm" onClick={retry} disabled={isSigningOut}>
          Retry
        </Button>
        <Button variant="secondary" size="sm" onClick={handleSignOut} disabled={isSigningOut || !user}>
          {isSigningOut ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <a href="/sign-in">Sign In</a>
        </Button>
        <Button asChild size="sm">
          <a href="/sign-up">Sign Up</a>
        </Button>
      </div>
    );
  }

  const displayName = profile?.full_name || user.email?.split("@")[0] || "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  const roleMeta = role
    ? ({
        ADMIN: {
          color: "bg-red-500/12 text-red-400 border-red-500/20",
          label: "Admin"
        },
        TEACHER: {
          color: "bg-violet-500/12 text-violet-400 border-violet-500/20",
          label: "Teacher"
        },
        STUDENT: {
          color: "bg-emerald-500/12 text-emerald-400 border-emerald-500/20",
          label: "Student"
        }
      } as const)[role]
    : { color: "bg-slate-700/40 text-slate-400 border-slate-600/30", label: "No Role" };

  return (
    <div className="flex items-center gap-2.5">
      {/* Identity block */}
      <div className="flex items-center gap-2.5">
        {/* Avatar */}
        <div className="flex h-7 w-7 select-none items-center justify-center rounded-full border border-brand/25 bg-brand/12 text-[10px] font-bold tracking-wide text-brand-muted">
          {initials}
        </div>

        {/* Name + role */}
        <div className="hidden flex-col items-start sm:flex">
          <span className="text-xs font-medium leading-tight text-slate-300">{displayName}</span>
          <span
            className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-label leading-none ${roleMeta.color}`}
          >
            {roleMeta.label}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-slate-800" />

      {authError && (
        <button
          onClick={retry}
          disabled={isSigningOut}
          className="hidden rounded-lg border border-amber-700/40 px-2 py-1 text-[10px] text-amber-300 transition-colors hover:bg-amber-900/25 sm:inline"
        >
          Profile issue - Retry
        </button>
      )}

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        disabled={isSigningOut || !user}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-slate-200"
        aria-label="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{isSigningOut ? "Signing out..." : "Sign out"}</span>
      </button>

      {signOutError && <span className="hidden text-[11px] text-amber-300 sm:inline">{signOutError}</span>}
    </div>
  );
}
