import { cookies } from "next/headers";
import { createServerComponentClient, type SupabaseClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/database";

export function createSupabaseServerClient(): SupabaseClient<Database> {
  const cookieStore = cookies();
  return createServerComponentClient<Database>({ cookies: () => cookieStore });
}
