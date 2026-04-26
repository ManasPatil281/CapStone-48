"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/hooks";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ChevronDown, LogOut } from "lucide-react";

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
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleOutsidePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!dropdownRef.current || !(target instanceof Node)) {
        return;
      }

      if (!dropdownRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("touchstart", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("touchstart", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  const handleMenuNavigate = (
    href: "/profile" | "/recommendations" | "/dashboard" | "/teacher"
  ) => {
    setIsMenuOpen(false);
    router.push(href as Route);
  };

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

  const dashboardHref = role === "TEACHER" ? "/teacher" : "/dashboard";

  return (
    <div className="flex items-center gap-2.5">
      {authError && (
        <button
          onClick={retry}
          disabled={isSigningOut}
          className="hidden rounded-lg border border-amber-700/40 px-2 py-1 text-[10px] text-amber-300 transition-colors hover:bg-amber-900/25 sm:inline"
        >
          Profile issue - Retry
        </button>
      )}

      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setIsMenuOpen((prev) => !prev);
          }}
          className="group flex items-center gap-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 px-2.5 py-1.5 text-left transition-colors hover:border-slate-700 hover:bg-slate-900"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label="Open user menu"
        >
          <div className="flex h-7 w-7 select-none items-center justify-center rounded-full border border-brand/25 bg-brand/12 text-[10px] font-bold tracking-wide text-brand-muted">
            {initials}
          </div>

          <div className="hidden min-w-0 flex-col items-start sm:flex">
            <span className="max-w-40 truncate text-xs font-medium leading-tight text-slate-300">
              {displayName}
            </span>
            <span
              className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-label leading-none ${roleMeta.color}`}
            >
              {roleMeta.label}
            </span>
          </div>

          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-500 transition-transform group-hover:text-slate-300 ${
              isMenuOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isMenuOpen && (
          <div
            role="menu"
            aria-label="User options"
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/95 p-1.5 shadow-[0_16px_38px_rgba(2,6,23,0.55)] backdrop-blur-sm"
          >
            <button
              type="button"
              onClick={() => {
                handleMenuNavigate("/profile");
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800/70"
              role="menuitem"
            >
              My profile
            </button>

            <button
              type="button"
              onClick={() => {
                handleMenuNavigate("/recommendations");
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800/70"
              role="menuitem"
            >
              Recommendations
            </button>

            <button
              type="button"
              onClick={() => {
                handleMenuNavigate(dashboardHref);
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800/70"
              role="menuitem"
            >
              Dashboard
            </button>

            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center rounded-lg px-3 py-2 text-left text-sm text-slate-500"
              role="menuitem"
              aria-disabled="true"
            >
              Settings
              <span className="ml-2 text-[10px] uppercase tracking-label text-slate-600">Coming soon</span>
            </button>

            <div className="my-1 h-px bg-slate-800" />

            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                void handleSignOut();
              }}
              disabled={isSigningOut || !user}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition-colors hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-60"
              role="menuitem"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        )}
      </div>

      {signOutError && <span className="hidden text-[11px] text-amber-300 sm:inline">{signOutError}</span>}
    </div>
  );
}
