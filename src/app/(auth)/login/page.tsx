import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/brand-header";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notice =
    params.error === "confirm"
      ? "That link is invalid or has expired. Log in, or request a new one."
      : undefined;

  return (
    <>
      <AuthHeading title="Welcome Back" subtitle="Log in to your personal hub" />
      <LoginForm next={next} notice={notice} />
    </>
  );
}
