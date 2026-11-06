/**
 * "Remember me" support. Supabase writes long-lived auth cookies. When the user did not tick
 * "Remember me" we mark the browser with a session-only cookie, and every place that writes
 * Supabase cookies strips their expiry so the sign-in ends when the browser is closed.
 */
export const SESSION_ONLY_COOKIE = "hub_session_only";

interface Lifetime {
  maxAge?: number;
  expires?: Date;
}

export function applySessionPreference<T extends Lifetime>(value: string, options: T, sessionOnly: boolean): T {
  if (!sessionOnly) return options;
  // Never touch deletions (sign-out): an empty value or non-positive max-age must still expire the cookie.
  const removing = value === "" || (options.maxAge !== undefined && options.maxAge <= 0);
  if (removing) return options;
  const adjusted = { ...options };
  delete adjusted.maxAge;
  delete adjusted.expires;
  return adjusted;
}
