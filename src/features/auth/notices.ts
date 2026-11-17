/**
 * Messages the login page shows for the `?error=` code that the email-link routes add to the address.
 * - confirm: the link was opened but could not sign you in (usually a different browser from the one used
 *   to sign up). Supabase has already verified the email at that point, so logging in may just work.
 * - expired: the link has expired or was already used.
 */
const LOGIN_NOTICES: Readonly<Record<string, string>> = {
  confirm:
    "We could not finish that link here. If it was a confirmation link, your email may already be confirmed: try logging in. Otherwise request a new link.",
  expired: "That link has expired or was already used. Request a new one with Forgot password, or sign up again.",
};

/** The message for an error code, or undefined for no code or an unknown one (never a built-in object property). */
export function loginNotice(code: string | null | undefined): string | undefined {
  return code && Object.hasOwn(LOGIN_NOTICES, code) ? LOGIN_NOTICES[code] : undefined;
}
