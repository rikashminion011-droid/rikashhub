/**
 * Only allow redirects to a path on this same site (blocks open redirects such as
 * "//evil.com", "/\evil.com" or "https://evil.com" smuggled into a ?next= parameter).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/quick-pay"): string {
  if (!next) return fallback;
  try {
    const base = "http://local.invalid";
    const url = new URL(next, base);
    if (url.origin !== base || !next.startsWith("/")) return fallback;
    if (url.pathname === "/login" || url.pathname === "/signup") return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
