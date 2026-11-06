import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";
import { SESSION_ONLY_COOKIE, applySessionPreference } from "./session-cookies";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers (cookie-based session).
 * `sessionOnly` forces browser-session cookies (used by sign-in when "Remember me" is off);
 * by default it follows the session-only marker cookie.
 */
export async function createClient(settings: { sessionOnly?: boolean } = {}) {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseKey } = getPublicEnv();
  const sessionOnly = settings.sessionOnly ?? cookieStore.get(SESSION_ONLY_COOKIE)?.value === "1";

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, applySessionPreference(value, options, sessionOnly));
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
