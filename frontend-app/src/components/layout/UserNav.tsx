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
        <div className="h-6 w-24 animate-pulse rounded-full bg-slate-800/80" />
        <div className="h-6 w-6 animate-pulse rounded-full bg-slate-800/80" />
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

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-slate-200"
        aria-label="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </div>
  );
}
