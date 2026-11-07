import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/brand-header";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  // "confirm": the link was opened but could not sign you in (usually a different browser from the one
  // used to sign up). Supabase has already verified the email at that point, so logging in may just work.
  const notices: Record<string, string> = {
    confirm:
      "We could not finish that link here. If it was a confirmation link, your email may already be confirmed: try logging in. Otherwise request a new link.",
    expired:
      "That link has expired or was already used. Request a new one with Forgot password, or sign up again.",
  };
  const notice = typeof params.error === "string" ? notices[params.error] : undefined;

  return (
    <>
      <AuthHeading title="Welcome Back" subtitle="Log in to your personal hub" />
      <LoginForm next={next} notice={notice} />
    </>
  );
}
