"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type UserProfile = Database["public"]["Tables"]["user_profile"]["Row"];

export interface UseUserResult {
  user: User | null;
  profile: UserProfile | null;
  role: "ADMIN" | "TEACHER" | "STUDENT" | null;
  isLoading: boolean;
}

type AppRole = UseUserResult["role"];

/**
 * Normalizes and validates a role string from the database.
 * Returns a valid role or null if invalid.
 */
function normalizeRole(role: string | null | undefined): AppRole {
  if (!role) return null;

  const normalized = role.trim().toUpperCase();

  if (normalized === "ADMIN" || normalized === "TEACHER" || normalized === "STUDENT") {
    return normalized as "ADMIN" | "TEACHER" | "STUDENT";
  }

  console.warn("[normalizeRole] Invalid role value:", role, "- using null");
  return null;
}

/**
 * Client-side hook to get current authenticated user and their profile
 */
export function useUser(): UseUserResult {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const loadProfile = async (currentUser: User) => {
      const { data, error } = await supabase.from("user_profile").select("*").eq("id", currentUser.id).maybeSingle();

      if (error) {
        console.error("[useUser] Error fetching user_profile:", error);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      if (!data) {
        console.warn("[useUser] No user_profile found for id:", currentUser.id, "| email:", currentUser.email);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      const resolvedProfile = data as UserProfile;
      const normalizedRole = normalizeRole(resolvedProfile.role);
      console.log("[useUser] Profile loaded:", {
        role: resolvedProfile.role,
        normalizedRole,
        full_name: resolvedProfile.full_name
      });

      setProfile(resolvedProfile);
      setIsLoading(false);
    };

    // Get initial session
    supabase.auth.getUser().then(async (result) => {
      const user = result.data.user;
      setUser(user);
      if (user) {
        await loadProfile(user);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event: string, session: any) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadProfile(session.user);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    profile,
    role: normalizeRole(profile?.role),
    isLoading
  };
}
