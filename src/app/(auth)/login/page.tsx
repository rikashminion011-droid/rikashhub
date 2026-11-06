import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notice =
    params.error === "confirm"
      ? "That confirmation link is invalid or has expired. Sign in, or create your account again to get a new link."
      : undefined;

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your finance dashboard.</p>
      </div>
      <LoginForm next={next} notice={notice} />
    </>
  );
}
