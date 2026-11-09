import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  /** ISO timestamps from Supabase, shown on the User page. */
  createdAt: string | null;
  lastSignInAt: string | null;
}

/**
 * The signed-in user, verified with Supabase on the server (never trusts the cookie alone).
 * Memoised per request. This is the single source of identity for every data query.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const fullName = data.user.user_metadata?.full_name;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    name: typeof fullName === "string" && fullName.trim() ? fullName.trim() : null,
    createdAt: data.user.created_at ?? null,
    lastSignInAt: data.user.last_sign_in_at ?? null,
  };
});

/** Use at the top of every protected page, layout and server action. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
