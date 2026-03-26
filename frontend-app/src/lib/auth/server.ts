import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { redirect } from "next/navigation";

type UserProfile = Database["public"]["Tables"]["user_profile"]["Row"];

export interface AuthUser {
  id: string;
  email: string;
  profile: UserProfile | null;
  role: "ADMIN" | "TEACHER" | "STUDENT" | null;
}

type AppRole = AuthUser["role"];

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

async function getUserProfileById(profileId: string): Promise<UserProfile | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.from("user_profile").select("*").eq("id", profileId).maybeSingle();

  if (error) {
    console.error("[getUserProfileById] Error fetching user_profile:", error);
    return null;
  }

  return data ?? null;
}

/**
 * Get the current authenticated user and their profile from server components
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Fetch user_profile where profile.id matches auth user id
  const profile = await getUserProfileById(user.id);

  if (!profile) {
    console.warn("[getCurrentUser] No user_profile found for id:", user.id, "| email:", user.email);
    console.warn("[getCurrentUser] User will have null profile and role. Profile should be created via admin/setup process.");
  } else {
    const normalizedRole = normalizeRole(profile.role);
    console.log("[getCurrentUser] Profile loaded:", {
      role: profile.role,
      normalizedRole,
      full_name: profile.full_name
    });
  }

  return {
    id: user.id,
    email: user.email ?? "",
    profile: profile ?? null,
    role: normalizeRole(profile?.role)
  };
}

/**
 * Require authentication for a page. Redirects to /sign-in if not authenticated.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}

/**
 * Require specific role(s) for a page. Redirects to /sign-in if not authenticated,
 * or to /dashboard if authenticated but missing required role.
 */
export async function requireRole(allowedRoles: Array<"ADMIN" | "TEACHER" | "STUDENT">): Promise<AuthUser> {
  const user = await requireAuth();

  if (!user.role || !allowedRoles.includes(user.role)) {
    redirect("/dashboard");
  }

  return user;
}
