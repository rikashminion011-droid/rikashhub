import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/** Paths reachable without a session. Cron endpoints authenticate themselves with CRON_SECRET. */
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/api/cron"];
const AUTH_PAGES = ["/login", "/signup"];

function matches(pathname: string, paths: readonly string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { response, isAuthenticated } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    const redirect = NextResponse.redirect(url);
    // Carry over any refreshed session cookies.
    for (const cookie of response().cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!isAuthenticated && !matches(pathname, PUBLIC_PATHS)) {
    return redirectTo("/login", pathname === "/" ? undefined : { next: `${pathname}${search}` });
  }
  if (isAuthenticated && matches(pathname, AUTH_PAGES)) {
    return redirectTo("/dashboard");
  }
  return response();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
