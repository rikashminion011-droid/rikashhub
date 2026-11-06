import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie on every request and reports whether the visitor
 * holds a valid session. This is an optimistic check for redirects only: authorisation
 * decisions are made again on the server with `getCurrentUser()` (which verifies with Supabase).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { supabaseUrl, supabaseKey } = getPublicEnv();

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  let isAuthenticated = false;
  try {
    const { data } = await supabase.auth.getClaims();
    isAuthenticated = Boolean(data?.claims);
  } catch {
    isAuthenticated = false;
  }

  return { response: () => response, isAuthenticated };
}
