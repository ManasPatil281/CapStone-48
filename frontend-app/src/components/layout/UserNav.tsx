"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/hooks";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
        <div className="h-8 w-32 animate-pulse rounded-full bg-slate-800" />
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
  const roleColor = role
    ? {
        ADMIN: "bg-red-500/20 text-red-300",
        TEACHER: "bg-blue-500/20 text-blue-300",
        STUDENT: "bg-green-500/20 text-green-300"
      }[role]
    : "bg-gray-500/20 text-gray-400";

  const roleLabel = role || "No Role";

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-300">{displayName}</span>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${roleColor}`}>{roleLabel}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={handleSignOut}>
        Sign Out
      </Button>
    </div>
  );
}
