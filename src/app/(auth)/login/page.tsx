import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/brand-header";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Log in" };

/**
 * Deliberately does not read the request (no searchParams): that keeps this page static, so it is built
 * once and served from the cache instead of being rendered on a server for every visit. The `?next=`
 * destination and `?error=` notice are read in the browser by the form.
 */
export default function LoginPage() {
  return (
    <>
      <AuthHeading title="Welcome Back" subtitle="Log in to your personal hub" />
      <LoginForm />
    </>
  );
}
