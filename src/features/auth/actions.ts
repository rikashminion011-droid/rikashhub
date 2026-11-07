"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { RateLimiter } from "@/lib/security/rate-limit";
import { safeNextPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";
import { SESSION_ONLY_COOKIE } from "@/lib/supabase/session-cookies";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from "./schemas";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const loginLimiter = new RateLimiter(10, 15 * 60_000);
const signupLimiter = new RateLimiter(5, 60 * 60_000);
const resetLimiter = new RateLimiter(3, 60 * 60_000);

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function waitMessage(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** Validates on the server again: client-side validation is a convenience, never the guard. */
export async function login(input: unknown, next?: string | null): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email and password." };
  const { email, password, remember } = parsed.data;

  const limit = loginLimiter.check(`login:${await clientIp()}:${email}`);
  if (!limit.allowed) return { ok: false, error: waitMessage(limit.retryAfterSeconds) };

  // Without "Remember me" the auth cookies are written without an expiry (browser-session only).
  const supabase = await createClient({ sessionOnly: !remember });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { ok: false, error: "Confirm your email first: open the link we sent you, then sign in." };
    }
    // Same message for unknown email and wrong password, so accounts cannot be enumerated.
    return { ok: false, error: "Incorrect email or password." };
  }

  const jar = await cookies();
  if (remember) {
    jar.delete(SESSION_ONLY_COOKIE);
  } else {
    jar.set(SESSION_ONLY_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  redirect(safeNextPath(next));
}

export async function signup(input: unknown): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const limit = signupLimiter.check(`signup:${await clientIp()}`);
  if (!limit.allowed) return { ok: false, error: waitMessage(limit.retryAfterSeconds) };

  const { fullName, email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { ok: false, error: "That password is too easy to guess. Try a longer or less common one." };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { ok: false, error: "Too many emails were sent. Please wait a few minutes and try again." };
    }
    return { ok: false, error: "We could not create your account. Please try again." };
  }

  // Email confirmation off: the account is signed in straight away.
  if (data.session) redirect("/dashboard");

  // Email confirmation on. The same message is shown whether or not the address already exists.
  return {
    ok: true,
    message: `We sent a confirmation link to ${email}. Open it in this same browser, then log in. Check your spam folder if it does not arrive.`,
  };
}

/** Sends a password-reset email. The answer is identical whether or not the account exists. */
export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  const { email } = parsed.data;

  const limit = resetLimiter.check(`reset:${await clientIp()}:${email}`);
  if (!limit.allowed) return { ok: false, error: waitMessage(limit.retryAfterSeconds) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    return { ok: false, error: "Too many emails were sent. Please wait a few minutes and try again." };
  }

  return {
    ok: true,
    message: `If an account exists for ${email}, we have sent a link to reset the password. Open it in this same browser. Check your spam folder if it does not arrive.`,
  };
}

/** Sets a new password. Only works with the session created by the emailed reset link. */
export async function updatePassword(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "This reset link has expired. Request a new one." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { ok: false, error: "Choose a password you have not used before." };
    }
    if (error.code === "weak_password") {
      return { ok: false, error: "That password is too easy to guess. Try a longer or less common one." };
    }
    return { ok: false, error: "We could not update your password. Please try again." };
  }

  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(SESSION_ONLY_COOKIE);
  redirect("/login");
}
