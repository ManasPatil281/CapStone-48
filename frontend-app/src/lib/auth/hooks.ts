"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type UserProfile = Database["public"]["Tables"]["user_profile"]["Row"];

export interface UseUserResult {
  user: User | null;
  profile: UserProfile | null;
  role: "ADMIN" | "TEACHER" | "STUDENT" | null;
  isLoading: boolean;
  authError: string | null;
  retry: () => void;
  clearLocalState: () => void;
}

type AppRole = UseUserResult["role"];
const AUTH_TIMEOUT_MS = 10000;

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const promise = Promise.resolve(promiseLike);

    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

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
  const [authError, setAuthError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const requestIdRef = useRef(0);

  const clearLocalState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setAuthError(null);
    setIsLoading(false);
  }, []);

  const retry = useCallback(() => {
    setRefreshTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let isMounted = true;

    const applyIfCurrent = (requestId: number, apply: () => void) => {
      if (isMounted && requestIdRef.current === requestId) {
        apply();
      }
    };

    const loadProfile = async (currentUser: User, requestId: number) => {
      const profileResult = await withTimeout(
        supabase.from("user_profile").select("*").eq("id", currentUser.id).maybeSingle(),
        AUTH_TIMEOUT_MS,
        "Profile fetch"
      );
      const { data, error } = profileResult as { data: UserProfile | null; error: unknown };

      if (error) {
        console.error("[useUser] Error fetching user_profile:", error);
        applyIfCurrent(requestId, () => {
          setProfile(null);
          setAuthError("Unable to load your profile. You can retry or sign out.");
        });
        return;
      }

      if (!data) {
        console.warn("[useUser] No user_profile found for id:", currentUser.id, "| email:", currentUser.email);
        applyIfCurrent(requestId, () => {
          setProfile(null);
          setAuthError(null);
        });
        return;
      }

      const resolvedProfile = data as UserProfile;
      const normalizedRole = normalizeRole(resolvedProfile.role);
      console.log("[useUser] Profile loaded:", {
        role: resolvedProfile.role,
        normalizedRole,
        full_name: resolvedProfile.full_name
      });

      applyIfCurrent(requestId, () => {
        setProfile(resolvedProfile);
        setAuthError(null);
      });
    };

    const loadCurrentUser = async (nextUser?: User | null) => {
      const requestId = ++requestIdRef.current;
      applyIfCurrent(requestId, () => {
        setIsLoading(true);
        setAuthError(null);
      });

      try {
        let currentUser = nextUser;

        if (typeof currentUser === "undefined") {
          const result = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS, "Session fetch");

          if (result.error) {
            throw result.error;
          }

          currentUser = result.data.user;
        }

        applyIfCurrent(requestId, () => {
          setUser(currentUser ?? null);
        });

        if (currentUser) {
          await loadProfile(currentUser, requestId);
        } else {
          applyIfCurrent(requestId, () => {
            setProfile(null);
          });
        }
      } catch (error) {
        console.error("[useUser] Failed to load auth state:", error);
        const message = toErrorMessage(error, "Unable to load your session. You can retry or sign out.");

        applyIfCurrent(requestId, () => {
          setProfile(null);
          setAuthError(message);
        });
      } finally {
        applyIfCurrent(requestId, () => {
          setIsLoading(false);
        });
      }
    };

    void loadCurrentUser();

    // Listen for auth changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event: string, session: any) => {
      await loadCurrentUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [refreshTick]);

  return {
    user,
    profile,
    role: normalizeRole(profile?.role),
    isLoading,
    authError,
    retry,
    clearLocalState
  };
}
