"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/hooks";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

export function UserNav() {
  const { user, profile, role, isLoading } = useUser();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-7 w-28 animate-pulse rounded-full bg-slate-800" />
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

  const roleColor = role
    ? {
        ADMIN: "bg-red-500/15 text-red-400 border-red-500/25",
        TEACHER: "bg-blue-500/15 text-blue-400 border-blue-500/25",
        STUDENT: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
      }[role]
    : "bg-slate-700/40 text-slate-400 border-slate-600/30";

  const roleLabel = role || "No Role";

  return (
    <div className="flex items-center gap-3">
      {/* Identity */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 select-none items-center justify-center rounded-full border border-brand/30 bg-brand/15 text-[10px] font-bold text-brand-muted">
          {initials}
        </div>
        <span className="hidden text-xs font-medium text-slate-300 sm:inline">{displayName}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleColor}`}>
          {roleLabel}
        </span>
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-slate-700/80" />

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        aria-label="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sign Out</span>
      </button>
    </div>
  );
}
